import { describe, expect, it } from "vitest";
import { createGame, getPlayerView, transition, type GameCommand, type GameState } from "./engine";
import { analyseOpponent, equity } from "./opponent-model";
import { solveBetting } from "./betting-search";

const play = (s: GameState, c: GameCommand) => transition(s, c, () => 0);
function firstView(card: number, bet = 0, allIn = false) {
  let s = createGame(allIn, "pressure");
  s = play(s, { type: "select", player: "bot", card });
  s = play(s, { type: "select", player: "human", card: 8 });
  s = play(s, { type: "draw" });
  s = play(s, { type: "act", player: "human", action: bet ? { type: "bet", total: bet } : { type: "check" } });
  return getPlayerView(s, "bot", false);
}
function secondView(card: number) {
  let s = createGame(true, "pressure");
  for (const player of ["human", "bot"] as const) s = play(s, { type: "select", player, card: 7 });
  s = play(s, { type: "draw" });
  for (let i = 0; i < 2; i++) s = play(s, { type: "act", player: s.turn, action: { type: "check" } });
  s = play(s, { type: "next" });
  s = play(s, { type: "select", player: "bot", card });
  s = play(s, { type: "select", player: "human", card: 8 });
  s = play(s, { type: "draw" });
  return getPlayerView(s, "bot", false);
}

describe("公開範囲による賭けの先読み", () => {
  it("上限ベットへのCALLは、厳密なポットオッズの期待値と一致する", () => {
    for (const card of [1, 7, 13]) {
      const v = firstView(card, 20), p = equity(card, "BIG", analyseOpponent(v).range),
        options = solveBetting(v).options,
        call = options.find(o => o.action.type === "call")!,
        fold = options.find(o => o.action.type === "fold")!;
      expect(call.chipEV).toBeCloseTo(p.equity * 44 - 20, 8);
      expect(fold.chipEV).toBeCloseTo(0, 8);
      expect(options.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1, 10);
    }
  });
  it("チェックからのベット、レイズ、再レイズ、応答まで含め、全候補は合法", () => {
    const v = secondView(13), result = solveBetting(v);
    expect(result.stats.maxDepth).toBe(5);
    expect(result.stats.nodes).toBeLessThan(600);
    expect(result.stats.iterations).toBe(128);
    for (const o of result.options) {
      expect(v.legal).toContainEqual(o.action);
      expect(Number.isFinite(o.chipEV) && Number.isFinite(o.score)).toBe(true);
      expect(o.probability).toBeGreaterThanOrEqual(0);
    }
  });
  it("同じ大きい賭けに、最強札のバリューと最弱札のブラフが混ざる", () => {
    const weak = solveBetting(firstView(1)).options,
      strong = solveBetting(firstView(13)).options;
    const common = weak.filter(w => "total" in w.action && w.probability > 0.005 &&
      strong.some(s => JSON.stringify(s.action) === JSON.stringify(w.action) && s.probability > 0.005));
    expect(common.length).toBeGreaterThan(0);
  });
  it("自分の非公開の残り札を、相手に知られた前提で応答計算しない", () => {
    const v = secondView(13), copy = structuredClone(v);
    copy.hand = [1, 13];
    expect(solveBetting(v).options).toEqual(solveBetting(copy).options);
  });
  it("最終回はチップ期待値より、FOLDすれば確定する試合勝利を取る", () => {
    let s = createGame(false, "pressure");
    const botCards = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13];
    for (let r = 1; r <= 12; r++) {
      s = play(s, { type: "select", player: "bot", card: botCards[r - 1] });
      s = play(s, { type: "select", player: "human", card: r === 12 ? 7 : botCards[r - 1] });
      s = play(s, { type: "draw" });
      if (r === 9) {
        if (s.turn === "human") s = play(s, { type: "act", player: "human", action: { type: "check" } });
        s = play(s, { type: "act", player: "bot", action: { type: "bet", total: 2 } });
        s = play(s, { type: "act", player: "human", action: { type: "fold" } });
      } else {
        for (let i = 0; i < 2; i++) s = play(s, { type: "act", player: s.turn, action: { type: "check" } });
      }
      s = play(s, { type: "next" });
    }
    s = play(s, { type: "select", player: "bot", card: 7 });
    s = play(s, { type: "select", player: "human", card: 13 });
    s = play(s, { type: "draw" });
    s = play(s, { type: "act", player: "human", action: { type: "bet", total: Math.min(s.chips.human, s.chips.bot) } });
    const v = getPlayerView(s, "bot", false);
    expect(v.chips.bot).toBeGreaterThan(300);
    const fold = solveBetting(v).options.find(o => o.action.type === "fold")!;
    expect(fold.probability).toBeGreaterThan(0.99);
  });
});
