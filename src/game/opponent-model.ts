import {
  other,
  type ActionRecord,
  type Mode,
  type Player,
  type PlayerView,
  type VisibleRound,
} from "./engine";
import { getRoundStakes } from "./stakes";
export interface CardBelief {
  card: number;
  probability: number;
}
export interface OpponentModel {
  range: CardBelief[];
  foldSmall: number;
  foldLarge: number;
  aggression: number;
  callRate: number;
  bluffRate: number;
  trapRate: number;
  sampleSize: number;
  shownBets: number;
  shownBluffs: number;
  ownShownBluffs: number;
  ownShownValue: number;
  ownBluffImage: number;
  averageBetFraction: number;
}
const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
export const rankStrength = (card: number, mode: Mode) =>
  mode === "BIG" ? (card - 1) / 12 : (13 - card) / 12;
export function equity(card: number, mode: Mode, range: CardBelief[]) {
  let win = 0,
    tie = 0;
  for (const c of range) {
    if (c.card === card) tie += c.probability;
    else if (mode === "BIG" ? card > c.card : card < c.card)
      win += c.probability;
  }
  return { win, tie, lose: Math.max(0, 1 - win - tie), equity: win + tie / 2 };
}
function normalize(values: Float64Array) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum > 0) for (let i = 0; i < values.length; i++) values[i] /= sum;
  return sum;
}
function capFor(
  view: PlayerView,
  round: VisibleRound,
  start: { human: number; bot: number },
) {
  return Math.max(
    1,
    Math.min(
      getRoundStakes(round.round, view.ruleset, view.allIn).betLimit ?? 600,
      start.human - round.ante,
      start.bot - round.ante,
    ),
  );
}
function fraction(record: ActionRecord, cap: number) {
  return "total" in record.action
    ? clamp(record.action.total / Math.max(1, cap), 0, 1)
    : 0;
}
function cardPrior(card: number, round: number, reserve: number) {
  const pole = Math.abs(card - 7) / 6;
  return (
    0.3 + Math.exp(clamp((round - 7) / 5, -1.2, 1.2) * reserve * pole * 1.8)
  );
}
/** 公開行動の尤度。最大額は強い札と弱いブラフの両峰を残し、断定しない。 */
export function actionLikelihood(
  card: number,
  mode: Mode,
  records: ActionRecord[],
  player: PlayerView["viewer"],
  cap: number,
  model: Pick<
    OpponentModel,
    "bluffRate" | "trapRate" | "callRate" | "foldSmall" | "foldLarge"
  >,
) {
  const strength = rankStrength(card, mode);
  let likelihood = 1;
  const paid = { human: 0, bot: 0 };
  for (const record of records) {
    const target = Math.max(paid.human, paid.bot),
      due = target - paid[record.player];
    if (record.player === player) {
      const action = record.action;
      if (action.type === "fold")
        likelihood *=
          0.04 + (1 - strength) ** (0.8 + due / Math.max(1, cap)) * 0.9;
      else if (action.type === "call")
        likelihood *=
          0.08 +
          model.callRate * 0.35 +
          Math.max(0, strength - (0.3 * due) / Math.max(1, cap)) ** 1.5 * 0.65;
      else if (action.type === "check")
        likelihood *=
          0.12 + 0.65 * (1 - strength) + model.trapRate * strength ** 3;
      else {
        const size = fraction(record, cap),
          strong = Math.exp(-(((strength - 0.95) / 0.29) ** 2)),
          weak = Math.exp(-(((strength - 0.08) / 0.27) ** 2));
        const polar = (1 - model.bluffRate) * strong + model.bluffRate * weak;
        const ordinary = 0.12 + 0.72 * strength;
        likelihood *= 0.035 + (1 - size) * ordinary + size * polar;
      }
    }
    paid[record.player] += record.paid;
  }
  return Math.max(1e-12, likelihood);
}
const cache = new WeakMap<PlayerView, Partial<Record<Player, OpponentModel>>>();
/** 公開情報から指定プレイヤーを推定する。自分の実際の手札も参照しない。 */
export function analysePlayer(view: PlayerView, opponent: Player): OpponentModel {
  const cached = cache.get(view)?.[opponent];
  if (cached) return cached;
  let smallN = 0,
    smallF = 0,
    largeN = 0,
    largeF = 0,
    faces = 0,
    calls = 0,
    aggressive = 0,
    shown = 0,
    bluffs = 0,
    traps = 0,
    strongChecks = 0,
    ownBluffs = 0,
    ownValue = 0,
    betSum = 0,
    betN = 0,
    reserveEvidence = 0,
    reserveN = 0;
  const starts = { human: 300, bot: 300 };
  const caps: number[] = [];
  for (const round of view.history) {
    const cap = capFor(view, round, starts);
    caps.push(cap);
    const contributions = { human: 0, bot: 0 };
    let faced = false,
      folded = false,
      large = false,
      bet = false,
      checked = false,
      maxSize = 0;
    for (const r of round.actions) {
      const due =
        Math.max(contributions.human, contributions.bot) -
        contributions[r.player];
      if (r.player === opponent) {
        if (due > 0) {
          faced = true;
          large ||=
            Math.max(contributions.human, contributions.bot) / cap >= 0.55;
          folded ||= r.action.type === "fold";
          if (r.action.type === "call" || r.action.type === "raise") calls++;
          faces++;
        }
        if (r.action.type === "check") checked = true;
        if ("total" in r.action) {
          bet = true;
          maxSize = Math.max(maxSize, fraction(r, cap));
          betSum += fraction(r, cap);
          betN++;
        }
      }
      contributions[r.player] += r.paid;
    }
    if (faced) {
      if (large) {
        largeN++;
        if (folded) largeF++;
      } else {
        smallN++;
        if (folded) smallF++;
      }
    }
    if (bet) aggressive++;
    // 試合後に開示されたFOLD札も学習の正解として使わない。
    if (round.reason === "showdown") {
      const card = round.cards[opponent];
      if (card !== null) {
        const strength = rankStrength(card, round.mode);
        if (bet) {
          const weight = 0.5 + maxSize * 0.5;
          shown += weight;
          if (strength < 0.4) bluffs += weight;
          else if (strength < 0.65) bluffs += 0.35 * weight;
        }
        if (strength >= 0.75) {
          strongChecks++;
          if (
            checked &&
            round.actions.some(
              (a) =>
                a.player === opponent &&
                (a.action.type === "call" || "total" in a.action),
            )
          )
            traps++;
        }
        reserveEvidence +=
          (1 - round.round / 7) * (0.5 - Math.abs(card - 7) / 6);
        reserveN++;
      }
      const own = round.cards[other(opponent)];
      if (
        own !== null &&
        round.actions.some(
          (a) => a.player === other(opponent) && "total" in a.action,
        )
      ) {
        if (rankStrength(own, round.mode) < 0.4) ownBluffs++;
        if (rankStrength(own, round.mode) > 0.7) ownValue++;
      }
    }
    starts.human += round.delta.human;
    starts.bot += round.delta.bot;
  }
  const model: OpponentModel = {
    range: [],
    foldSmall: (2 + smallF) / (5 + smallN),
    foldLarge: (3 + largeF) / (6 + largeN),
    aggression: (3 + aggressive) / (10 + view.history.length),
    callRate: (3 + calls) / (6 + faces),
    bluffRate: (2 + bluffs) / (8 + shown),
    trapRate: (1 + traps) / (5 + strongChecks),
    sampleSize: smallN + largeN,
    shownBets: shown,
    shownBluffs: bluffs,
    ownShownBluffs: ownBluffs,
    ownShownValue: ownValue,
    ownBluffImage: (1.5 + ownBluffs) / (6 + ownBluffs + ownValue),
    averageBetFraction: betN ? betSum / betN : 0.38,
  };
  // 残り札集合の厳密な列挙。13枚なので最大8192集合・約5万遷移に収まる。
  // 非公開廃棄は「あり得る札」をすべて分岐し、公開札が出たら矛盾する集合を除く。
  let posterior = new Float64Array(8192);
  posterior[8191] = 1;
  const reserve = clamp(
    1 + (reserveEvidence / Math.max(2, reserveN)) * 4,
    0.25,
    2,
  );
  for (let i = 0; i < view.history.length; i++) {
    const round = view.history[i],
      fixed = round.reason === "showdown" ? round.cards[opponent] : null,
      next = new Float64Array(8192);
    const prior = Array.from({ length: 13 }, (_, n) =>
      cardPrior(n + 1, round.round, reserve),
    );
    const likelihood = Array.from({ length: 13 }, (_, n) =>
      actionLikelihood(
        n + 1,
        round.mode,
        round.actions,
        opponent,
        caps[i],
        model,
      ),
    );
    for (let mask = 1; mask < 8192; mask++) {
      const weight = posterior[mask];
      if (weight === 0) continue;
      let denominator = 0;
      for (let n = 0; n < 13; n++) if (mask & (1 << n)) denominator += prior[n];
      for (let n = 0; n < 13; n++)
        if (mask & (1 << n) && (fixed === null || fixed === n + 1))
          next[mask ^ (1 << n)] +=
            ((weight * prior[n]) / denominator) * likelihood[n];
    }
    if (!normalize(next)) throw new Error("公開履歴の札が矛盾しています");
    posterior = next;
  }
  const weights = new Float64Array(13),
    prior = Array.from({ length: 13 }, (_, n) =>
      cardPrior(n + 1, view.round, reserve),
    );
  const currentCap = Math.max(
    1,
    Math.min(
      view.betLimit ?? 600,
      view.chips.human + view.contributions.human,
      view.chips.bot + view.contributions.bot,
    ),
  );
  for (let mask = 1; mask < 8192; mask++) {
    const weight = posterior[mask];
    if (weight === 0) continue;
    let denominator = 0;
    for (let n = 0; n < 13; n++) if (mask & (1 << n)) denominator += prior[n];
    for (let n = 0; n < 13; n++)
      if (mask & (1 << n)) weights[n] += (weight * prior[n]) / denominator;
  }
  if (view.mode)
    for (let n = 0; n < 13; n++)
      weights[n] *= actionLikelihood(
        n + 1,
        view.mode,
        view.actions,
        opponent,
        currentCap,
        model,
      );
  if (!normalize(weights)) throw new Error("相手の札候補を推定できません");
  model.range = Array.from(weights, (probability, n) => ({
    card: n + 1,
    probability,
  }));
  cache.set(view, { ...cache.get(view), [opponent]: model });
  return model;
}
export const analyseOpponent = (view: PlayerView) =>
  analysePlayer(view, other(view.viewer));
