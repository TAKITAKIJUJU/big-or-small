import { createGame, transition, type GameCommand } from "../src/game/engine";
import type { Session } from "../src/lib/session";
/** 新ルールの全額同数。追加分を返し、4だけ中央に残す合法ログ。 */
export function openCarryFixture() {
  const session: Session = { ruleset: "open", allIn: false, entries: [] };
  let state = createGame(false, "open");
  const apply = (command: GameCommand) => {
    state = transition(state, command, () => 0);
    session.entries.push({ command, ...(command.type === "draw" ? { roll: 0 } : {}) });
  };
  apply({ type: "draw" });
  apply({ type: "select", player: "bot", card: 13 });
  apply({ type: "select", player: "human", card: 13 });
  apply({ type: "act", player: "human", action: { type: "bet", total: 298 } });
  apply({ type: "act", player: "bot", action: { type: "call" } });
  return { state, session };
}
/** 合法ログだけで160対440を作る。製品のBotや乱数には手を加えない。 */
export function comebackFixture() {
  const session: Session = { ruleset: "pressure", allIn: false, entries: [] };
  let state = createGame(false, "pressure");
  const apply = (command: GameCommand, roll?: number) => {
    state = transition(state, command, () => roll ?? 0);
    session.entries.push({ command, ...(roll === undefined ? {} : { roll }) });
  };
  for (let round = 1; round <= 9; round++) {
    apply({ type: "select", player: "bot", card: round });
    apply({ type: "select", player: "human", card: round });
    apply({ type: "draw" }, 0);
    if (round < 9) {
      if (state.turn === "human")
        apply({ type: "act", player: "human", action: { type: "check" } });
      apply({ type: "act", player: "bot", action: { type: "bet", total: 2 } });
      apply({ type: "act", player: "human", action: { type: "fold" } });
    } else {
      apply({
        type: "act",
        player: "human",
        action: { type: "bet", total: 24 },
      });
      apply({
        type: "act",
        player: "bot",
        action: { type: "raise", total: 26 },
      });
      apply({ type: "act", player: "human", action: { type: "fold" } });
    }
    apply({ type: "next" });
  }
  // 第10回、参加料40のあと残り120対400。NPCの120にコールすれば総ポット320。
  apply({ type: "select", player: "bot", card: 10 });
  apply({ type: "select", player: "human", card: 13 });
  apply({ type: "draw" }, 0);
  apply({ type: "act", player: "bot", action: { type: "bet", total: 120 } });
  return { session, state };
}
