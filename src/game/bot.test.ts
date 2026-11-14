import { describe, it, expect } from "vitest";
import {
  createGame,
  transition,
  getPlayerView,
  getLegalActions,
  type GameState,
  type GameCommand,
  type Mode,
} from "./engine";
import { analyseOpponent, equity } from "./opponent-model";
import {
  cardPolicy,
  actionPolicy,
  chooseCard,
  chooseAction,
  decideAction,
} from "./bot";
import { safeBotLogs, replay } from "../lib/session";
import { comebackFixture } from "../../tests/fixtures";
function play(s: GameState, c: GameCommand, roll = 0) {
  return transition(s, c, () => roll);
}
function revealHistory(cards: number[], modes: Mode[], aggressive = true) {
  let s = createGame(true, "pressure");
  for (let i = 0; i < cards.length; i++) {
    s = play(s, { type: "select", player: "bot", card: cards[i] });
    s = play(s, { type: "select", player: "human", card: cards[i] });
    s = play(s, { type: "draw" }, modes[i] === "BIG" ? 0 : 0.8);
    if (aggressive) {
      if (s.turn === "bot")
        s = play(s, { type: "act", player: "bot", action: { type: "check" } });
      s = play(s, {
        type: "act",
        player: "human",
        action: { type: "bet", total: Math.min(s.chips.human, s.chips.bot) },
      });
      s = play(s, { type: "act", player: "bot", action: { type: "call" } });
    } else {
      s = play(s, { type: "act", player: s.turn, action: { type: "check" } });
      s = play(s, { type: "act", player: s.turn, action: { type: "check" } });
    }
    s = play(s, { type: "next" });
  }
  return s;
}
function faceAllInState(bluffer: boolean) {
  let s = revealHistory(
    [1, 2, 12, 13],
    bluffer
      ? ["BIG", "BIG", "SMALL", "SMALL"]
      : ["SMALL", "SMALL", "BIG", "BIG"],
  );
  s = play(s, { type: "select", player: "bot", card: 7 });
  s = play(s, { type: "select", player: "human", card: 9 });
  s = play(s, { type: "draw" });
  s = play(s, {
    type: "act",
    player: "human",
    action: { type: "bet", total: s.chips.human },
  });
  return s;
}
const faceAllIn = (bluffer: boolean) =>
  getPlayerView(faceAllInState(bluffer), "bot", false);
