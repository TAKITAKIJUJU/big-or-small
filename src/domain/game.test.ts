import { describe, expect, it } from "vitest";
import {
  adjudicate,
  createMatch,
  derive,
  finishTurn,
  interruptTurn,
  startTurn,
  total,
  voidLast,
  type Match,
  type TurnInput,
} from "./game";
let id = 0;
function play(m: Match, input: TurnInput) {
  return finishTurn(
    startTurn(m, { id: `t-${++id}`, startedAt: id * 60000 }),
    input,
    id * 60000 + 59999,
  );
}
function fresh() {
  return createMatch(`m-${++id}`, 1000, { A: "A", B: "B" }, "B");
}
function aTurn(m: Match, input: TurnInput) {
  if (derive(m).dropper === "A")
    m = play(m, { dropElapsedMs: 0, checkElapsedMs: 1 });
  return play(m, input);
}
describe("整数ミリ秒の判定", () => {
  it.each([
    [12400, 19800, "success", 7400],
    [null, 20100, "early-check", 0],
    [59500, 59900, "success", 400],
    [59500, null, "check-timeout", 0],
    [null, null, "drop-timeout", 0],
    [1000, 1000, "early-check", 0],
    [2000, 1000, "early-check", 0],
    [59500, 60000, "check-timeout", 0],
    [60000, 60000, "drop-timeout", 0],
    [0, 0, "early-check", 0],
  ])("%s → %s は %s", (drop, check, reason, added) => {
    const r = adjudicate({
      dropElapsedMs: drop as number | null,
      checkElapsedMs: check as number | null,
    });
    expect(r.reason).toBe(reason);
    expect(r.addedMs).toBe(added);
    expect(r.penaltyMs).toBe(reason === "success" ? 0 : 60000);
  });
  it.each([NaN, Infinity, -1, 1.5])("不正時刻 %s を拒否", (t) =>
    expect(() => adjudicate({ dropElapsedMs: t, checkElapsedMs: 2 })).toThrow(),
  );
});
describe("蓄積・消化・ペナルティの分離", () => {
  it("蓄積90秒で失敗すると消化150秒・ペナルティ60秒・累計150秒", () => {
    let m = aTurn(fresh(), { dropElapsedMs: 0, checkElapsedMs: 45000 });
    m = aTurn(m, { dropElapsedMs: 0, checkElapsedMs: 45000 });
    expect(derive(m).scores.A.currentAccumulatedMs).toBe(90000);
    m = aTurn(m, { dropElapsedMs: null, checkElapsedMs: 20100 });
    expect(derive(m).scores.A).toEqual({
      currentAccumulatedMs: 0,
      consumedMs: 150000,
      penaltyLifetimeMs: 60000,
    });
    expect(total(derive(m).scores.A)).toBe(150000);
  });
  it("成功→失敗→成功→失敗を再計算しても二重計上しない", () => {
    let m = fresh();
    for (const input of [
      { dropElapsedMs: 12400, checkElapsedMs: 19800 },
      { dropElapsedMs: null, checkElapsedMs: 1 },
      { dropElapsedMs: 0, checkElapsedMs: 10000 },
      { dropElapsedMs: 2000, checkElapsedMs: 2000 },
    ])
      m = aTurn(m, input);
    expect(derive(m).scores.A).toEqual({
      currentAccumulatedMs: 0,
      consumedMs: 137400,
      penaltyLifetimeMs: 120000,
    });
    expect(derive(structuredClone(m))).toEqual(derive(m));
  });
  it("消化済み100秒＋蓄積200秒で即敗北、蓄積を勝手に消化しない", () => {
    let m = aTurn(fresh(), { dropElapsedMs: 0, checkElapsedMs: 40000 });
    m = aTurn(m, { dropElapsedMs: null, checkElapsedMs: 1 });
    for (let i = 0; i < 4; i++)
      m = aTurn(m, { dropElapsedMs: 0, checkElapsedMs: 50000 });
    const d = derive(m);
    expect(d.loser).toBe("A");
    expect(d.winner).toBe("B");
    expect(d.scores.A).toEqual({
      currentAccumulatedMs: 200000,
      consumedMs: 100000,
      penaltyLifetimeMs: 60000,
    });
    expect(() => startTurn(m, { id: "x", startedAt: 0 })).toThrow();
  });
  it("成功だけで300秒に達しても敗北", () => {
    let m = fresh();
    for (let i = 0; i < 6; i++)
      m = aTurn(m, { dropElapsedMs: 0, checkElapsedMs: 50000 });
    expect(derive(m).loser).toBe("A");
    expect(derive(m).scores.A.consumedMs).toBe(0);
  });
  it("失敗5回で300秒になり敗北", () => {
    let m = fresh();
    for (let i = 0; i < 5; i++)
      m = aTurn(m, { dropElapsedMs: null, checkElapsedMs: 1 });
    expect(derive(m).loser).toBe("A");
  });
  it("D未落下はDだけ、落下済み未チェックはCだけにペナルティ", () => {
    const a = derive(
        play(fresh(), { dropElapsedMs: null, checkElapsedMs: null }),
      ),
      b = derive(play(fresh(), { dropElapsedMs: 59500, checkElapsedMs: null }));
    expect(a.scores.B.consumedMs).toBe(60000);
    expect(a.scores.A.consumedMs).toBe(0);
    expect(b.scores.A.consumedMs).toBe(60000);
    expect(b.scores.B.consumedMs).toBe(0);
    expect(b.scores.A.currentAccumulatedMs).toBe(0);
  });
  it("役割は確定ターンだけで交代、中断は状態を変えず再開", () => {
    let m = fresh();
    const initial = derive(m);
    m = startTurn(m, { id: "active", startedAt: 5000 });
    m = interruptTurn(m, "abort", 6000, 1000, "画面非表示");
    expect(derive(m).scores).toEqual(initial.scores);
    expect(derive(m).dropper).toBe("B");
    m = play(m, { dropElapsedMs: 1, checkElapsedMs: 2 });
    expect(derive(m).dropper).toBe("A");
  });
  it("直前ターン無効化は監査記録を残し、終了判定と役割を巻き戻す", () => {
    let m = fresh();
    for (let i = 0; i < 5; i++)
      m = aTurn(m, { dropElapsedMs: null, checkElapsedMs: 1 });
    const count = m.events.length,
      last = derive(m).turns.at(-1)!;
    m = voidLast(m, "void", 1000000, "両者合意・誤タップ");
    expect(m.events).toHaveLength(count + 1);
    expect(derive(m).loser).toBeNull();
    expect(derive(m).voids.has(last.id)).toBe(true);
    expect(derive(m).dropper).toBe(last.dropper);
    expect(total(derive(m).scores.A)).toBe(240000);
  });
  it("二重確定と不正訂正を拒否", () => {
    const m = play(fresh(), { dropElapsedMs: 1, checkElapsedMs: 2 });
    expect(() =>
      finishTurn(m, { dropElapsedMs: 1, checkElapsedMs: 2 }, 0),
    ).toThrow();
    expect(() => voidLast(m, "v", 1, " ")).toThrow();
  });
  it("JSON往復で全ターン詳細と集計が一致", () => {
    let m = fresh();
    for (let i = 0; i < 100; i++)
      m = play(m, { dropElapsedMs: 10, checkElapsedMs: 11 });
    expect(derive(JSON.parse(JSON.stringify(m)))).toEqual(derive(m));
  });
});
