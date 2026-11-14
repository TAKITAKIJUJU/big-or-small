import { decideAction } from "../game/bot";
import type { Difficulty, PlayerView } from "../game/engine";

/** 反復探索で描画やタッチを止めない。ワーカー拒否環境でも同じ方策で継続。 */
export function requestBotAction(
  view: PlayerView, difficulty: Difficulty, roll: number,
  done: (decision: ReturnType<typeof decideAction>) => void,
): () => void {
  let worker: Worker | undefined, cancelled = false;
  const fallback = () => {
    clearTimeout(timeout);
    worker?.terminate();
    if (!cancelled) {
      cancelled = true;
      done(decideAction(view, difficulty, () => roll));
    }
  };
  let timeout: ReturnType<typeof setTimeout>;
  try {
    worker = new Worker(new URL("../game/bot.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ decision?: ReturnType<typeof decideAction> }>) => {
      clearTimeout(timeout);
      worker?.terminate();
      if (cancelled) return;
      if (event.data.decision) { cancelled = true; done(event.data.decision); }
      else fallback();
    };
    worker.onerror = () => { clearTimeout(timeout); fallback(); };
    timeout = setTimeout(fallback, 10_000);
    worker.postMessage({ view, difficulty, roll });
  } catch {
    timeout = setTimeout(fallback, 0);
  }
  return () => { cancelled = true; clearTimeout(timeout); worker?.terminate(); };
}
