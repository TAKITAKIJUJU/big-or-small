import { expect, it } from "vitest";
import { MinutePlanner } from "./chime";
it("ターン開始と無関係に実時刻の毎分00を予定する", () => {
  const p = new MinutePlanner(),
    start = Date.UTC(2026, 10, 15, 23, 20, 45);
  expect(p.step(start, 0, true).at).toBeNull();
  expect(p.step(start + 14000, 14000, true).at).toBe(start + 15000);
  expect(p.step(start + 14500, 14500, true).at).toBeNull();
});
it("23:59から翌日の00:00も境界を計算", () => {
  const p = new MinutePlanner(),
    now = Date.UTC(2026, 10, 15, 23, 59, 59);
  expect(p.step(now, 0, true).at).toBe(Date.UTC(2026, 10, 16, 0, 0, 0));
});
it("時計修正は予定を破棄し新境界へ同期", () => {
  const p = new MinutePlanner();
  expect(p.step(59000, 0, true).at).toBe(60000);
  const changed = p.step(118900, 100, true);
  expect(changed.cancel).toBe(true);
  expect(changed.at).toBe(120000);
});
it("復帰後に過去の時報をまとめて再生しない", () => {
  const p = new MinutePlanner();
  p.step(59000, 0, true);
  p.step(59500, 500, false);
  expect(p.step(180010, 121010, true).at).toBeNull();
  expect(p.step(239000, 180000, true).at).toBe(240000);
});
it("OFFと境界重複が余分な時報を作らない", () => {
  const p = new MinutePlanner();
  expect(p.step(60000, 0, false).at).toBeNull();
  expect(p.step(120000, 60000, true).at).toBe(120000);
  expect(p.step(120000, 60000, true).at).toBeNull();
});
