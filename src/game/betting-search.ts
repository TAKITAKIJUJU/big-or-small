import {
  effectiveCap, getLegalActions, other,
  type BetAction, type BettingPosition, type PlayerView,
} from "./engine";
import { analyseOpponent, analysePlayer, equity, type CardBelief, type OpponentModel } from "./opponent-model";

import { matchRules } from "./stakes";
const N = 13;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 金額だけを抽象化。端数、上限、最小増額は必ずエンジンから取る。 */
export function searchActions(position: BettingPosition, pot: number): BetAction[] {
  const legal = getLegalActions(position, position.turn),
    plain = legal.filter(a => !("total" in a)),
    bets = legal.filter((a): a is Extract<BetAction, { total: number }> => "total" in a);
  if (!bets.length) return plain;
  const target = Math.max(position.contributions.human, position.contributions.bot),
    indices = new Set([0, bets.length - 1]);
  for (const amount of [target + pot / 2, target + pot]) {
    let best = 0;
    for (let i = 1; i < bets.length; i++)
      if (Math.abs(bets[i].total - amount) < Math.abs(bets[best].total - amount)) best = i;
    indices.add(best);
  }
  return [...plain, ...[...indices].sort((a, b) => a - b).map(i => bets[i])];
}

interface Position extends BettingPosition { pot: number; checks: number }
interface Node {
  player: 0 | 1;
  actions: BetAction[];
  children: Node[];
  regrets: Float64Array;
  sum: Float64Array;
  strategy: Float64Array;
  fixed: Float64Array;
  reach: Float64Array;
  value0: Float64Array;
  value1: Float64Array;
  // ショーダウン時の「自分が勝つ／負ける／同数」の残額。foldは全部同じ。
  amounts: number[] | null;
}
export interface SearchOption {
  action: BetAction;
  probability: number;
  score: number;
  chipEV: number;
  equity: number;
  foldChance: number;
}
export interface SearchResult {
  options: SearchOption[];
  stats: { iterations: number; nodes: number; maxDepth: number; modelWeight: number };
}

/** 相手の「今後」の行動モデル。自分の実札ではなく公開された自分の範囲と比較。 */
function responsePolicy(
  s: Position, actions: BetAction[], model: OpponentModel,
  publicOwn: CardBelief[], view: PlayerView,
): Float64Array {
  const policy = new Float64Array(N * actions.length),
    enemy = other(view.viewer), cap = Math.max(1, effectiveCap(s)),
    due = Math.max(s.contributions.human, s.contributions.bot) - s.contributions[enemy],
    price = due / (s.pot + due),
    size = Math.max(s.contributions.human, s.contributions.bot) / cap,
    foldRate = model.foldSmall * (1 - size) + model.foldLarge * size,
    image = (0.25 - model.ownBluffImage) * Math.min(1, (model.ownShownBluffs + model.ownShownValue) / 3);
  // 札の強弱による相対差を保ち、全体の降りる率を実際の観測へ校正する。
  const strengths = Array.from({ length: N }, (_, c) => equity(c + 1, view.mode!, publicOwn));
  let lo = -12, hi = 12;
  const targetFold = clamp(foldRate + (price - 0.25) * 0.45 + image * 0.25, 0.02, 0.95);
  for (let step = 0; step < 16; step++) {
    const bias = (lo + hi) / 2,
      predicted = model.range.reduce((s, c) => s + c.probability * (strengths[c.card - 1].lose < 1e-10 ? 0 : sigmoid((price + 0.1 - strengths[c.card - 1].equity) * 11 + bias)), 0);
    if (predicted < targetFold) lo = bias; else hi = bias;
  }
  for (let card = 1; card <= N; card++) {
    const p = strengths[card - 1], strength = p.equity,
      polar = strength > 0.72 ? strength ** 3 : (1 - strength) ** 4 * model.bluffRate,
      fold = p.lose < 1e-10 ? 0 : clamp(sigmoid((price + 0.1 - strength) * 11 + (lo + hi) / 2), 0.01, 0.98),
      attack = clamp(model.aggression * (0.25 + 1.65 * polar) * (due ? 0.7 : 1) - model.trapRate * strength ** 5 * (due ? 0 : 0.5), 0.01, 0.94),
      weights = actions.map(a => {
        if (!("total" in a)) return 0;
        const fraction = a.total / cap,
          preferred = strength > 0.78 || strength < 0.27 ? 0.85 : model.averageBetFraction;
        return 0.05 + Math.exp(-((fraction - preferred) ** 2) / 0.18);
      }), sum = weights.reduce((a, b) => a + b, 0),
      aggressive = sum ? attack * (due ? 1 - fold : 1) : 0;
    actions.forEach((a, k) => {
      policy[(card - 1) * actions.length + k] =
        a.type === "fold" ? fold : a.type === "call" ? 1 - fold - aggressive :
          a.type === "check" ? 1 - aggressive : (aggressive * weights[k]) / sum;
    });
  }
  return policy;
}