describe("相手を読むNPC", () => {
  it("初手は13分の1均等ではなく、後半のための温存に重みがある", () => {
    const v = getPlayerView(createGame(false, "pressure"), "bot", false),
      policy = cardPolicy(v, "hard");
    expect(policy).toHaveLength(13);
    expect(policy.reduce((s, c) => s + c.probability, 0)).toBeCloseTo(1);
    expect(policy.find((x) => x.card === 7)!.probability).toBeGreaterThan(
      policy.find((x) => x.card === 13)!.probability * 2,
    );
    expect(policy.every((x) => x.probability > 0)).toBe(true);
  });
  it("残額が少なく先を待てないときは、温存していた極端な札の使用が増える", () => {
    let s = createGame(false, "pressure");
    for (let r = 1; r <= 8; r++) {
      s = play(s, { type: "select", player: "bot", card: r });
      s = play(s, { type: "select", player: "human", card: r });
      s = play(s, { type: "draw" });
      if (s.turn === "bot")
        s = play(s, { type: "act", player: "bot", action: { type: "check" } });
      s = play(s, {
        type: "act",
        player: "human",
        action: { type: "bet", total: 2 },
      });
      s = play(s, { type: "act", player: "bot", action: { type: "fold" } });
      s = play(s, { type: "next" });
    }
    s = play(s, { type: "select", player: "bot", card: 9 });
    s = play(s, { type: "select", player: "human", card: 13 });
    s = play(s, { type: "draw" });
    s = play(s, {
      type: "act",
      player: "human",
      action: { type: "bet", total: 120 },
    });
    s = play(s, { type: "act", player: "bot", action: { type: "call" } });
    s = play(s, { type: "next" });
    const v = getPlayerView(s, "bot", false),
      policy = cardPolicy(v, "hard");
    expect(s.chips.bot).toBe(24);
    expect(policy.find((c) => c.card === 13)!.probability).toBeGreaterThan(
      policy.find((c) => c.card === 10)!.probability,
    );
  });
  it("同じ全額ベットでも、見せたブラフと強い札の履歴で読みと行動が変わる", () => {
    const bluff = faceAllIn(true),
      value = faceAllIn(false),
      bm = analyseOpponent(bluff),
      vm = analyseOpponent(value);
    expect(bm.bluffRate).toBeGreaterThan(vm.bluffRate);
    expect(estimateCall(bluff)).toBeGreaterThan(estimateCall(value));
    expect(equity(7, "BIG", bm.range).equity).toBeGreaterThan(
      equity(7, "BIG", vm.range).equity,
    );
  });
  it("全額ベットを最強札だとも最弱ブラフだとも断定せず、両方の候補を残す", () => {
    const range = analyseOpponent(faceAllIn(true)).range;
    expect(range.find((c) => c.card === 3)!.probability).toBeGreaterThan(0);
    expect(range.find((c) => c.card === 11)!.probability).toBeGreaterThan(0);
    expect(range.find((c) => c.card === 1)!.probability).toBe(0);
    expect(range.reduce((s, c) => s + c.probability, 0)).toBeCloseTo(1);
  });
  it("隠れた廃棄札は候補から勝手に除かず、秘密だけを変えても推定も行動も変わらない", () => {
    const { session } = comebackFixture();
    const state = replay({ ...session, entries: session.entries.slice(0, -1) }),
      v = getPlayerView(state, "bot", false),
      clone = structuredClone(state);
    clone.selected.human = 11;
    for (const round of clone.history)
      if (round.reason === "fold") round.cards.human = 14 - round.cards.human;
    const hidden = getPlayerView(clone, "bot", false);
    expect(hidden).toEqual(v);
    expect(analyseOpponent(hidden)).toEqual(analyseOpponent(v));
    expect(chooseAction(hidden, "hard", () => 0.4)).toEqual(
      chooseAction(v, "hard", () => 0.4),
    );
    expect(analyseOpponent(v).range.every((c) => c.probability > 0)).toBe(true);
  });
  it("相手から見える自分のブラフと強い札だけをイメージとして数える", () => {
    const bluff = getPlayerView(faceAllInState(true), "human", false);
    const copy = structuredClone(bluff);
    for (const r of copy.history) {
      r.reason = "fold";
      r.cards.bot = null;
    }
    expect(analyseOpponent(bluff).ownShownBluffs).toBeGreaterThan(0);
    expect(analyseOpponent(copy).ownShownBluffs).toBe(0);
    expect(analyseOpponent(copy).shownBets).toBe(0);
  });
  it("負けない最大札を持っていれば全額ベットでも降りない", () => {
    let s = createGame(true, "pressure");
    s = play(s, { type: "select", player: "bot", card: 13 });
    s = play(s, { type: "select", player: "human", card: 12 });
    s = play(s, { type: "draw" });
    s = play(s, {
      type: "act",
      player: "human",
      action: { type: "bet", total: 298 },
    });
    const v = getPlayerView(s, "bot", false);
    for (const roll of [0, 0.2, 0.5, 0.999])
      expect(chooseAction(v, "hard", () => roll).type).toBe("call");
  });
  it("よく大きく張る相手には、強い札で待つ候補が増える", () => {
    function view(aggressive: boolean) {
      let s = revealHistory(
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        Array<Mode>(9).fill("BIG"),
        aggressive,
      );
      s = play(s, { type: "select", player: "bot", card: 13 });
      s = play(s, { type: "select", player: "human", card: 10 });
      s = play(s, { type: "draw" });
      return getPlayerView(s, "bot", false);
    }
    const active = view(true),
      quiet = view(false),
      ap = actionPolicy(active, "hard"),
      qp = actionPolicy(quiet, "hard");
    console.log("trap response", JSON.stringify({ active: ap, quiet: qp }));
    expect(
      ap.find((x) => x.action.type === "check")?.probability ?? 0,
    ).toBeGreaterThan(
      qp.find((x) => x.action.type === "check")?.probability ?? 0,
    );
  });
  it("返すのは常に同じ合法手集合の行動で、悪い乱数を拒否する", () => {
    const { state } = comebackFixture(),
      v = getPlayerView(state, "human", false);
    for (const level of ["easy", "medium", "hard"] as const)
      for (const roll of [0, 0.5, 0.999])
        expect(getLegalActions(state, "human")).toContainEqual(
          chooseAction(v, level, () => roll),
        );
    expect(() => chooseAction(v, "hard", () => 1)).toThrow();
    expect(() =>
      chooseCard(getPlayerView(createGame(false, "pressure"), "bot"), "hard", () => NaN),
    ).toThrow();
  });
  it("判断ログの保存は安全なコードだけに絞り、ルールの再生に影響しない", () => {
    expect(
      safeBotLogs([
        { round: 1, kind: "bet", reason: "trap" },
        { round: 0, kind: "bet", reason: "bluff" },
        { round: 1, kind: "bet", reason: "constructor" },
        { round: 1, kind: "bet", reason: "secret card 13" },
      ]),
    ).toEqual([{ round: 1, kind: "bet", reason: "trap" }]);
    const { session } = comebackFixture();
    expect(
      replay({
        ...session,
        botDecisions: [{ round: 1, kind: "bet", reason: "bluff" }],
      }),
    ).toEqual(replay(session));
  });
});
function estimateCall(view: ReturnType<typeof getPlayerView>) {
  return actionPolicy(view, "hard")
    .filter((a) => a.action.type === "call")
    .reduce((s, a) => s + a.probability, 0);
}
function facingHistory(fold: boolean, card = 5) {
  let s = createGame(false, "pressure");
  for (let r = 1; r <= 4; r++) {
    s = play(s, { type: "select", player: "bot", card: r });
    s = play(s, { type: "select", player: "human", card: r });
    s = play(s, { type: "draw" });
    if (s.turn === "human")
      s = play(s, { type: "act", player: "human", action: { type: "check" } });
    s = play(s, {
      type: "act",
      player: "bot",
      action: { type: "bet", total: s.betLimit! },
    });
    s = play(s, {
      type: "act",
      player: "human",
      action: { type: fold ? "fold" : "call" },
    });
    s = play(s, { type: "next" });
  }
  s = play(s, { type: "select", player: "bot", card });
  s = play(s, { type: "select", player: "human", card: 6 });
  s = play(s, { type: "draw" });
  s = play(s, { type: "act", player: "human", action: { type: "check" } });
  return getPlayerView(s, "bot", false);
}
it("同じ弱い札でも、よく降りる相手へはブラフ候補が増え、受ける相手へは減る", () => {
  const folder = facingHistory(true),
    caller = facingHistory(false);
  expect(analyseOpponent(folder).foldLarge).toBeGreaterThan(
    analyseOpponent(caller).foldLarge,
  );
  const aggression = (v: ReturnType<typeof getPlayerView>) =>
    actionPolicy(v, "hard")
      .filter((x) => "total" in x.action)
      .reduce((s, x) => s + x.probability, 0);
  expect(aggression(folder)).toBeGreaterThan(aggression(caller));
});
it("見せたブラフの後に強い札で張る狙いを、実際の判断時に記録する", () => {
  const v = facingHistory(false, 13);
  expect(analyseOpponent(v).ownShownBluffs).toBeGreaterThan(0);
  const options = actionPolicy(v, "hard");
  const index = options.findIndex((o) => "total" in o.action);
  expect(index).toBeGreaterThanOrEqual(0);
  const roll =
    options.slice(0, index).reduce((sum, o) => sum + o.probability, 0) +
    options[index].probability / 2;
  expect(decideAction(v, "hard", () => roll).log.reason).toBe(
    "value-after-bluff",
  );
});
