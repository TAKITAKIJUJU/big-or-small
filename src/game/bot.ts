import {
  other,
  type BetAction,
  type Difficulty,
  type PlayerView,
} from "./engine";
/** PlayerView以外の状態を受け取らない。選札は抽選前に呼ぶ。 */
export function chooseCard(
  view: PlayerView,
  difficulty: Difficulty,
  rng: () => number,
): number {
  if (
    view.phase !== "selecting" ||
    view.ownCard !== null ||
    view.hand.length === 0
  )
    throw new Error("選札のタイミングではありません");
  const sorted = [...view.hand].sort((a, b) => a - b);
  // BIG/SMALLが未知なので極端な札の温存も混ぜ、固定順にはしない。
  const roll = rng();
  const pool =
    difficulty === "hard" && roll < 0.35 && sorted.length > 4
      ? sorted.slice(1, -1)
      : sorted;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
export function estimateStrength(view: PlayerView) {
  const opponent = other(view.viewer),
    own = view.ownCard;
  if (own === null || view.mode === null) return 0.5;
  const publicUsed = view.history
    .map((r) => r.cards[opponent])
    .filter((c): c is number => c !== null);
  // 非公開の廃棄札も候補として残る。実際の相手手札を参照しない。
  const pool = Array.from({ length: 13 }, (_, i) => i + 1).filter(
    (c) => !publicUsed.includes(c),
  );
  return (
    pool.reduce(
      (sum, c) =>
        sum +
        (c === own ? 0.5 : (view.mode === "BIG" ? own > c : own < c) ? 1 : 0),
      0,
    ) / pool.length
  );
}
export function chooseAction(
  view: PlayerView,
  difficulty: Difficulty,
  rng: () => number,
): BetAction {
  if (view.legal.length === 0) throw new Error("合法手がありません");
  const find = (t: BetAction["type"]) => view.legal.find((a) => a.type === t);
  const strength = estimateStrength(view),
    r = rng(),
    due =
      view.contributions[other(view.viewer)] - view.contributions[view.viewer];
  const folds = view.history.filter((h) =>
    h.actions.some(
      (a) => a.player === other(view.viewer) && a.action.type === "fold",
    ),
  ).length;
  const pressure =
    view.round > 9 && view.chips[view.viewer] < view.chips[other(view.viewer)]
      ? 0.06
      : 0;
  const bluffRate =
    difficulty === "easy"
      ? 0.015
      : difficulty === "medium"
        ? 0.09
        : Math.min(0.25, 0.12 + folds * 0.018 + pressure);
  const potOdds = due > 0 ? due / (view.pot + due) : 0;
  if (
    due > 0 &&
    strength < (difficulty === "easy" ? 0.38 : Math.max(0.2, potOdds + 0.1)) &&
    r > bluffRate
  )
    return find("fold") ?? view.legal[0];
  const aggressive =
    strength > (difficulty === "easy" ? 0.79 : 0.65) || r < bluffRate;
  const bets = view.legal.filter((a) => a.type === "bet" || a.type === "raise");
  if (aggressive && bets.length && r < 0.83) {
    const fraction =
      difficulty === "hard"
        ? Math.min(0.95, 0.3 + strength * 0.45 + r * 0.15)
        : difficulty === "medium"
          ? 0.35
          : 0.15;
    return bets[Math.min(bets.length - 1, Math.floor(bets.length * fraction))];
  }
  return find("call") ?? find("check") ?? view.legal[0];
}
