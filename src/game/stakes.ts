/** 公開された固定の進行表。チップ差、勝敗、プレイヤーによって変更しない。 */
export type Ruleset = "classic" | "pressure" | "open" | "air";
export const AIR_ROUNDS = 5;
export const AIR_ANTES = [1, 2, 3, 4, 5] as const;
export const isOpenRuleset = (ruleset: Ruleset) => ruleset === "open" || ruleset === "air";
export const matchRules = (ruleset: Ruleset) => ({
  initialStack: ruleset === "air" ? 25 : 300,
  roundLimit: ruleset === "air" ? AIR_ROUNDS : 13,
  unit: ruleset === "air" ? "エア" : "チップ",
});
export const ANTES = [2, 4, 6, 8, 10, 14, 18, 24, 30, 40, 50, 64, 80] as const;
export const BET_LIMITS: readonly (number | null)[] = [
  20,
  24,
  30,
  40,
  50,
  60,
  80,
  100,
  120,
  160,
  200,
  240,
  null,
];
export function getRoundStakes(
  round: number,
  ruleset: Ruleset = "pressure",
  allIn = false,
) {
  if (!Number.isInteger(round) || round < 1 || round > matchRules(ruleset).roundLimit)
    throw new Error("ラウンド数が不正です");
  return {
    scheduledAnte: ruleset === "air" ? AIR_ANTES[round - 1] : ruleset === "classic" ? 2 : ANTES[round - 1],
    betLimit: isOpenRuleset(ruleset) || allIn ? null : ruleset === "classic" ? 20 : BET_LIMITS[round - 1],
  };
}
