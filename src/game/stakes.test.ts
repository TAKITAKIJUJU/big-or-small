import { describe, it, expect } from "vitest";
import {
  createGame,
  transition,
  getLegalActions,
  getPlayerView,
  assertInvariants,
  type GameState,
} from "./engine";
import { getRoundStakes, ANTES, BET_LIMITS } from "./stakes";
import { replay, load, save, defaults } from "../lib/session";
import { comebackFixture } from "../../tests/fixtures";
function tieRound(s: GameState, n: number) {
  s = transition(s, { type: "select", player: "bot", card: n });
  s = transition(s, { type: "select", player: "human", card: n });
  s = transition(s, { type: "draw" }, () => 0);
  if (s.phase === "betting") {
    s = transition(s, {
      type: "act",
      player: s.turn,
      action: { type: "check" },
    });
    s = transition(s, {
      type: "act",
      player: s.turn,
      action: { type: "check" },
    });
  }
  return s;
}
describe("参加料上昇と一発逆転", () => {
  it("両者に同じ固定の参加料と追加上限、13ラウンドで毎回上昇", () => {
    let s = createGame();
    for (let r = 1; r <= 13; r++) {
      expect(s.ante).toBe(ANTES[r - 1]);
      expect(s.betLimit).toBe(BET_LIMITS[r - 1]);
      expect(s.pot).toBe(2 * ANTES[r - 1]);
      expect(s.chips).toEqual({
        human: 300 - ANTES[r - 1],
        bot: 300 - ANTES[r - 1],
      });
      s = tieRound(s, r);
      expect(s.history.at(-1)?.ante).toBe(ANTES[r - 1]);
      expect(s.chips).toEqual({ human: 300, bot: 300 });
      expect(getPlayerView(s, "human").nextAnte).toBe(
        r === 13 ? null : ANTES[r],
      );
      s = transition(s, { type: "next" });
    }
    expect(s.phase).toBe("finished");
  });
  it("160対440から、コール一回の勝負で320対280へ逆転する", () => {
    const { session, state } = comebackFixture();
    expect(state.chips).toEqual({ human: 120, bot: 280 }); // NPCは追加120を拠出済み
    expect(state.ante).toBe(40);
    expect(state.pot).toBe(200);
    expect(state.roundStart).toEqual({ human: 160, bot: 440 });
    expect(replay(session)).toEqual(state);
    const result = transition(state, {
      type: "act",
      player: "human",
      action: { type: "call" },
    });
    expect(result.chips).toEqual({ human: 320, bot: 280 });
    expect(result.history.at(-1)?.pot).toBe(320);
    expect(result.history.at(-1)?.delta).toEqual({ human: 160, bot: -160 });
    assertInvariants(result);
  });
  it("参加料の不足は残額で参加でき、1枚の勝負を残す", () => {
    let s = tieRound(createGame(), 1);
    s.chips = { human: 3, bot: 597 };
    s = transition(s, { type: "next" });
    expect(s.round).toBe(2);
    expect(s.scheduledAnte).toBe(4);
    expect(s.ante).toBe(3);
    expect(s.chips).toEqual({ human: 0, bot: 594 });
    expect(s.pot).toBe(6);
    s = transition(s, { type: "select", player: "bot", card: 2 });
    s = transition(s, { type: "select", player: "human", card: 13 });
    s = transition(s, { type: "draw" }, () => 0);
    expect(s.phase).toBe("resolved");
    expect(s.actions).toHaveLength(0);
    expect(s.chips.human).toBe(6);
    expect(getPlayerView(s, "human").canContinue).toBe(true);
    assertInvariants(s);
  });
  it("残額が同じ奇数でも同数は整数で分配し、0以外は続けられる", () => {
    let s = tieRound(createGame(), 1);
    s.chips = { human: 1, bot: 599 };
    s = transition(s, { type: "next" });
    expect(s.ante).toBe(1);
    s = tieRound(s, 2);
    expect(s.chips).toEqual({ human: 1, bot: 599 });
    expect(getPlayerView(s, "human").nextAnte).toBe(1);
    assertInvariants(s);
  });
  it("参加料の最後の勝負に負けて0なら終了、次の参加料を請求しない", () => {
    let s = tieRound(createGame(), 1);
    s.chips = { human: 3, bot: 597 };
    s = transition(s, { type: "next" });
    s = transition(s, { type: "select", player: "bot", card: 13 });
    s = transition(s, { type: "select", player: "human", card: 2 });
    s = transition(s, { type: "draw" }, () => 0);
    expect(s.chips.human).toBe(0);
    expect(getPlayerView(s, "human").canContinue).toBe(false);
    s = transition(s, { type: "next" });
    expect(s.phase).toBe("finished");
    expect(s.history.length).toBe(2);
    expect(s.round).toBe(2);
    expect(getPlayerView(s, "human").nextScheduledAnte).toBeNull();
    assertInvariants(s);
  });
  it("後半の上限超過、レイズ上限と相手が受けられない額を拒否", () => {
    const { state } = comebackFixture();
    expect(getLegalActions(state, "human")).toEqual([
      { type: "fold" },
      { type: "call" },
    ]);
    expect(() =>
      transition(state, {
        type: "act",
        player: "human",
        action: { type: "raise", total: 122 },
      }),
    ).toThrow();
    expect(getRoundStakes(9)).toEqual({ scheduledAnte: 30, betLimit: 120 });
    expect(getRoundStakes(13).betLimit).toBeNull();
    expect(getRoundStakes(3, "pressure", true).betLimit).toBeNull();
  });
  it("大きいポットでもフォールド札を公開せず、未コール分を返す", () => {
    const { state } = comebackFixture();
    const result = transition(state, {
      type: "act",
      player: "human",
      action: { type: "fold" },
    });
    expect(result.history.at(-1)?.pot).toBe(80);
    expect(result.history.at(-1)?.refunded.bot).toBe(120);
    expect(result.chips).toEqual({ human: 120, bot: 480 });
    expect(getPlayerView(result, "human").history.at(-1)?.cards.bot).toBeNull();
    assertInvariants(result);
  });
  it("参加料が増えた後も秘密の札を変えてもBotのビューが同じ", () => {
    const { state } = comebackFixture();
    const clone = structuredClone(state);
    clone.selected.human = 11;
    expect(getPlayerView(state, "bot", false)).toEqual(
      getPlayerView(clone, "bot", false),
    );
  });
  it("ルール指定のない旧ログは固定2・上限20で再生し、途中で新ルールにしない", () => {
    const commands = comebackFixture().session.entries.slice(0, 7);
    const old = replay({ allIn: false, entries: commands });
    expect(old.ruleset).toBe("classic");
    expect(old.round).toBe(2);
    expect(old.ante).toBe(2);
    expect(old.betLimit).toBe(20);
    expect(() =>
      replay({ ruleset: "invalid", allIn: false, entries: [] } as never),
    ).toThrow();
  });
  it("保存からの再開でも新ルールと旧ルールを区別する", () => {
    const data = new Map<string, string>();
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
      },
    });
    try {
      const { session, state } = comebackFixture();
      expect(save(defaults, session)).toBe("");
      expect(load().state).toEqual(state);
      expect(load().session?.ruleset).toBe("pressure");
      save(defaults, { allIn: false, entries: [] });
      expect(load().state?.ruleset).toBe("classic");
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
