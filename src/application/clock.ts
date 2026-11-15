import {
  finishTurn,
  interruptTurn,
  startTurn,
  TURN_MS,
  type Match,
} from "../domain/game";
export type ClockSource = {
  monotonic: () => number;
  wall: () => number;
  id: () => string;
};
export const browserClock: ClockSource = {
  monotonic: () => performance.now(),
  wall: () => Date.now(),
  id: () => crypto.randomUUID(),
};
export class TurnClock {
  timedOut = false;
  private live: { start: number; drop: number | null } | null = null;
  constructor(
    private read: () => Match | null,
    private commit: (match: Match) => void,
    private notify: () => void,
    private clock: ClockSource = browserClock,
  ) {}
  elapsed() {
    return this.live
      ? Math.max(0, Math.floor(this.clock.monotonic() - this.live.start))
      : 0;
  }
  get startedMonotonic() {
    return this.live?.start ?? null;
  }
  get running() {
    return this.live !== null;
  }
  get dropped() {
    return this.live?.drop ?? null;
  }
  start() {
    const match = this.read();
    if (!match || this.live) return;
    const start = this.clock.monotonic(),
      startedAt = this.clock.wall();
    const next = startTurn(match, { id: this.clock.id(), startedAt });
    this.timedOut = false;
    this.live = { start, drop: null };
    this.commit(next);
    this.notify();
  }
  input(kind: "drop" | "check") {
    if (!this.live) return;
    const elapsed = this.elapsed();
    if (elapsed >= TURN_MS) {
      this.complete(null);
      return;
    }
    if (kind === "drop") {
      if (this.live.drop !== null) return;
      this.live.drop = elapsed;
      this.notify();
    } else this.complete(elapsed);
  }
  tick() {
    if (this.live && this.elapsed() >= TURN_MS) this.complete(null);
  }
  private complete(check: number | null) {
    const match = this.read(),
      live = this.live;
    if (!match || !live) return;
    this.timedOut = check === null;
    this.live = null;
    this.commit(
      finishTurn(
        match,
        { dropElapsedMs: live.drop, checkElapsedMs: check },
        this.clock.wall(),
      ),
    );
    this.notify();
  }
  interrupt(reason: string) {
    const match = this.read();
    if (!match?.active) return;
    const elapsed = this.elapsed();
    this.timedOut = false;
    this.live = null;
    this.commit(
      interruptTurn(match, this.clock.id(), this.clock.wall(), elapsed, reason),
    );
    this.notify();
  }
}
