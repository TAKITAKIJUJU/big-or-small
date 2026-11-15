import {
  other,
  type BetAction,
  type Difficulty,
  type PlayerView,
} from "./engine";
import { getRoundStakes, isOpenRuleset, matchRules } from "./stakes";
import { solveBetting } from "./betting-search";
import {
  analyseOpponent,
  equity,
  rankStrength,
  type CardBelief,
  type OpponentModel,
} from "./opponent-model";
export type BotReason =
  | "reserve"
  | "use-now"
  | "mixed-card"
  | "value"
  | "bluff"
  | "trap"
  | "bluff-catch"
  | "pot-control"
  | "fold"
  | "protect-lead"
  | "value-after-bluff"
  | "bluff-after-value"
  | "check-raise"
  | "re-raise";
export interface BotLog {
  round: number;
  kind: "card" | "bet";
  reason: BotReason;
}
export const REASON_TEXT: Record<BotReason, string> = {
  reserve: "今の勝負と残りの回を比べ、別の勝負に使う札を残した。",
  "use-now": "残りチップと今の賭け金を見て、強く張れる札をここで使った。",
  "mixed-card":
    "残りの札と今後の参加料を比べ、選択が固定されないよう候補を混ぜた。",
  value: "相手に受けてもらったときの利益を見込み、賭けた。",
  bluff: "降りる傾向と必要額を見て、弱めと推定した札でも賭けた。",
  trap: "相手が賭ける傾向を見て、強い札でチェックし、次の賭けを待った。",
  "bluff-catch": "大きいベットにも弱いブラフが残ると見積もり、コールした。",
  "pot-control": "札の推定勝率と必要額を比べ、賭け金を抑えた。",
  fold: "受ける額に対する見返りが小さいと見積もり、降りた。",
  "protect-lead": "最終回のチップ差を見て、勝ちを残せる方を選んだ。",
  "value-after-bluff":
    "以前に見せたブラフで受けられやすいと見て、今度は強い札で賭けた。",
  "bluff-after-value":
    "強い札を見せた履歴と相手の降り方を見て、今度はブラフで賭けた。",
  "check-raise": "先にチェックした後のベットへ、コールや再レイズも見込んでレイズを返した。",
  "re-raise": "相手のレイズへさらに返し、降りる場合と最後まで受ける場合を比べた。",
};
export interface CardOption {
  card: number;
  score: number;
  probability: number;
}
export interface ActionOption {
  action: BetAction;
  score: number;
  chipEV: number;
  equity: number;
  foldChance: number;
  probability: number;
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
function softmax(scores: number[], temperature: number, mix = 0) {
  const max = Math.max(...scores),
    weights = scores.map((x) =>
      Math.exp(Math.max(-60, (x - max) / temperature)),
    ),
    sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => ((1 - mix) * w) / sum + mix / weights.length);
}
function sample<T extends { probability: number }>(
  options: T[],
  rng: () => number,
) {
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
    throw new Error("乱数が範囲外です");
  let sum = 0;
  for (const option of options) {
    sum += option.probability;
    if (roll < sum) return option;
  }
  return options[options.length - 1];
}
const power = (card: number, range: CardBelief[]) =>
  Math.abs(equity(card, "BIG", range).equity - 0.5) * 2;
