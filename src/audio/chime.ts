import voiceIndex from "./voice-index.json";
import { announcement, TONES, type Tone } from "./signal";
export type Preferences = {
  hand: "left" | "right";
  chime: boolean;
  volume: number;
  voice: boolean;
  reduced: boolean;
  soundProfile: "time-signal";
};
export const DEFAULTS: Preferences = {
  hand: "right",
  chime: true,
  volume: 0.8,
  voice: true,
  reduced: false,
  soundProfile: "time-signal",
};
export function preferences(raw: unknown): Preferences {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Preferences>;
  return {
    hand: p.hand === "left" ? "left" : "right",
    chime: typeof p.chime === "boolean" ? p.chime : true,
    volume:
      typeof p.volume === "number" && Number.isFinite(p.volume)
        ? Math.max(0, Math.min(1, p.volume))
        : 0.8,
    // 旧チャイムから時報へ初めて移行するときは、依頼された読み上げも有効化する。
    voice: p.soundProfile === "time-signal" ? p.voice !== false : true,
    reduced: p.reduced === true,
    soundProfile: "time-signal",
  };
}
const clips: Record<string, { start: number; length: number; text: string }> =
  voiceIndex;
const paths: Record<Tone, string> = {
  tick: "/tick.wav",
  pip: "/pip.wav",
  bell: "/chime.wav",
};
let context: AudioContext | null = null;
let voiceBuffer: AudioBuffer | null = null;
let loadingVoice: Promise<void> | null = null;
let voiceData: Promise<ArrayBuffer> | null = null;
let voiceAssets: Promise<void> | null = null;
let mediaReady = false;
let priming: Promise<void> | null = null;
const toneMedia = new Map<Tone, HTMLAudioElement>();
const retiringMedia = new Set<HTMLAudioElement>();
let preparation = 0;
let voiceMedia: HTMLAudioElement | null = null;
let previewMedia: HTMLAudioElement | null = null;
let previewVoiceMedia: HTMLAudioElement | null = null;
let previewActive = false;
const voiceGeneration = new WeakMap<HTMLAudioElement, number>();
let previewState: ((playing: boolean) => void) | undefined;
type Pool = {
  nodes: Set<AudioScheduledSourceNode>;
  timers: Set<ReturnType<typeof setTimeout>>;
  generation: number;
};
const scheduled: Pool = { nodes: new Set(), timers: new Set(), generation: 0 };
const preview: Pool = { nodes: new Set(), timers: new Set(), generation: 0 };
type Failure = (message: string) => void;
function timer(pool: Pool, callback: () => void, delay: number) {
  const id = setTimeout(
    () => {
      pool.timers.delete(id);
      callback();
    },
    Math.max(0, delay),
  );
  pool.timers.add(id);
}
function player(kind: Tone) {
  if (!toneMedia.has(kind)) {
    const audio = new Audio(paths[kind]);
    audio.preload = "auto";
    toneMedia.set(kind, audio);
  }
  return toneMedia.get(kind)!;
}
function voicePlayer(pool = scheduled) {
  if (pool === preview) {
    previewVoiceMedia ??= new Audio();
    previewVoiceMedia.dataset.voiceSource = "/time-voice.mp3";
    previewVoiceMedia.preload = "auto";
    return previewVoiceMedia;
  }
  voiceMedia ??= new Audio();
  voiceMedia.dataset.voiceSource = "/time-voice.mp3";
  voiceMedia.preload = "auto";
  return voiceMedia;
}
const ready = () => context?.state === "running" || mediaReady;
export const isAudioReady = () => ready() && !previewActive;
function voiceBytes() {
  voiceData ??= fetch("/time-voice.mp3")
    .then((r) => {
      if (!r.ok) throw new Error("voice unavailable");
      return r.arrayBuffer();
    })
    .catch((error) => {
      voiceData = null;
      throw error;
    });
  return voiceData;
}
/** 初回のCDN応答がRange非対応でも、全音声をローカルBlobにして確実にシークする。 */
function prepareVoiceMedia() {
  voiceAssets ??= voiceBytes()
    .then(async (bytes) => {
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "audio/mpeg" }),
      );
      try {
        await Promise.all(
          [scheduled, preview].map(
            (pool) =>
              new Promise<void>((resolve, reject) => {
                const audio = voicePlayer(pool);
                const clean = () => {
                  audio.removeEventListener("loadedmetadata", loaded);
                  audio.removeEventListener("error", failed);
                };
                const loaded = () => {
                  clean();
                  resolve();
                };
                const failed = () => {
                  clean();
                  reject(new Error("voice metadata unavailable"));
                };
                audio.addEventListener("loadedmetadata", loaded);
                audio.addEventListener("error", failed);
                audio.src = url;
                audio.load();
              }),
          ),
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
    })
    .catch((error) => {
      voiceAssets = null;
      throw error;
    });
  return voiceAssets;
}
function loadVoice() {
  if (!context || loadingVoice || voiceBuffer) return;
  const ctx = context;
  loadingVoice = voiceBytes()
    .then((data) => ctx.decodeAudioData(data.slice(0)))
    .then((buffer) => {
      if (context === ctx) voiceBuffer = buffer;
    })
    .catch(() => {
      /* Prepared HTML Audio remains available. */
    })
    .finally(() => {
      if (context === ctx) loadingVoice = null;
    });
}
/** 操作中に再生経路を無音で準備。開始時の採時を待たせない。 */
export async function unlockAudio(refreshMedia = false) {
  const wasReady = ready();
  const previousState = context?.state;
  let replacedContext = false;
  const attempts: Promise<unknown>[] = [];
  try {
    if (!context || context.state === "closed") {
      context = new AudioContext({ latencyHint: "interactive" });
      voiceBuffer = null;
      loadingVoice = null;
      replacedContext = true;
    }
    attempts.push(context.resume());
    loadVoice();
  } catch {
    /* HTML Audio fallback */
  }
  if (refreshMedia || (!mediaReady && !priming)) {
    const generation = ++preparation;
    const candidates = new Map(
      (Object.keys(paths) as Tone[]).map((kind) => {
        const audio = new Audio(paths[kind]);
        audio.preload = "auto";
        return [kind, audio] as const;
      }),
    );
    const prime = async (audio: HTMLAudioElement) => {
      audio.muted = true;
      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
      } finally {
        audio.muted = false;
      }
    };
    // 同じユーザー操作内で全てのplay()を呼ぶ。
    const toneAttempts = [...candidates.values()].map(prime);
    priming = Promise.all(toneAttempts)
      .then(() => {
        if (generation !== preparation) return;
        // 今鳴っている長音を切らずに、次のターン用の再生経路へ交代する。
        for (const old of toneMedia.values())
          if (!old.paused) {
            retiringMedia.add(old);
            const ended = () => {
              retiringMedia.delete(old);
              old.removeEventListener("ended", ended);
              old.removeEventListener("pause", ended);
            };
            old.addEventListener("ended", ended);
            old.addEventListener("pause", ended);
          }
        toneMedia.clear();
        for (const [kind, audio] of candidates) toneMedia.set(kind, audio);
        mediaReady = true;
      })
      .catch(() => {
        if (generation === preparation) mediaReady = false;
      })
      .finally(() => {
        if (generation === preparation) priming = null;
      });
  }
  void prepareVoiceMedia().catch(() => {});
  if (priming) attempts.push(priming);
  await Promise.race([
    Promise.allSettled(attempts),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  if (!ready())
    throw new Error(
      "このブラウザが音声再生を許可していません。Chromeで開いて再試聴してください",
    );
  return (
    !wasReady ||
    replacedContext ||
    (previousState !== "running" && context?.state === "running")
  );
}
function stop(pool: Pool) {
  pool.generation++;
  for (const node of pool.nodes) {
    try {
      node.stop();
    } catch {
      /* ended */
    }
  }
  pool.nodes.clear();
  for (const id of pool.timers) clearTimeout(id);
  pool.timers.clear();
}
export function cancelSound(includePreview = false) {
  stop(scheduled);
  for (const audio of toneMedia.values()) audio.pause();
  for (const audio of retiringMedia) audio.pause();
  retiringMedia.clear();
  voiceMedia?.pause();
  if (voiceMedia)
    voiceGeneration.set(voiceMedia, (voiceGeneration.get(voiceMedia) ?? 0) + 1);
  if (includePreview) stopPreview();
}
export function stopPreview() {
  previewMedia?.pause();
  previewVoiceMedia?.pause();
  if (previewVoiceMedia)
    voiceGeneration.set(
      previewVoiceMedia,
      (voiceGeneration.get(previewVoiceMedia) ?? 0) + 1,
    );
  stop(preview);
  previewActive = false;
  previewState?.(false);
}
function synthTone(p: Preferences, kind: Tone, delayMs: number, pool: Pool) {
  if (context?.state !== "running") return false;
  const spec = TONES[kind],
    at = context.currentTime + Math.max(0, delayMs) / 1000;
  const oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = spec.frequency;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(p.volume * spec.level, at + 0.003);
  if (kind === "bell")
    gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.length);
  else {
    gain.gain.setValueAtTime(p.volume * spec.level, at + spec.length - 0.008);
    gain.gain.linearRampToValueAtTime(0, at + spec.length);
  }
  oscillator.connect(gain).connect(context.destination);
  pool.nodes.add(oscillator);
  oscillator.start(at);
  oscillator.stop(at + spec.length + 0.01);
  oscillator.onended = () => {
    pool.nodes.delete(oscillator);
    oscillator.disconnect();
    gain.disconnect();
  };
  return true;
}
function speak(
  p: Preferences,
  wall: number,
  delayMs: number,
  pool: Pool,
  onFailure?: Failure,
) {
  const parts = announcement(wall).keys.map((key) => clips[key]);
  const poolGeneration = pool.generation;
  let offset = Math.max(0, delayMs);
  for (const part of parts) {
    if (context?.state === "running" && voiceBuffer) {
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = voiceBuffer;
      gain.gain.value = p.volume;
      source.connect(gain).connect(context.destination);
      pool.nodes.add(source);
      source.start(
        context.currentTime + offset / 1000,
        part.start,
        part.length,
      );
      source.onended = () => {
        pool.nodes.delete(source);
        source.disconnect();
        gain.disconnect();
      };
    } else {
      timer(
        pool,
        () => {
          void prepareVoiceMedia()
            .then(() => {
              if (pool.generation !== poolGeneration) return;
              const audio = voicePlayer(pool);
              audio.pause();
              audio.currentTime = part.start;
              audio.volume = p.volume;
              const generation = (voiceGeneration.get(audio) ?? 0) + 1;
              voiceGeneration.set(audio, generation);
              return audio
                .play()
                .then(() => {
                  if (voiceGeneration.get(audio) !== generation) return;
                  timer(
                    pool,
                    () => {
                      if (voiceGeneration.get(audio) === generation)
                        audio.pause();
                    },
                    part.length * 1000,
                  );
                })
                .catch(() =>
                  onFailure?.(
                    "時刻の読み上げを再生できません。試合の合間に再試聴してください",
                  ),
                );
            })
            .catch(() =>
              onFailure?.(
                "時刻の読み上げを読み込めません。試合の合間に再試聴してください",
              ),
            );
        },
        offset,
      );
    }
    offset += part.length * 1000 + 80;
  }
}
export function playSignal(
  p: Preferences,
  kind: Tone,
  delayMs: number,
  announceAt?: number,
  onFailure?: Failure,
) {
  if (!p.chime || p.volume <= 0 || !isAudioReady()) return false;
  const played = synthTone(p, kind, delayMs, scheduled);
  if (!played && mediaReady)
    timer(
      scheduled,
      () => {
        const audio = player(kind);
        audio.currentTime = 0;
        audio.volume = p.volume;
        void audio.play().catch(() => {
          mediaReady = false;
          onFailure?.(
            "時報の再生が拒否されました。次のターンの前に再試聴してください",
          );
        });
      },
      delayMs,
    );
  if (p.voice && announceAt !== undefined)
    speak(p, announceAt, delayMs, scheduled, onFailure);
  return played || mediaReady;
}
/** 時報OFFでも再生できる独立した11.5秒サンプル。午前8時8分を予告する。 */
export async function previewChime(
  p: Preferences,
  onPlaying: (playing: boolean) => void,
) {
  if (p.volume <= 0)
    throw new Error("音量が0%です。音量を上げてから試聴してください");
  stopPreview();
  const generation = preview.generation;
  previewState = onPlaying;
  cancelSound();
  previewActive = true;
  void unlockAudio().catch(() => {});
  try {
    const src = p.voice ? "/signal-preview-voice.mp3" : "/signal-preview.wav";
    const player = new Audio(src);
    previewMedia = player;
    previewMedia.preload = "auto";
    previewMedia.volume = p.volume;
    previewMedia.currentTime = 0;
    previewMedia.onplaying = () => {
      if (generation !== preview.generation) return;
      previewActive = true;
      onPlaying(true);
    };
    previewMedia.onended = previewMedia.onpause = () => {
      if (generation !== preview.generation) return;
      previewActive = false;
      onPlaying(false);
    };
    // awaitの前にplay()を実行してユーザー操作を引き継ぐ。
    await player.play();
    if (generation !== preview.generation) {
      player.pause();
      return "cancelled" as const;
    }
    return "media" as const;
  } catch {
    if (generation !== preview.generation) return "cancelled" as const;
    if (synthTone(p, "bell", 0, preview)) {
      for (let s = 1; s <= 10; s++)
        synthTone(
          p,
          s === 10 ? "bell" : s >= 7 ? "pip" : "tick",
          s * 1000,
          preview,
        );
      if (p.voice)
        speak(p, new Date(2026, 0, 1, 8, 8).getTime(), 3000, preview);
      onPlaying(true);
      timer(
        preview,
        () => {
          previewActive = false;
          onPlaying(false);
        },
        11500,
      );
      return "synth" as const;
    }
    previewActive = false;
    onPlaying(false);
    throw new Error(
      "ブラウザに音声再生を拒否されました。Chromeで開き直して試聴してください",
    );
  }
}
