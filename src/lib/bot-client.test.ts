import { afterEach, expect, it, vi } from "vitest";
import { requestBotAction } from "./bot-client";
import { createGame, getPlayerView, transition } from "../game/engine";
import { decideAction } from "../game/bot";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function view() {
  let s = createGame(false, "pressure");
  for (const player of ["bot", "human"] as const)
    s = transition(s, { type: "select", player, card: 7 });
  s = transition(s, { type: "draw" }, () => 0);
  s = transition(s, { type: "act", player: "human", action: { type: "check" } });
  return getPlayerView(s, "bot", false);
}
it("中止したワーカーの遅れた返答を適用しない", () => {
  vi.useFakeTimers();
  class FakeWorker {
    static current: FakeWorker;
    constructor() { FakeWorker.current = this; }
    onmessage?: (e: { data: unknown }) => void;
    postMessage = vi.fn();
    terminate = vi.fn();
  }
  vi.stubGlobal("Worker", FakeWorker);
  const done = vi.fn(), v = view(), cancel = requestBotAction(v, "hard", 0.2, done);
  cancel();
  FakeWorker.current.onmessage?.({ data: { decision: decideAction(v, "hard", () => 0.2) } });
  vi.runAllTimers();
  expect(done).not.toHaveBeenCalled();
  expect(FakeWorker.current.terminate).toHaveBeenCalled();
  expect(FakeWorker.current.postMessage).toHaveBeenCalledWith({ view: v, difficulty: "hard", roll: 0.2 });
});
it("ワーカー失敗と期限切れが重なっても、同じ上級方策の返答は一回だけ", () => {
  vi.useFakeTimers();
  class FakeWorker {
    static current: FakeWorker;
    constructor() { FakeWorker.current = this; }
    onerror?: () => void;
    postMessage() {}
    terminate() {}
  }
  vi.stubGlobal("Worker", FakeWorker);
  const done = vi.fn(), v = view();
  requestBotAction(v, "hard", 0.2, done);
  FakeWorker.current.onerror?.();
  FakeWorker.current.onerror?.();
  vi.runAllTimers();
  expect(done).toHaveBeenCalledExactlyOnceWith(decideAction(v, "hard", () => 0.2));
});