/** 公開モードでの今回の価値と、残す札の機会価値を全候補で比較する。 */
export function cardPolicy(
  view: PlayerView,
  difficulty: Difficulty,
): CardOption[] {
  if (
    view.phase !== "selecting" ||
    view.ownCard !== null ||
    view.hand.length === 0
  )
    throw new Error("選札のタイミングではありません");
  const model = analyseOpponent(view),
    own = view.chips[view.viewer] + view.ante,
    enemy = view.chips[other(view.viewer)] + view.ante;
  const slots = Array.from({ length: matchRules(view.ruleset).roundLimit + 1 - view.round }, (_, offset) => {
    const r = view.round + offset,
      stakes = getRoundStakes(r, view.ruleset, view.allIn);
    return (
      (stakes.scheduledAnte +
        Math.min(stakes.betLimit ?? matchRules(view.ruleset).initialStack, own, enemy) * 0.65) *
      0.96 ** offset
    );
  });
  const remainingPower = view.hand.map((card) => ({
    card,
    value: power(card, model.range) ** 1.5,
  }));
  const nextFee = view.nextScheduledAnte ?? view.ante,
    survival = clamp(own / Math.max(1, nextFee * 4), 0.05, 1);
  const ahead = own >= enemy;
  const futureFactor = survival * (ahead ? 0.96 : 0.86);
  const options = remainingPower.map(({ card, value }) => {
    const remaining = remainingPower
        .filter((x) => x.card !== card)
        .map((x) => x.value)
        .sort((a, b) => b - a)
        .slice(0, slots.length - 1)
        .sort((a, b) => a - b),
      future = [...slots.slice(1)].sort((a, b) => a - b);
    const distribution = view.mode ? equity(card, view.mode, model.range) : null;
    const immediate = isOpenRuleset(view.ruleset) && distribution
      ? (distribution.win - distribution.lose) * (view.pot + Math.min(own, enemy) * 0.35)
      : slots[0] * value;
    const score =
      immediate +
      futureFactor *
        remaining.reduce((sum, v, i) => sum + v * (future[i] ?? 0), 0);
    return { card, score, probability: 0 };
  });
  const probs = softmax(
    options.map((x) => x.score),
    Math.max(
      1.5,
      slots[0] *
        (difficulty === "hard" ? 0.1 : difficulty === "medium" ? 0.26 : 0.65),
    ),
    difficulty === "hard" ? 0.08 : difficulty === "medium" ? 0.22 : 0.55,
  );
  return options.map((x, i) => ({ ...x, probability: probs[i] }));
}
export function decideCard(
  view: PlayerView,
  difficulty: Difficulty,
  rng: () => number,
) {
  const options = cardPolicy(view, difficulty),
    chosen = sample(options, rng),
    poles = view.hand.map((c) => Math.abs(c - 7));
  const reserved =
    options.some((x) => Math.abs(x.card - 7) > Math.abs(chosen.card - 7)) &&
    view.round < 11;
  let reason: BotReason = reserved
    ? "reserve"
    : Math.abs(chosen.card - 7) >= Math.max(...poles) && view.round > 5
      ? "use-now"
      : "mixed-card";
  if (isOpenRuleset(view.ruleset) && view.mode) {
    const strength = equity(chosen.card, view.mode, analyseOpponent(view).range).equity;
    reason = strength >= 0.65 ? "use-now" : reserved ? "reserve" : "mixed-card";
  }
  return {
    card: chosen.card,
    log: { round: view.round, kind: "card" as const, reason },
  };
}
export const chooseCard = (
  view: PlayerView,
  difficulty: Difficulty,
  rng: () => number,
) => decideCard(view, difficulty, rng).card;
export function estimateStrength(view: PlayerView) {
  if (view.ownCard === null || view.mode === null) return 0.5;
  return equity(view.ownCard, view.mode, analyseOpponent(view).range).equity;
}
function reducedActions(view: PlayerView) {
  const plain = view.legal.filter((a) => !("total" in a)),
    bets = view.legal.filter(
      (a): a is Extract<BetAction, { total: number }> => "total" in a,
    );
  if (!bets.length) return plain;
  const indices = new Set([
    0,
    Math.floor((bets.length - 1) * 0.25),
    Math.floor((bets.length - 1) * 0.5),
    Math.floor((bets.length - 1) * 0.75),
    bets.length - 1,
  ]);
  const nearest = bets.reduce(
    (best, a, i) =>
      Math.abs(a.total - view.pot) < Math.abs(bets[best].total - view.pot)
        ? i
        : best,
    0,
  );
  indices.add(nearest);
  return [...plain, ...[...indices].sort((a, b) => a - b).map((i) => bets[i])];
}
function responseRange(
  view: PlayerView,
  model: OpponentModel,
  total: number,
  cap: number,
) {
  const size = clamp(total / Math.max(1, cap), 0, 1);
  let sum = 0;
  const range = model.range.map((c) => {
    const s = rankStrength(c.card, view.mode!);
    const call = clamp(
      0.06 + model.callRate * 0.45 + s ** (1.4 + size) * 0.65,
      0.02,
      1,
    );
    const probability = c.probability * call;
    sum += probability;
    return { card: c.card, probability };
  });
  return range.map((c) => ({ ...c, probability: c.probability / sum }));
}
function foldEstimate(
  view: PlayerView,
  model: OpponentModel,
  total: number,
  cap: number,
) {
  const size = clamp(total / Math.max(1, cap), 0, 1),
    empirical = model.foldSmall * (1 - size) + model.foldLarge * size;
  const rangeWeakness = model.range.reduce(
    (s, c) =>
      s + c.probability * (1 - rankStrength(c.card, view.mode!)) ** 1.25,
    0,
  );
  const imageEvidence = Math.min(
      1,
      (model.ownShownBluffs + model.ownShownValue) / 3,
    ),
    image = (0.25 - model.ownBluffImage) * imageEvidence * 0.5;
  const alreadyBet = view.actions.some(
    (a) => a.player === other(view.viewer) && "total" in a.action,
  );
  return clamp(
    empirical * 0.65 +
      rangeWeakness * 0.35 +
      size * 0.12 +
      image -
      (alreadyBet ? 0.1 : 0),
    0.02,
    0.92,
  );
}
export function actionPolicy(
  view: PlayerView,
  difficulty: Difficulty,
): ActionOption[] {
  if (!view.legal.length || view.ownCard === null || view.mode === null)
    throw new Error("合法手がありません");
  if (difficulty === "hard") return solveBetting(view).options;
  const model = analyseOpponent(view),
    p = equity(view.ownCard, view.mode, model.range),
    own = view.viewer,
    enemy = other(own);
  const cap = Math.min(
      view.betLimit ?? matchRules(view.ruleset).initialStack * 2,
      view.chips.human + view.contributions.human,
      view.chips.bot + view.contributions.bot,
    ),
    chips = view.chips[own];
  const behind =
    chips + view.contributions[own] <
    view.chips[enemy] + view.contributions[enemy];
  const urgency = (view.round / matchRules(view.ruleset).roundLimit) ** 3;
  const utility = (amount: number) =>
    view.round === matchRules(view.ruleset).roundLimit
      ? matchRules(view.ruleset).initialStack * 2 * (amount > matchRules(view.ruleset).initialStack ? 1 : amount === matchRules(view.ruleset).initialStack ? 0.5 : 0) + amount * 0.015
      : amount +
        ((behind ? 0.25 : -0.18) * urgency * (amount - chips) ** 2) / matchRules(view.ruleset).initialStack;
  const baseline = utility(chips);
  const outcome = (win: number, lose: number, tie: number, distribution = p) =>
    distribution.win * utility(win) +
    distribution.lose * utility(lose) +
    distribution.tie * utility(tie) -
    baseline;
  const actions = reducedActions(view).filter(
    (a) => a.type !== "fold" || p.lose > 1e-10,
  );
  const options = actions.map((action) => {
    let score = 0,
      chipEV = 0,
      calledEquity = p.equity,
      foldChance = 0;
    if (action.type === "call") {
      const due = view.contributions[enemy] - view.contributions[own],
        pot = view.pot + due;
      chipEV = p.equity * pot - due;
      score = outcome(chips - due + pot, chips - due, chips - due + pot / 2);
    } else if (action.type === "check") {
      const future = Math.min(
        cap - view.contributions[own],
        cap - view.contributions[enemy],
        Math.max(2, Math.round((cap * model.averageBetFraction) / 2) * 2),
      );
      const base = outcome(chips + view.pot, chips, chips + view.pot / 2);
      const bet = outcome(
        chips - future + view.pot + 2 * future,
        chips - future,
        chips + view.pot / 2,
      );
      score =
        (1 - model.aggression) * base + model.aggression * Math.max(0, bet);
      chipEV =
        (1 - model.aggression) * p.equity * view.pot +
        model.aggression *
          Math.max(0, p.equity * (view.pot + 2 * future) - future);
    } else if ("total" in action) {
      const paid = action.total - view.contributions[own],
        call = action.total - view.contributions[enemy],
        pot = view.pot + paid + call;
      const called = equity(
        view.ownCard!,
        view.mode!,
        responseRange(view, model, action.total, cap),
      );
      calledEquity = called.equity;
      foldChance = foldEstimate(view, model, action.total, cap);
      score =
        foldChance * (utility(chips + view.pot) - baseline) +
        (1 - foldChance) *
          outcome(
            chips - paid + pot,
            chips - paid,
            chips - paid + pot / 2,
            called,
          );
      chipEV =
        foldChance * view.pot + (1 - foldChance) * (called.equity * pot - paid);
    }
    return {
      action,
      score,
      chipEV,
      equity: calledEquity,
      foldChance,
      probability: 0,
    };
  });
  // 乱数は評価後の近い候補を混ぜるため。明らかに損な手を一様には選ばない。
  const best = Math.max(...options.map((x) => x.score)),
    temperature = Math.max(
      0.8,
      (view.ante + cap * 0.07) *
        (difficulty === "medium" ? 0.42 : 0.95),
    );
  const regret =
    difficulty === "medium"
        ? temperature * 5
        : temperature * 9;
  const eligible = options.filter((x) => x.score >= best - regret),
    probs = softmax(
      eligible.map((x) => x.score),
      temperature,
    );
  return eligible.map((x, i) => ({ ...x, probability: probs[i] }));
}
export function decideAction(
  view: PlayerView,
  difficulty: Difficulty,
  rng: () => number,
) {
  const chosen = sample(actionPolicy(view, difficulty), rng),
    model = analyseOpponent(view),
    strength = equity(view.ownCard!, view.mode!, model.range).equity;
  let reason: BotReason = "pot-control";
  if (chosen.action.type === "fold")
    reason =
      view.round === matchRules(view.ruleset).roundLimit && view.chips[view.viewer] > matchRules(view.ruleset).initialStack
        ? "protect-lead"
        : "fold";
  else if (
    chosen.action.type === "check" &&
    view.actions.at(-1)?.action.type !== "check" &&
    strength >= 0.7 &&
    model.aggression >= 0.35
  )
    reason = "trap";
  else if (
    chosen.action.type === "call" &&
    strength < 0.65 &&
    view.actions.some(
      (a) => a.player === other(view.viewer) && "total" in a.action,
    )
  )
    reason = "bluff-catch";
  else if ("total" in chosen.action) {
    if (strength < 0.45)
      reason = model.ownShownValue >= 2 ? "bluff-after-value" : "bluff";
    else if (strength >= 0.65)
      reason = model.ownShownBluffs > 0 ? "value-after-bluff" : "value";
    if (difficulty === "hard" && chosen.action.type === "raise") {
      if (view.raises >= 1) reason = "re-raise";
      else if (view.actions.some(a => a.player === view.viewer && a.action.type === "check"))
        reason = "check-raise";
    }
  }
  return {
    action: chosen.action,
    log: { round: view.round, kind: "bet" as const, reason },
    analysis: chosen,
  };
}
export const chooseAction = (
  view: PlayerView,
  difficulty: Difficulty,
  rng: () => number,
) => decideAction(view, difficulty, rng).action;
