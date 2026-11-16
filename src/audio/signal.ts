export type Tone = "tick" | "pip" | "bell";
export type SignalCue = { at: number; tone: Tone; announceAt?: number };
export const TONES = {
  tick: { frequency: 2000, length: 0.035, level: 0.28 },
  pip: { frequency: 500, length: 0.14, level: 0.65 },
  bell: { frequency: 1000, length: 1.5, level: 0.8 },
} as const;

/** 壁時計の秒境界へ先行予約する。遅れた秒をまとめて鳴らさない。 */
export class TimeSignalPlanner {
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
    const cues: SignalCue[] = [];
    if (enabled) {
      for (
        let at = Math.ceil(wall / 1000) * 1000;
        at <= wall + 1000;
        at += 1000
      ) {
        if (this.scheduled !== null && at <= this.scheduled) continue;
        const second = Math.floor(at / 1000) % 60;
        cues.push({
          at,
          tone: second % 10 === 0 ? "bell" : second >= 57 ? "pip" : "tick",
          ...(second % 10 === 7 ? { announceAt: at + 3000 } : {}),
        });
        this.scheduled = at;
      }
    }
    return { cancel, cues };
  }
}

export function announcement(elapsed: number) {
  const seconds = Math.round(elapsed / 1000) % 60 || 60;
  return {
    text: `${seconds === 60 ? "1分" : `${seconds}秒`}をお知らせします`,
    keys: [`second-${seconds}`],
  };
}
