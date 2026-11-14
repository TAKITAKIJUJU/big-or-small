import { decideAction } from "./bot";
import type { Difficulty, PlayerView } from "./engine";

// ワーカーへ送るのも公開ビューだけ。内部GameStateや次の抽選乱数は送らない。
self.onmessage = (event: MessageEvent<{ view: PlayerView; difficulty: Difficulty; roll: number }>) => {
  const { view, difficulty, roll } = event.data;
  try {
    self.postMessage({ decision: decideAction(view, difficulty, () => roll) });
  } catch {
    self.postMessage({ error: true });
  }
};
