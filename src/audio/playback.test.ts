import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { preferences } from "./chime";
import voiceIndex from "./voice-index.json";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("試聴用PCMは無音でなく、十分な振幅と長さを持つ", () => {
  const data = readFileSync("public/signal-preview.wav");
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
  expect(peak).toBeGreaterThan(0.75);
  expect(Math.sqrt(squares / count)).toBeGreaterThan(0.05);
  expect(count / 22050).toBeGreaterThan(11);
});
it("保存済みの音量0やOFFを勝手に書き換えない", () => {
  expect(preferences({ volume: 0, chime: false })).toMatchObject({
    volume: 0,
    chime: false,
  });
  expect(preferences({})).toMatchObject({ volume: 0.8 });
  expect(preferences({ voice: false })).toMatchObject({
    voice: true,
    soundProfile: "time-signal",
  });
  expect(
    preferences({ voice: false, soundProfile: "time-signal" }),
  ).toMatchObject({ voice: false });
});
it("内蔵音声は24時間・全60分・00/20/40秒を網羅し、予告時間内に読める", () => {
  const index: Record<string, { start: number; length: number }> = voiceIndex;
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m++)
      for (const s of [0, 20, 40]) {
        const clips = [`hour-${h}`, `minute-${m}`, `second-${s}`].map(
          (key) => index[key],
        );
        expect(clips.every((c) => c.start >= 0 && c.length > 0.1)).toBe(true);
        expect(clips.reduce((n, c) => n + c.length, 0) + 0.16).toBeLessThan(
          6.5,
        );
      }
  expect(readFileSync("public/time-voice.mp3").length).toBeGreaterThan(500000);
});
it("実際のWAVの秒音・予告音・長音は異なる周波数と長さを持つ", () => {
  for (const [name, hz, length] of [
    ["tick", 2000, 0.035],
    ["pip", 500, 0.14],
    ["chime", 1000, 1.5],
  ] as const) {
    const bytes = readFileSync(`public/${name}.wav`),
      rate = bytes.readUInt32LE(24);
    const samples = Array.from({ length: (bytes.length - 44) / 2 }, (_, i) =>
      bytes.readInt16LE(44 + i * 2),
    );
    let rising = 0;
    for (let i = 1; i < samples.length; i++)
      if (samples[i - 1] <= 0 && samples[i] > 0) rising++;
    expect(samples.length / rate).toBeCloseTo(length, 3);
    expect(rising / (samples.length / rate)).toBeCloseTo(hz, -1);
  }
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
    getAttribute(name: string) {
      return name === "src" ? this.src : null;
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