/**
 * 公開された賭けの木をCFR+で解く。各公開節点の戦略は自分の札だけで索引する。
 * 仮説の相手札を見て自分の応答を別々に最適化する「透視探索」は行わない。
 * 相手戦略の一部を観測モデルに固定し、残りを対抗最適化する制約付きゲーム。
 */
export function solveBetting(view: PlayerView, iterations = 128): SearchResult {
  if (view.phase !== "betting" || !view.legal.length || view.ownCard === null || view.mode === null)
    throw new Error("ベッティング中の公開ビューが必要です");
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 512)
    throw new Error("探索回数が範囲外です");
  const model = analyseOpponent(view), publicOwn = analysePlayer(view, view.viewer).range,
    own = view.viewer, enemy = other(own),
    range0 = Float64Array.from(publicOwn, c => c.probability),
    range1 = Float64Array.from(model.range, c => c.probability),
    evidence = model.sampleSize + model.shownBets,
    modelWeight = 0.15 + 0.55 * evidence / (evidence + 5),
    stats = { iterations, nodes: 0, maxDepth: 0, modelWeight };
  const { initialStack: initial, roundLimit } = matchRules(view.ruleset);
  const utility = (amount: number) => {
    if (view.round === roundLimit || amount === 0 || amount === initial * 2)
      return Math.sign(amount - initial) * initial + (amount - initial) * 0.015;
    return amount - initial + initial * (80 / 300) * (view.round / roundLimit) ** 3 * Math.tanh((amount - initial) / (initial / 3));
  };
  function build(s: Position, depth: number, amounts: number[] | null = null): Node {
    stats.nodes++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    const actions = amounts ? [] : searchActions(s, s.pot),
      player = s.turn === own ? 0 : 1,
      length = N * actions.length,
      node: Node = {
        player, actions, children: [], amounts,
        regrets: new Float64Array(length), sum: new Float64Array(length),
        strategy: new Float64Array(length),
        fixed: player === 1 && !amounts ? responsePolicy(s, actions, model, publicOwn, view) : new Float64Array(0),
        reach: new Float64Array(N), value0: new Float64Array(N), value1: new Float64Array(N),
      };
    if (amounts) return node;
    node.children = actions.map(action => {
      const next: Position = { ...s, chips: { ...s.chips }, contributions: { ...s.contributions } },
        p = s.turn, target = Math.max(s.contributions.human, s.contributions.bot),
        paid = action.type === "call" ? target - s.contributions[p] : "total" in action ? action.total - s.contributions[p] : 0;
      next.chips[p] -= paid;
      next.contributions[p] += paid;
      next.pot += paid;
      if (action.type === "fold") {
        const matched = Math.min(next.contributions.human, next.contributions.bot),
          refund = next.contributions[own] - matched,
          matchedPot = next.pot - next.contributions.human - next.contributions.bot + matched * 2,
          amount = next.chips[own] + refund + (p === enemy ? matchedPot : 0);
        return build(next, depth + 1, [amount, amount, amount]);
      }
      // openの同数は追加分を返して参加料を持ち越す。
      // その継続価値は未決着プールの1/2と近似するので、評価上の同数額は同じ。
      // エンジンの実際の精算・残チップは必ず別に保持する。
      if (action.type === "call" || (action.type === "check" && s.checks === 1))
        return build(next, depth + 1, [next.chips[own] + next.pot, next.chips[own], next.chips[own] + next.pot / 2]);
      next.checks = action.type === "check" ? s.checks + 1 : 0;
      if (action.type === "raise") next.raises++;
      next.turn = other(p);
      return build(next, depth + 1);
    });
    return node;
  }
  const root = build({
    phase: "betting", turn: own, chips: { ...view.chips }, contributions: { ...view.contributions },
    betLimit: view.betLimit, raises: view.raises, allIn: view.allIn, ruleset: view.ruleset,
    pot: view.pot, checks: view.actions.at(-1)?.action.type === "check" ? 1 : 0,
  }, 0);

  let chipValues = false;
  function terminal(node: Node, reach0: Float64Array, reach1: Float64Array) {
    const amounts = node.amounts!,
      win = chipValues ? amounts[0] : utility(amounts[0]),
      lose = chipValues ? amounts[1] : utility(amounts[1]),
      tie = chipValues ? amounts[2] : utility(amounts[2]),
      total0 = reach0.reduce((a, b) => a + b, 0), total1 = reach1.reduce((a, b) => a + b, 0);
    let lower0 = 0, lower1 = 0;
    for (let i = 0; i < N; i++) {
      const higher0 = Math.max(0, total0 - lower0 - reach0[i]),
        higher1 = Math.max(0, total1 - lower1 - reach1[i]),
        win0 = view.mode === "BIG" ? lower1 : higher1,
        lose0 = view.mode === "BIG" ? higher1 : lower1,
        win1 = view.mode === "BIG" ? lower0 : higher0,
        lose1 = view.mode === "BIG" ? higher0 : lower0;
      node.value0[i] = win0 * win + lose0 * lose + reach1[i] * tie;
      node.value1[i] = -(win1 * lose + lose1 * win + reach0[i] * tie);
      lower0 += reach0[i]; lower1 += reach1[i];
    }
  }
  function walk(node: Node, reach0: Float64Array, reach1: Float64Array, iteration: number) {
    if (node.amounts) { terminal(node, reach0, reach1); return; }
    const count = node.actions.length, reach = node.player === 0 ? reach0 : reach1;
    if (iteration) {
      for (let c = 0; c < N; c++) {
        const offset = c * count;
        let total = 0;
        for (let a = 0; a < count; a++) total += node.regrets[offset + a];
        for (let a = 0; a < count; a++) {
          const i = offset + a, base = total ? node.regrets[i] / total : 1 / count,
            strategy = node.player === 1 ? (1 - modelWeight) * base + modelWeight * node.fixed[i] : base;
          node.strategy[i] = strategy;
          if (iteration > 16) node.sum[i] += (iteration - 16) * reach[c] * strategy;
        }
      }
    }
    node.value0.fill(0); node.value1.fill(0);
    for (let a = 0; a < count; a++) {
      const child = node.children[a];
      for (let c = 0; c < N; c++) child.reach[c] = reach[c] * node.strategy[c * count + a];
      walk(child, node.player === 0 ? child.reach : reach0, node.player === 1 ? child.reach : reach1, iteration);
      for (let c = 0; c < N; c++) {
        node.value0[c] += child.value0[c] * (node.player === 0 ? node.strategy[c * count + a] : 1);
        node.value1[c] += child.value1[c] * (node.player === 1 ? node.strategy[c * count + a] : 1);
      }
    }
    if (iteration) {
      const values = node.player === 0 ? node.value0 : node.value1;
      for (let c = 0; c < N; c++) {
        let fixedValue = 0;
        if (node.player === 1)
          for (let a = 0; a < count; a++) fixedValue += node.fixed[c * count + a] * node.children[a].value1[c];
        for (let a = 0; a < count; a++) {
          const childValues = node.player === 0 ? node.children[a].value0 : node.children[a].value1,
            regret = node.player === 1
              ? (1 - modelWeight) * childValues[c] - values[c] + modelWeight * fixedValue
              : childValues[c] - values[c];
          const i = c * count + a;
          node.regrets[i] = Math.max(0, node.regrets[i] + regret);
        }
      }
    }
  }
  for (let i = 1; i <= iterations; i++) walk(root, range0, range1, i);
  function average(node: Node) {
    const count = node.actions.length;
    for (let c = 0; c < N; c++) {
      let total = 0;
      for (let a = 0; a < count; a++) total += node.sum[c * count + a];
      for (let a = 0; a < count; a++) {
        const i = c * count + a;
        if (total) node.strategy[i] = node.sum[i] / total;
      }
    }
    node.children.forEach(average);
  }
  average(root);
  walk(root, range0, range1, 0);
  const card = view.ownCard - 1,
    scores = root.children.map(n => n.value0[card] - utility(view.chips[own]));
  chipValues = true;
  walk(root, range0, range1, 0);
  const p = equity(view.ownCard, view.mode, model.range),
    options = root.actions.map((action, a) => {
      const child = root.children[a], foldIndex = child.actions.findIndex(x => x.type === "fold"),
        foldChance = child.player === 1 && foldIndex >= 0 ? model.range.reduce((s, c) => s + c.probability * child.strategy[(c.card - 1) * child.actions.length + foldIndex], 0) : 0;
      return {
        action, score: scores[a], chipEV: child.value0[card] - view.chips[own],
        equity: p.equity, foldChance,
        probability: action.type === "fold" && p.lose < 1e-10 ? 0 : root.strategy[card * root.actions.length + a],
      };
    });
  const total = options.reduce((s, o) => s + o.probability, 0);
  options.forEach(o => o.probability /= total);
  return { options, stats };
}
