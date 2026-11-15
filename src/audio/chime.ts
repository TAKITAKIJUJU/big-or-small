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
  volume: 0.5,
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
        : 0.5,
    voice: p.voice === true,
    reduced: p.reduced === true,
  };
}
export class MinutePlanner {
  private previous: { wall: number; mono: number } | null = null;
  private scheduled: number | null = null;
  step(wall: number, mono: number, enabled: boolean) {
    const jump =
      this.previous !== null &&
      Math.abs(wall - this.previous.wall - (mono - this.previous.mono)) > 250;
    this.previous = { wall, mono };
    if (!enabled || jump) this.scheduled = null;
    const boundary =
      wall % 60000 === 0 ? wall : (Math.floor(wall / 60000) + 1) * 60000;
    let at: number | null = null;
    if (enabled && boundary - wall <= 1200 && this.scheduled !== boundary) {
      at = boundary;
      this.scheduled = boundary;
    }
    return { cancel: !enabled || jump, at };
  }
}
let context: AudioContext | null = null,
  sounds: OscillatorNode[] = [],
  voiceTimer: ReturnType<typeof setTimeout> | null = null;
export const isAudioReady = () => context?.state === "running";
export async function unlockAudio() {
  context ??= new AudioContext();
  await context.resume();
  if (context.state !== "running")
    throw new Error("音声が許可されていません。もう一度試聴してください");
}
export function cancelSound() {
  for (const oscillator of sounds) {
    try {
      oscillator.stop();
    } catch {
      /* already ended */
    }
  }
  sounds = [];
  if (voiceTimer) clearTimeout(voiceTimer);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
export function localVoice() {
  return "speechSynthesis" in window
    ? speechSynthesis
        .getVoices()
        .find((v) => v.lang.startsWith("ja") && v.localService)
    : undefined;
}
export function chime(p: Preferences, delayMs = 0, wall = Date.now()) {
  if (!context || context.state !== "running" || !p.chime) return false;
  const at = context.currentTime + Math.max(0, delayMs) / 1000;
  for (const [frequency, offset] of [
    [880, 0],
    [1320, 0.18],
  ]) {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at + offset);
    gain.gain.linearRampToValueAtTime(p.volume * 0.14, at + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at + offset);
    oscillator.stop(at + offset + 0.55);
    sounds.push(oscillator);
    oscillator.onended = () => {
      sounds = sounds.filter((x) => x !== oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  if (p.voice && localVoice())
    voiceTimer = setTimeout(() => {
      const time = new Date(wall),
        hour = time.getHours(),
        utterance = new SpeechSynthesisUtterance(
          `${hour < 12 ? "午前" : "午後"}${hour % 12 || 12}時${time.getMinutes()}分ちょうどをお知らせします`,
        );
      utterance.lang = "ja-JP";
      utterance.voice = localVoice()!;
      utterance.volume = p.volume;
      speechSynthesis.speak(utterance);
    }, delayMs + 700);
  return true;
}
