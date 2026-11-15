import { expect, it } from "vitest";
import { createMatch, derive, type Match } from "../domain/game";
import { TurnClock } from "./clock";
function setup() {
  let mono = 0,
    wall = 1000,
    id = 0,
    m: Match = createMatch("m", 0, { A: "A", B: "B" }, "A");
  const c = new TurnClock(
    () => m,
    (next) => {
      m = next;
    },
    () => {},
    { monotonic: () => mono, wall: () => wall, id: () => String(++id) },
  );
  return {
    c,
    get: () => m,
    advance: (ms: number) => {
      mono = ms;
    },
    wall: (ms: number) => {
      wall = ms;
    },
  };
}
it("開始は即時計測、タップ開始時刻を記録、連打を無視", () => {
  const t = setup();
  t.c.start();
  t.advance(12400);
  t.c.input("drop");
  t.advance(13000);
  t.c.input("drop");
  t.advance(19800);
  t.c.input("check");
  t.c.input("check");
  t.c.tick();
  expect(derive(t.get()).turns).toHaveLength(1);
  expect(derive(t.get()).scores.B.currentAccumulatedMs).toBe(7400);
});
it("60秒ちょうどのチェックより時間切れを優先", () => {
  const t = setup();
  t.c.start();
  t.advance(59500);
  t.c.input("drop");
  t.advance(60000);
  t.c.input("check");
  expect(derive(t.get()).turns[0].reason).toBe("check-timeout");
  expect(derive(t.get()).turns[0].checkElapsedMs).toBeNull();
});
it("同ミリ秒の落下とチェックは失敗", () => {
  const t = setup();
  t.c.start();
  t.advance(123);
  t.c.input("drop");
  t.c.input("check");
  expect(derive(t.get()).turns[0].reason).toBe("early-check");
});
it("先チェックは即確定し、その後の落下を無視", () => {
  const t = setup();
  t.c.start();
  t.advance(20100);
  t.c.input("check");
  t.c.input("drop");
  expect(derive(t.get()).turns[0].dropElapsedMs).toBeNull();
  expect(derive(t.get()).turns).toHaveLength(1);
});
it("壁時計が変わっても単調時計の経過だけを使う", () => {
  const t = setup();
  t.c.start();
  t.advance(12400);
  t.c.input("drop");
  t.wall(9999999);
  t.advance(19800);
  t.c.input("check");
  expect(derive(t.get()).turns[0].addedMs).toBe(7400);
});
it("遅延したタイマーは60秒で一回だけ確定、無操作の二重ペナルティなし", () => {
  const t = setup();
  t.c.start();
  t.advance(72000);
  t.c.tick();
  t.c.tick();
  expect(derive(t.get()).scores.A.consumedMs).toBe(60000);
  expect(derive(t.get()).scores.B.consumedMs).toBe(0);
  expect(derive(t.get()).turns).toHaveLength(1);
});
it("非表示で無効化し、後からタイマーを進めても偽の結果を作らない", () => {
  const t = setup();
  t.c.start();
  t.advance(5000);
  t.c.input("drop");
  t.c.interrupt("非表示");
  t.advance(70000);
  t.c.tick();
  expect(derive(t.get()).turns).toHaveLength(0);
  expect(t.get().active).toBeNull();
});
