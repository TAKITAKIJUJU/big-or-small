export type Preferences = {
  hand: "left" | "right";
  chime: boolean;
  volume: number;
  voice: boolean;
  reduced: boolean;
};
export const DEFAULTS: Preferences = {
  hand: "right",
  chime: true,
  volume: 0.8,
  voice: false,
  reduced: false,
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
    voice: p.voice === true,
    reduced: p.reduced === true,
  };
}
export class MinutePlanner {
  private previous: { wall: number; mono: number } | null = null;
  private scheduled: number | null = null;
  private enabled = false;
  step(wall: number, mono: number, enabled: boolean) {
    const jump =
      this.previous !== null &&
      Math.abs(wall - this.previous.wall - (mono - this.previous.mono)) > 250;
    this.previous = { wall, mono };
    const cancel = jump || (this.enabled && !enabled);
    this.enabled = enabled;
    if (!enabled || jump) this.scheduled = null;
    const boundary =
      wall % 60000 === 0 ? wall : (Math.floor(wall / 60000) + 1) * 60000;
    let at: number | null = null;
    if (enabled && boundary - wall <= 1200 && this.scheduled !== boundary) {
      at = boundary;
      this.scheduled = boundary;
    }
    return { cancel, at };
  }
}

let context: AudioContext | null = null;
let scheduledMedia: HTMLAudioElement | null = null;
let previewMedia: HTMLAudioElement | null = null;
let mediaReady = false;
let sounds: OscillatorNode[] = [];
let previewSounds: OscillatorNode[] = [];
let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
let voiceTimer: ReturnType<typeof setTimeout> | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let previewState: ((playing: boolean) => void) | undefined;
const media = () => {
  scheduledMedia ??= new Audio("/chime.wav");
  scheduledMedia.preload = "auto";
  return scheduledMedia;
};
export const isAudioReady = () => context?.state === "running" || mediaReady;

/** ユーザー操作中に両方の再生経路を準備する。準備時は音を出さない。 */
export async function unlockAudio() {
  const attempts: Promise<unknown>[] = [];
  try {
    context ??= new AudioContext({ latencyHint: "interactive" });
    attempts.push(context.resume());
  } catch {
    /* HTML audio can still work */
  }
  try {
    const player = media();
    player.muted = true;
    const started = player.play();
    attempts.push(
      started
        .then(() => {
          player.pause();
          player.currentTime = 0;
          player.muted = false;
          mediaReady = true;
        })
        .catch(() => {
          player.muted = false;
        }),
    );
  } catch {
    /* Web Audio can still work */
  }
  await Promise.race([
    Promise.allSettled(attempts),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (!isAudioReady())
    throw new Error(
      "このブラウザが音声再生を許可していません。Chromeで開いて再試聴してください",
    );
}
export function cancelSound(includePreview = false) {
  for (const oscillator of sounds) {
    try {
      oscillator.stop();
    } catch {
      /* ended */
    }
  }
  sounds = [];
  if (scheduledTimer) clearTimeout(scheduledTimer);
  if (voiceTimer) clearTimeout(voiceTimer);
  scheduledMedia?.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (includePreview) {
    previewMedia?.pause();
    for (const oscillator of previewSounds) {
      try {
        oscillator.stop();
      } catch {
        /* ended */
      }
    }
    previewSounds = [];
    if (previewTimer) clearTimeout(previewTimer);
    previewState?.(false);
  }
}
export function localVoice() {
  return "speechSynthesis" in window
    ? speechSynthesis
        .getVoices()
        .find((v) => v.lang.startsWith("ja") && v.localService)
    : undefined;
}
function synth(p: Preferences, delayMs: number, preview = false) {
  if (context?.state !== "running") return false;
  const at = context.currentTime + Math.max(0, delayMs) / 1000;
  for (const [frequency, offset, length] of [
    [784, 0, 0.48],
    [1174.66, 0.28, 0.9],
  ]) {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at + offset);
    gain.gain.linearRampToValueAtTime(p.volume * 0.42, at + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at + offset);
    oscillator.stop(at + offset + length + 0.03);
    if (preview) previewSounds.push(oscillator);
    else sounds.push(oscillator);
    oscillator.onended = () => {
      sounds = sounds.filter((x) => x !== oscillator);
      previewSounds = previewSounds.filter((x) => x !== oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  return true;
}
/** 試聴は時報のON/OFF・予約取消と独立。play()はクリックの呼出し中に実行する。 */
export async function previewChime(
  p: Preferences,
  onPlaying: (playing: boolean) => void,
) {
  if (p.volume <= 0)
    throw new Error("音量が0%です。音量を上げてから試聴してください");
  previewState = onPlaying;
  void unlockAudio().catch(() => {});
  try {
    previewMedia ??= new Audio("/chime.wav");
    previewMedia.preload = "auto";
    previewMedia.volume = p.volume;
    previewMedia.pause();
    previewMedia.currentTime = 0;
    previewMedia.onplaying = () => onPlaying(true);
    previewMedia.onended = previewMedia.onpause = () => onPlaying(false);
    await previewMedia.play();
    return "media" as const;
  } catch {
    if (synth(p, 0, true)) {
      onPlaying(true);
      previewTimer = setTimeout(() => onPlaying(false), 1400);
      return "synth" as const;
    }
    onPlaying(false);
    throw new Error(
      "ブラウザに音声再生を拒否されました。Chromeで開き直して試聴してください",
    );
  }
}
export function chime(
  p: Preferences,
  delayMs = 0,
  wall = Date.now(),
  onFailure?: () => void,
) {
  if (!p.chime || p.volume <= 0 || !isAudioReady()) return false;
  const played = synth(p, delayMs);
  if (!played && mediaReady) {
    scheduledTimer = setTimeout(
      () => {
        const player = media();
        player.muted = false;
        player.volume = p.volume;
        player.currentTime = 0;
        void player.play().catch(() => {
          mediaReady = false;
          onFailure?.();
        });
      },
      Math.max(0, delayMs),
    );
  }
  if (p.voice && localVoice())
    voiceTimer = setTimeout(
      () => {
        const time = new Date(wall),
          hour = time.getHours(),
          utterance = new SpeechSynthesisUtterance(
            `${hour < 12 ? "午前" : "午後"}${hour % 12 || 12}時${time.getMinutes()}分ちょうどをお知らせします`,
          );
        utterance.lang = "ja-JP";
        utterance.voice = localVoice()!;
        utterance.volume = p.volume;
        speechSynthesis.speak(utterance);
      },
      Math.max(0, delayMs) + 700,
    );
  return played || mediaReady;
}
