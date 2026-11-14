import { describe, expect, it } from "vitest";
import {
  assertInvariants,
  createGame,
  getLegalActions,
  getPlayerView,
  transition,
  type BetAction,
  type GameState,
  type Player,
} from "./engine";
import { chooseAction, chooseCard } from "./bot";
import { replay, settingsFrom } from "../lib/session";
function rng(seed = 19) {
  let x = seed;
  return () => {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
function betting(human = 7, bot = 8, roll = 0.1, allIn = false) {
  let s = createGame(allIn);
  s = transition(s, { type: "select", player: "bot", card: bot });
  s = transition(s, { type: "select", player: "human", card: human });
  return transition(s, { type: "draw" }, () => roll);
}
const act = (s: GameState, player: Player, action: BetAction) =>
  transition(s, { type: "act", player, action });
describe("ルールと状態機械", () => {
  it("双方確定前の抽選、確定後の変更、再抽選を拒否", () => {
    let s = createGame();
    expect(() => transition(s, { type: "draw" })).toThrow();
    s = transition(s, { type: "select", player: "human", card: 1 });
    expect(() =>
      transition(s, { type: "select", player: "human", card: 2 }),
    ).toThrow();
    s = transition(s, { type: "select", player: "bot", card: 1 });
    s = transition(s, { type: "draw" }, () => 0);
    expect(s.mode).toBe("BIG");
    expect(() => transition(s, { type: "draw" })).toThrow();
  });
  it("CHECK → CHECK、同数とポット分配", () => {
    let s = betting(8, 8);
    s = act(s, "human", { type: "check" });
    s = act(s, "bot", { type: "check" });
    expect(s.phase).toBe("resolved");
    expect(s.chips).toEqual({ human: 300, bot: 300 });
    expect(s.history[0].winner).toBe("tie");
  });
  it("CHECK → BET → CALL、先手交代", () => {
    let s = betting(13, 2);
    s = act(s, "human", { type: "check" });
    s = act(s, "bot", { type: "bet", total: 12 });
    expect(getLegalActions(s, "human")).toContainEqual({ type: "call" });
    s = act(s, "human", { type: "call" });
    expect(s.chips).toEqual({ human: 314, bot: 286 });
    s = transition(s, { type: "next" });
    expect(s.turn).toBe("bot");
    expect(() =>
      transition(s, { type: "select", player: "human", card: 13 }),
    ).toThrow();
  });
  it("BET → RAISE → CALLと、追加額の整合", () => {
    let s = betting(1, 2, 0.8);
    s = act(s, "human", { type: "bet", total: 4 });
    s = act(s, "bot", { type: "raise", total: 10 });
    expect(s.pot).toBe(18);
    s = act(s, "human", { type: "call" });
    expect(s.history[0].actions.at(-1)?.paid).toBe(6);
    expect(s.chips).toEqual({ human: 312, bot: 288 });
  });
  it("フォールド時、未コール差額を返還して精算", () => {
    let s = betting(3, 12);
    s = act(s, "human", { type: "bet", total: 6 });
    s = act(s, "bot", { type: "raise", total: 14 });
    s = act(s, "human", { type: "fold" });
    expect(s.history[0].pot).toBe(16);
    expect(s.history[0].refunded).toEqual({ human: 0, bot: 8 });
    expect(s.chips).toEqual({ human: 292, bot: 308 });
    expect(getPlayerView(s, "human").history[0].cards.bot).toBeNull();
    expect(getPlayerView(s, "bot").history[0].cards.human).toBeNull();
  });
  it("レイズ2回上限、通常20上限、2刻み、誤手番、無効コール", () => {
    let s = betting();
    expect(() => act(s, "human", { type: "call" })).toThrow();
    expect(() => act(s, "bot", { type: "check" })).toThrow();
    expect(() => act(s, "human", { type: "bet", total: 3 })).toThrow();
    expect(() => act(s, "human", { type: "bet", total: 22 })).toThrow();
    s = act(s, "human", { type: "bet", total: 2 });
    s = act(s, "bot", { type: "raise", total: 4 });
    s = act(s, "human", { type: "raise", total: 6 });
    expect(getLegalActions(s, "bot").map((a) => a.type)).toEqual([
      "fold",
      "call",
    ]);
  });
  it("残チップが少ない側の有効額を超えるベットを列挙しない", () => {
    let s = betting();
    s.chips.human = 4;
    s.chips.bot = 592;
    expect(getLegalActions(s, "human").filter((a) => "total" in a)).toEqual([
      { type: "bet", total: 2 },
      { type: "bet", total: 4 },
    ]);
    s = act(s, "human", { type: "bet", total: 4 });
    expect(getLegalActions(s, "bot")).toEqual([
      { type: "fold" },
      { type: "call" },
    ]);
    s = act(s, "bot", { type: "call" });
    assertInvariants(s);
  });
  it("オールイン有効スタック、奇数端数、小さいオールインレイズ", () => {
    let s = betting(13, 1, 0, true);
    s.chips.human = 5;
    s.chips.bot = 591;
    expect(getLegalActions(s, "human")).toContainEqual({
      type: "bet",
      total: 5,
    });
    s = act(s, "human", { type: "bet", total: 4 });
    expect(getLegalActions(s, "bot")).toContainEqual({
      type: "raise",
      total: 5,
    });
    s = act(s, "bot", { type: "raise", total: 5 });
    expect(getLegalActions(s, "human")).toEqual([
      { type: "fold" },
      { type: "call" },
    ]);
    s = act(s, "human", { type: "call" });
    expect(s.phase).toBe("resolved");
    expect(s.history[0].pot).toBe(14);
    assertInvariants(s);
  });
  it("オールイン20上限解除、対応不可能な額は拒否", () => {
    let s = betting(1, 13, 0, true);
    s.chips.human = 39;
    s.chips.bot = 557;
    expect(getLegalActions(s, "human")).toContainEqual({
      type: "bet",
      total: 39,
    });
    expect(() => act(s, "human", { type: "bet", total: 40 })).toThrow();
    s = act(s, "human", { type: "bet", total: 39 });
    s = act(s, "bot", { type: "call" });
    expect(s.chips.human).toBe(0);
    s = transition(s, { type: "next" });
    expect(s.phase).toBe("finished");
  });
  it("アンティ後ゼロなら追加ベットなしで公開", () => {
    let s = betting(13, 1);
    s = act(s, "human", { type: "check" });
    s = act(s, "bot", { type: "check" });
    s.chips.human = 2;
    s.chips.bot = 598;
    s = transition(s, { type: "next" });
    expect(s.chips.human).toBe(0);
    s = transition(s, { type: "select", player: "human", card: 12 });
    s = transition(s, { type: "select", player: "bot", card: 2 });
    s = transition(s, { type: "draw" }, () => 0);
    expect(s.phase).toBe("resolved");
    expect(s.actions).toHaveLength(0);
    assertInvariants(s);
  });
  it("13ラウンド・重複なし・独立抽選は過去に依存しない", () => {
    let s = createGame();
    for (let i = 1; i <= 13; i++) {
      s = transition(s, { type: "select", player: "bot", card: i });
      s = transition(s, { type: "select", player: "human", card: i });
      s = transition(s, { type: "draw" }, () => 0.49999);
      expect(s.mode).toBe("BIG");
      s = act(s, s.turn, { type: "check" });
      s = act(s, s.turn, { type: "check" });
      s = transition(s, { type: "next" });
    }
    expect(s.phase).toBe("finished");
    expect(s.history).toHaveLength(13);
    expect(s.hands.human).toHaveLength(0);
    expect(s.chips).toEqual({ human: 300, bot: 300 });
    expect(betting(1, 2, 0.5).mode).toBe("SMALL");
  });
  it("フォールド札は終了時だけ設定に従って開示", () => {
    let s = betting();
    s = act(s, "human", { type: "bet", total: 2 });
    s = act(s, "bot", { type: "fold" });
    expect(getPlayerView(s, "human").history[0].cards.bot).toBeNull();
    s.chips.bot = 0;
    s.chips.human = 600;
    s = transition(s, { type: "next" });
    expect(getPlayerView(s, "human").history[0].cards.bot).toBe(8);
    expect(getPlayerView(s, "human", false).history[0].cards.bot).toBeNull();
  });
});
describe("Botの秘密情報境界・保存", () => {
  it("人間の秘密札だけを変えてもBotのビューと行動は同一", () => {
    const a = act(betting(1, 7), "human", { type: "check" }),
      b = act(betting(13, 7), "human", { type: "check" });
    const va = getPlayerView(a, "bot", false),
      vb = getPlayerView(b, "bot", false);
    expect(va).toEqual(vb);
    expect(chooseAction(va, "hard", () => 0.3)).toEqual(
      chooseAction(vb, "hard", () => 0.3),
    );
    expect(va).not.toHaveProperty("hands");
    expect(va).not.toHaveProperty("selected");
  });
  it("非公開廃棄札の違いが次のBotのビューに漏れない", () => {
    function fold(card: number) {
      let s = betting(card, 8);
      s = act(s, "human", { type: "bet", total: 2 });
      s = act(s, "bot", { type: "fold" });
      return transition(s, { type: "next" });
    }
    const a = getPlayerView(fold(1), "bot", false),
      b = getPlayerView(fold(13), "bot", false);
    expect(a).toEqual(b);
    expect(chooseCard(a, "hard", rng(1))).toBe(chooseCard(b, "hard", rng(1)));
  });
  it("破損記録、途中の不正コマンド、無効な乱数を拒否", () => {
    expect(() =>
      replay({
        allIn: false,
        entries: [{ command: { type: "draw" }, roll: 0 }],
      }),
    ).toThrow();
    expect(() =>
      replay({
        allIn: false,
        entries: [{ command: { type: "select", player: "human", card: 99 } }],
      }),
    ).toThrow();
    expect(() => transition(betting(), { type: "draw" }, () => NaN)).toThrow();
    expect(
      settingsFrom({ volume: NaN, difficulty: "cheat", muted: "no" }),
    ).toMatchObject({ volume: 0.35, difficulty: "medium", muted: false });
  });
  it("合法記録の再生が元の状態に一致する", () => {
    const entries = [
      { command: { type: "select" as const, player: "bot" as const, card: 4 } },
      {
        command: {
          type: "select" as const,
          player: "human" as const,
          card: 13,
        },
      },
      { command: { type: "draw" as const }, roll: 0.8 },
    ];
    let s = createGame();
    for (const e of entries) s = transition(s, e.command, () => e.roll ?? 0);
    expect(replay({ allIn: false, entries })).toEqual(s);
  });
});
it("600試合の合法ランダム対局で全状態の600チップ・カード整合・合法Botを検証", () => {
  const random = rng(444);
  for (let trial = 0; trial < 600; trial++) {
    let s = createGame(trial % 2 === 0),
      steps = 0;
    const difficulty = (["easy", "medium", "hard"] as const)[trial % 3];
    while (s.phase !== "finished") {
      expect(++steps).toBeLessThan(350);
      assertInvariants(s);
      if (s.phase === "selecting") {
        const vb = getPlayerView(s, "bot", false);
        s = transition(s, {
          type: "select",
          player: "bot",
          card: chooseCard(vb, difficulty, random),
        });
        s = transition(s, {
          type: "select",
          player: "human",
          card: s.hands.human[Math.floor(random() * s.hands.human.length)],
        });
      } else if (s.phase === "drawing")
        s = transition(s, { type: "draw" }, random);
      else if (s.phase === "betting") {
        const legal = getLegalActions(s, s.turn);
        expect(legal.length).toBeGreaterThan(0);
        const action =
          s.turn === "bot"
            ? chooseAction(getPlayerView(s, "bot", false), difficulty, random)
            : legal[Math.floor(random() * legal.length)];
        expect(legal).toContainEqual(action);
        s = act(s, s.turn, action);
      } else s = transition(s, { type: "next" });
    }
    assertInvariants(s);
    expect(s.history.length).toBeLessThanOrEqual(13);
    expect(s.history.length).toBeGreaterThan(0);
  }
});
