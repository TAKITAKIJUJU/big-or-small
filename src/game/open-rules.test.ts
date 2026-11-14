import { describe, expect, it } from "vitest";
import { createGame, transition, getPlayerView, getLegalActions, assertInvariants, type GameState, type GameCommand } from "./engine";
import { replay, type Entry } from "../lib/session";
import { cardPolicy, chooseAction, chooseCard } from "./bot";

function apply(s: GameState, command: GameCommand, roll = 0) { return transition(s, command, () => roll); }
function select(s: GameState, human: number, bot = human) {
  s = apply(s, { type: "select", player: "bot", card: bot });
  return apply(s, { type: "select", player: "human", card: human });
}
function checks(s: GameState) {
  for (let i = 0; i < 2 && s.phase === "betting"; i++) s = apply(s, { type: "act", player: s.turn, action: { type: "check" } });
  return s;
}
describe("抽選先行・全額上限・同数持越", () => {
  it("選札前に一度だけ抽選し、両者が確定するまで賭けられない", () => {
    const initial = createGame();
    expect(initial.ruleset).toBe("open");
    expect(initial.phase).toBe("drawing");
    expect(() => select(initial, 13)).toThrow();
    const s = apply(initial, { type: "draw" }, 0.9);
    expect(getPlayerView(s, "human").mode).toBe("SMALL");
    expect(s.phase).toBe("selecting");
    expect(() => apply(s, { type: "draw" })).toThrow();
    expect(getLegalActions(s, s.turn)).toEqual([]);
    expect(select(s, 13).phase).toBe("betting");
  });
  it("初回から298まで、2回のレイズ制限・差額返還を維持する", () => {
    let s = select(apply(createGame(), { type: "draw" }), 7);
    expect(getLegalActions(s, "human").at(-1)).toEqual({ type: "bet", total: 298 });
    s = apply(s, { type: "act", player: "human", action: { type: "bet", total: 100 } });
    s = apply(s, { type: "act", player: "bot", action: { type: "raise", total: 200 } });
    s = apply(s, { type: "act", player: "human", action: { type: "raise", total: 298 } });
    expect(getLegalActions(s, "bot")).toEqual([{ type: "fold" }, { type: "call" }]);
    s = apply(s, { type: "act", player: "bot", action: { type: "fold" } });
    expect(s.history[0].refunded.human).toBe(98);
    expect(s.chips).toEqual({ human: 502, bot: 98 });
    assertInvariants(s);
  });
  it("全額同数は追加298ずつを返し、4だけ持ち越して次回12から始まる", () => {
    let s = select(apply(createGame(), { type: "draw" }), 13);
    s = apply(s, { type: "act", player: "human", action: { type: "bet", total: 298 } });
    s = apply(s, { type: "act", player: "bot", action: { type: "call" } });
    expect(s.chips).toEqual({ human: 298, bot: 298 });
    expect(s.carryPot).toBe(4);
    expect(s.pot).toBe(4);
    expect(s.history[0].refunded).toEqual({ human: 298, bot: 298 });
    expect(s.history[0].carried).toBe(4);
    s = apply(s, { type: "next" });
    expect(s.pot).toBe(12);
    s = select(apply(s, { type: "draw" }), 12, 1);
    let folded = apply(s, { type: "act", player: "bot", action: { type: "bet", total: 20 } });
    folded = apply(folded, { type: "act", player: "human", action: { type: "raise", total: 40 } });
    folded = apply(folded, { type: "act", player: "bot", action: { type: "fold" } });
    expect(folded.chips).toEqual({ human: 326, bot: 274 });
    expect(folded.history[1].refunded.human).toBe(20);
    expect(folded.carryPot).toBe(0);
    expect(getPlayerView(folded, "bot", false).history[1].cards.human).toBeNull();
    assertInvariants(folded);
    s = checks(s);
    expect(s.chips).toEqual({ human: 306, bot: 294 });
    expect(s.history[1].carryIn).toBe(4);
    expect(s.carryPot).toBe(0);
    assertInvariants(s);
  });
  it("連続同数と最終回の折半でも全600を保ち、未決着資金を残さない", () => {
    let s = createGame();
    for (let r = 1; r <= 13; r++) {
      s = checks(select(apply(s, { type: "draw" }), r));
      assertInvariants(s);
      if (r < 13) expect(s.carryPot).toBeGreaterThan(0);
      s = apply(s, { type: "next" });
    }
    expect(s.phase).toBe("finished");
    expect(s.chips).toEqual({ human: 300, bot: 300 });
    expect(s.pot).toBe(0);
  });
  it("参加料で片側が0になる同数は、奇数残額でも折半してから続行可否を判定", () => {
    let s = checks(select(apply(createGame(), { type: "draw" }), 1));
    s.chips = { human: 1, bot: 595 }; // 4は中央に保持
    s = apply(s, { type: "next" });
    expect(s.ante).toBe(1);
    s = select(apply(s, { type: "draw" }), 2);
    expect(s.phase).toBe("resolved");
    expect(s.chips).toEqual({ human: 3, bot: 597 });
    expect(s.carryPot).toBe(0);
    assertInvariants(s);
  });
  it("持越を含むログが再生でき、非公開札を変えてもNPCの入力と判断は同じ", () => {
    const entries: Entry[] = [], commands: GameCommand[] = [
      { type: "draw" }, { type: "select", player: "bot", card: 1 }, { type: "select", player: "human", card: 1 },
      { type: "act", player: "human", action: { type: "check" } }, { type: "act", player: "bot", action: { type: "check" } },
      { type: "next" }, { type: "draw" }, { type: "select", player: "bot", card: 13 }, { type: "select", player: "human", card: 12 },
    ];
    let s = createGame();
    for (const command of commands) { entries.push({ command, ...(command.type === "draw" ? { roll: 0 } : {}) }); s = apply(s, command); }
    expect(replay({ ruleset: "open", allIn: false, entries })).toEqual(s);
    const clone = structuredClone(s); clone.selected.human = 11;
    const v = getPlayerView(s, "bot", false), hidden = getPlayerView(clone, "bot", false);
    expect(hidden).toEqual(v);
    expect(chooseAction(hidden, "hard", () => 0.4)).toEqual(chooseAction(v, "hard", () => 0.4));
  });
  it("NPCの選札は公開されたBIGとSMALLで反転する", () => {
    const big = getPlayerView(apply(createGame(), { type: "draw" }), "bot", false),
      small = getPlayerView(apply(createGame(), { type: "draw" }, 0.9), "bot", false),
      mean = (v: typeof big) => cardPolicy(v, "hard").reduce((s, x) => s + x.card * x.probability, 0);
    expect(mean(big)).toBeGreaterThan(mean(small) + 2);
  });
});

it("新ルール240試合で全遷移の資金保存・合法NPC・持越精算を検査", () => {
  let seed = 333;
  const rng = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (let t = 0; t < 240; t++) {
    let s = createGame();
    const difficulty = (["easy", "medium", "hard"] as const)[t % 3];
    while (s.phase !== "finished") {
      if (s.phase === "drawing") s = transition(s, { type: "draw" }, rng);
      else if (s.phase === "selecting") {
        const card = chooseCard(getPlayerView(s, "bot", false), difficulty, rng);
        s = apply(s, { type: "select", player: "bot", card });
        s = apply(s, { type: "select", player: "human", card: s.hands.human[Math.floor(rng() * s.hands.human.length)] });
      } else if (s.phase === "betting") {
        const legal = getLegalActions(s, s.turn), action = s.turn === "bot" ? chooseAction(getPlayerView(s, "bot", false), difficulty, rng) : legal[Math.floor(rng() * legal.length)];
        expect(legal).toContainEqual(action);
        s = apply(s, { type: "act", player: s.turn, action });
      } else s = apply(s, { type: "next" });
      assertInvariants(s);
    }
    expect(s.pot).toBe(0);
  }
}, 120000);
