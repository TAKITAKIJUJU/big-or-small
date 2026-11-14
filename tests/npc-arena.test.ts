import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { chooseAction, chooseCard } from "../src/game/bot";
import { chooseAction as oldAction, chooseCard as oldCard } from "./baselines/public-range-v2";
import { createGame, getPlayerView, transition, type BetAction, type PlayerView } from "../src/game/engine";

function random(seed: number) {
  return () => {
    let x = seed += 0x6d2b79f5;
    x = Math.imul(x ^ x >>> 15, x | 1);
    x ^= x + Math.imul(x ^ x >>> 7, x | 61);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}
type Policy = (view: PlayerView, rng: () => number) => BetAction;
const policies: Record<string, Policy> = {
  "旧上級 v2": (v, rng) => oldAction(v, "hard", rng),
  "全額で攻撃": v => v.legal.at(-1)!,
  "すべて受ける": v => v.legal.find(a => a.type === "call" || a.type === "check")!,
  "強い札だけ": v => {
    const strength = v.mode === "BIG" ? (v.ownCard! - 1) / 12 : (13 - v.ownCard!) / 12;
    return strength >= 0.75 ? v.legal.at(-1)! : v.legal[0];
  },
};

it("公開情報だけを渡し、抽選と座席をそろえて旧上級および異なる打ち方と対戦", () => {
  const seeds = Number(process.env.ARENA_SEEDS ?? 80),
    startSeed = Number(process.env.ARENA_START_SEED ?? 1),
    rivals = (process.env.ARENA_RIVALS ?? Object.keys(policies).join(",")).split(","),
    report = [], timings: number[] = [];
  for (const name of rivals) {
    let wins = 0, ties = 0, losses = 0, chipTotal = 0;
    const pairScores: number[] = [];
    for (let seed = startSeed; seed < startSeed + seeds; seed++) {
      let pairScore = 0;
      for (const seat of ["human", "bot"] as const) {
        let s = createGame(process.env.ARENA_ALL_IN === "1");
        const chance = random(seed * 31), rolls = Array.from({ length: 13 }, chance),
          rngNew = random(seed * 17), rngOld = random(seed * 29);
        while (s.phase !== "finished") {
          if (s.phase === "selecting") {
            for (const player of ["bot", "human"] as const) {
              const v = getPlayerView(s, player, false),
                card = player === seat ? chooseCard(v, "hard", rngNew) : oldCard(v, "hard", rngOld);
              s = transition(s, { type: "select", player, card });
            }
          } else if (s.phase === "drawing") s = transition(s, { type: "draw" }, () => rolls[s.round - 1]);
          else if (s.phase === "resolved") s = transition(s, { type: "next" });
          else {
            const player = s.turn, v = getPlayerView(s, player, false), start = performance.now(),
              action = player === seat ? chooseAction(v, "hard", rngNew) : policies[name](v, rngOld);
            if (player === seat) timings.push(performance.now() - start);
            s = transition(s, { type: "act", player, action });
          }
        }
        const amount = s.chips[seat], outcome = amount > 300 ? 1 : amount === 300 ? 0.5 : 0;
        if (outcome === 1) wins++; else if (outcome === 0.5) ties++; else losses++;
        chipTotal += amount;
        pairScore += outcome / 2;
        expect(s.chips.human + s.chips.bot).toBe(600);
      }
      pairScores.push(pairScore);
    }
    const mean = pairScores.reduce((a, b) => a + b, 0) / seeds,
      se = Math.sqrt(pairScores.reduce((s, x) => s + (x - mean) ** 2, 0) / (seeds - 1) / seeds);
    report.push({ rival: name, matches: seeds * 2, wins, ties, losses,
      score: +(mean * 100).toFixed(1), paired95pct: [+(100 * (mean - 1.96 * se)).toFixed(1), +(100 * (mean + 1.96 * se)).toFixed(1)],
      averageChips: +(chipTotal / (seeds * 2)).toFixed(1) });
    if (name === "旧上級 v2" && seeds >= 160)
      expect(mean - 1.96 * se, "旧上級への改善が対戦条件の偶然だけでないこと").toBeGreaterThan(0.5);
  }
  timings.sort((a, b) => a - b);
  const output = JSON.stringify({ seeds, startSeed, allIn: process.env.ARENA_ALL_IN === "1", report,
    milliseconds: { p50: timings[Math.floor(timings.length * 0.5)], p95: timings[Math.floor(timings.length * 0.95)], max: timings.at(-1) } }, null, 2);
  if (process.env.ARENA_REPORT) writeFileSync(process.env.ARENA_REPORT, output + "\n");
  console.log(output);
}, 600_000);
