import { expect, it } from "vitest";
import { announcement, TimeSignalPlanner } from "./signal";
it("10秒ごとを長音にし、毎分57・58・59秒も予告する", () => {
  const p = new TimeSignalPlanner(),
    start = Date.UTC(2026, 10, 15, 23, 20, 45);
  const cues = [];
  for (let elapsed = 0; elapsed <= 15000; elapsed += 200)
    cues.push(...p.step(start + elapsed, elapsed, true).cues);
  const marked = cues.filter((c) => c.tone !== "tick");
  expect(marked.map((c) => [c.at - start, c.tone])).toEqual([
    [5000, "bell"],
    [12000, "pip"],
    [13000, "pip"],
    [14000, "pip"],
    [15000, "bell"],
  ]);
  expect(new Set(cues.map((c) => c.at)).size).toBe(cues.length);
});
it("全秒を刻み、10秒ごとを3秒前から予告する", () => {
  const p = new TimeSignalPlanner(),
    start = Date.UTC(2026, 10, 15, 8, 8, 0),
    cues = [];
  for (let elapsed = 0; elapsed < 60000; elapsed += 200)
    cues.push(...p.step(start + elapsed, elapsed, true).cues);
  expect(cues.filter((c) => c.at < start + 60000)).toHaveLength(60);
  expect(
    cues
      .filter((c) => c.announceAt)
      .map((c) => [c.at - start, c.announceAt! - start]),
  ).toEqual([
    [7000, 10000],
    [17000, 20000],
    [27000, 30000],
    [37000, 40000],
    [47000, 50000],
    [57000, 60000],
  ]);
});
it("経過時間だけを読み、実際の時・分を使わない", () => {
  expect(announcement(10000)).toEqual({
    text: "10秒をお知らせします",
    keys: ["second-10"],
  });
  expect(announcement(60000)).toEqual({
    text: "1分をお知らせします",
    keys: ["second-60"],
  });
});
it("時計修正は予定を破棄し新境界へ同期", () => {
  const p = new TimeSignalPlanner();
  p.step(59000, 0, true);
  const changed = p.step(118900, 100, true);
  expect(changed.cancel).toBe(true);
  expect(changed.cues.map((c) => c.at)).toEqual([119000]);
});
it("復帰後に過去の秒・時報・読み上げをまとめて再生しない", () => {
  const p = new TimeSignalPlanner();
  p.step(59000, 0, true);
  p.step(59500, 500, false);
  const resumed = p.step(180010, 121010, true);
  expect(resumed.cues.map((c) => c.at)).toEqual([181000]);
  expect(resumed.cues[0].tone).toBe("tick");
  expect(resumed.cues[0].announceAt).toBeUndefined();
});
it("OFFと同一時刻の再呼び出しが余分な音を作らない", () => {
  const p = new TimeSignalPlanner();
  expect(p.step(60000, 0, false)).toEqual({ cancel: false, cues: [] });
  expect(p.step(120000, 60000, true).cues).toHaveLength(2);
  expect(p.step(120000, 60000, true).cues).toHaveLength(0);
  expect(p.step(120100, 60100, false)).toEqual({ cancel: true, cues: [] });
  expect(p.step(120200, 60200, false)).toEqual({ cancel: false, cues: [] });
});
