import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { preferences } from "./chime";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("試聴用PCMは無音でなく、十分な振幅と長さを持つ", () => {
  const data = readFileSync("public/chime.wav");
  expect(data.toString("ascii", 0, 4)).toBe("RIFF");
  expect(data.toString("ascii", 8, 12)).toBe("WAVE");
  let peak = 0,
    squares = 0,
    count = 0;
  for (let i = 44; i + 1 < data.length; i += 2) {
    const x = data.readInt16LE(i) / 32768;
    peak = Math.max(peak, Math.abs(x));
    squares += x * x;
    count++;
  }
  expect(peak).toBeGreaterThan(0.8);
  expect(Math.sqrt(squares / count)).toBeGreaterThan(0.12);
  expect(count / 44100).toBeGreaterThan(1.2);
});
it("保存済みの音量0やOFFを勝手に書き換えない", () => {
  expect(preferences({ volume: 0, chime: false })).toMatchObject({
    volume: 0,
    chime: false,
  });
  expect(preferences({})).toMatchObject({ volume: 0.8 });
});
it("時報OFFや予約取消が、独立した試聴を途中で停止しない", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  class FakeAudio {
    static all: FakeAudio[] = [];
    muted = false;
    volume = 1;
    preload = "";
    currentTime = 0;
    paused = true;
    onplaying: (() => void) | null = null;
    onpause: (() => void) | null = null;
    onended: (() => void) | null = null;
    constructor(public src: string) {
      FakeAudio.all.push(this);
    }
    play() {
      this.paused = false;
      this.onplaying?.();
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.onpause?.();
    }
  }
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("window", {});
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        throw new Error("no web audio");
      }
    },
  );
  const audio = await import("./chime"),
    playing = vi.fn();
  await audio.previewChime({ ...audio.DEFAULTS, chime: false }, playing);
  const sample = FakeAudio.all.find((p) => p.onplaying !== null)!;
  audio.cancelSound();
  await vi.advanceTimersByTimeAsync(1000);
  expect(sample.paused).toBe(false);
  expect(sample.volume).toBe(0.8);
  expect(playing).toHaveBeenLastCalledWith(true);
  audio.cancelSound(true);
  expect(sample.paused).toBe(true);
  expect(playing).toHaveBeenLastCalledWith(false);
});
it("全ての再生経路が拒否された場合に、再生済みと返さない", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        throw new Error("blocked");
      }
    },
  );
  vi.stubGlobal(
    "Audio",
    class {
      muted = false;
      volume = 1;
      currentTime = 0;
      pause() {}
      play() {
        return Promise.reject(new Error("blocked"));
      }
    },
  );
  const audio = await import("./chime");
  await expect(audio.previewChime(audio.DEFAULTS, vi.fn())).rejects.toThrow(
    "拒否",
  );
  await expect(
    audio.previewChime({ ...audio.DEFAULTS, volume: 0 }, vi.fn()),
  ).rejects.toThrow("0%");
});
