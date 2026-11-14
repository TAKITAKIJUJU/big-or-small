import { getRoundStakes, type Ruleset } from "./stakes";
/** 純粋な対局エンジン。UI、時刻、通信、Bot戦略には依存しない。 */
export type Player = "human" | "bot";
export type Mode = "BIG" | "SMALL";
export type Phase =
  | "selecting"
  | "drawing"
  | "betting"
  | "resolved"
  | "finished";
export type Difficulty = "easy" | "medium" | "hard";
export type Pair<T> = Record<Player, T>;
export type BetAction =
  | { type: "check" }
  | { type: "call" }
  | { type: "fold" }
  | { type: "bet" | "raise"; total: number };
export type GameCommand =
  | { type: "select"; player: Player; card: number }
  | { type: "act"; player: Player; action: BetAction }
  | { type: "draw" }
  | { type: "next" };
export interface GameEvent {
  type: "ante" | "committed" | "drawn" | "action" | "settled" | "finished";
  text: string;
}
export interface ActionRecord {
  player: Player;
  action: BetAction;
  paid: number;
}
export interface RoundRecord {
  round: number;
  ante: number;
  scheduledAnte: number;
  mode: Mode;
  cards: Pair<number>;
  winner: Player | "tie";
  reason: "showdown" | "fold";
  pot: number;
  refunded: Pair<number>;
  delta: Pair<number>;
  actions: ActionRecord[];
}
export interface GameState {
  version: 1;
  revision: number;
  allIn: boolean;
  ruleset: Ruleset;
  ante: number;
  scheduledAnte: number;
  betLimit: number | null;
  phase: Phase;
  round: number;
  chips: Pair<number>;
  hands: Pair<number[]>;
  selected: Pair<number | null>;
  contributions: Pair<number>;
  pot: number;
  mode: Mode | null;
  turn: Player;
  checks: number;
  raises: number;
  history: RoundRecord[];
  actions: ActionRecord[];
  roundStart: Pair<number>;
  events: GameEvent[];
}
export interface VisibleRound extends Omit<RoundRecord, "cards"> {
  cards: Pair<number | null>;
}
/** 相手の手札・未公開の使用済み札を保持しない、Botと描画の唯一の入力。 */
export interface PlayerView {
  viewer: Player;
  revision: number;
  phase: Phase;
  round: number;
  allIn: boolean;
  ruleset: Ruleset;
  ante: number;
  scheduledAnte: number;
  betLimit: number | null;
  nextAnte: number | null;
  nextScheduledAnte: number | null;
  canContinue: boolean;
  chips: Pair<number>;
  pot: number;
  hand: number[];
  ownCard: number | null;
  opponentCommitted: boolean;
  revealed: Pair<number | null>;
  mode: Mode | null;
  turn: Player;
  contributions: Pair<number>;
  raises: number;
  legal: BetAction[];
  history: VisibleRound[];
  actions: ActionRecord[];
  events: GameEvent[];
  winner: Player | "tie";
}
export const other = (p: Player): Player => (p === "human" ? "bot" : "human");
export const deck = () => Array.from({ length: 13 }, (_, i) => i + 1);
export const matchWinner = (s: Pick<GameState, "chips">): Player | "tie" =>
  s.chips.human === s.chips.bot
    ? "tie"
    : s.chips.human > s.chips.bot
      ? "human"
      : "bot";
export function createGame(
  allIn = false,
  ruleset: Ruleset = "pressure",
): GameState {
  const s: GameState = {
    version: 1,
    revision: 0,
    allIn,
    ruleset,
    ante: 0,
    scheduledAnte: 0,
    betLimit: null,
    phase: "selecting",
    round: 1,
    chips: { human: 300, bot: 300 },
    hands: { human: deck(), bot: deck() },
    selected: { human: null, bot: null },
    contributions: { human: 0, bot: 0 },
    pot: 0,
    mode: null,
    turn: "human",
    checks: 0,
    raises: 0,
    history: [],
    actions: [],
    roundStart: { human: 300, bot: 300 },
    events: [],
  };
  ante(s);
  return s;
}
function ante(s: GameState) {
  if (
    s.round > 13 ||
    Math.min(s.chips.human, s.chips.bot) < (s.ruleset === "classic" ? 2 : 1)
  ) {
    s.phase = "finished";
    s.round = s.history.at(-1)?.round ?? Math.min(13, s.round);
    s.events.push({ type: "finished", text: "対戦終了" });
    return;
  }
  const stakes = getRoundStakes(s.round, s.ruleset, s.allIn);
  s.scheduledAnte = stakes.scheduledAnte;
  s.betLimit = stakes.betLimit;
  s.ante = Math.min(s.scheduledAnte, s.chips.human, s.chips.bot);
  s.roundStart = { ...s.chips };
  s.chips.human -= s.ante;
  s.chips.bot -= s.ante;
  s.pot = 2 * s.ante;
  s.phase = "selecting";
  s.selected = { human: null, bot: null };
  s.contributions = { human: 0, bot: 0 };
  s.mode = null;
  s.checks = 0;
  s.raises = 0;
  s.actions = [];
  s.turn = s.round % 2 ? "human" : "bot";
  s.events.push({
    type: "ante",
    text: `双方が参加料${s.ante}を拠出${s.ante < s.scheduledAnte ? `（規定${s.scheduledAnte}、残額で参加）` : ""}`,
  });
}
export function effectiveCap(
  s: Pick<GameState, "chips" | "contributions" | "betLimit">,
): number {
  return Math.min(
    s.betLimit ?? Infinity,
    s.chips.human + s.contributions.human,
    s.chips.bot + s.contributions.bot,
  );
}
export type BettingPosition = Pick<GameState,
  "phase" | "turn" | "chips" | "contributions" | "betLimit" | "raises" | "allIn" | "ruleset"
>;
export function getLegalActions(s: BettingPosition, p: Player): BetAction[] {
  if (s.phase !== "betting" || s.turn !== p) return [];
  const own = s.contributions[p],
    target = Math.max(s.contributions.human, s.contributions.bot),
    due = target - own;
  const legal: BetAction[] =
    due > 0
      ? [
          { type: "fold" },
          ...(due <= s.chips[p] ? [{ type: "call" } as BetAction] : []),
        ]
      : [{ type: "check" }];
  const cap = effectiveCap(s);
  if (
    s.chips[p] === 0 ||
    s.chips[other(p)] === 0 ||
    (target > 0 && s.raises >= 2)
  )
    return legal;
  const amounts: number[] = [];
  for (let total = target + 2; total <= cap; total += 2) amounts.push(total);
  // 有効スタックの端数のみ例外。相手に支払えない額は要求しない。
  if (
    (s.allIn || s.ruleset === "pressure") &&
    cap > target &&
    !amounts.includes(cap)
  )
    amounts.push(cap);
  return [
    ...legal,
    ...amounts.map(
      (total) => ({ type: target === 0 ? "bet" : "raise", total }) as BetAction,
    ),
  ];
}
export function sameAction(a: BetAction, b: BetAction) {
  return (
    a.type === b.type &&
    (!("total" in a) || ("total" in b && a.total === b.total))
  );
}
export function actionText(a: BetAction, paid: number): string {
  if (a.type === "check") return "チェック";
  if (a.type === "fold") return "フォールド";
  if (a.type === "call") return `${paid}をコール`;
  return a.type === "bet"
    ? `${a.total}をベット`
    : `合計${a.total}へレイズ（追加${paid}）`;
}
function settle(s: GameState, folded?: Player) {
  if (s.mode === null || s.selected.human === null || s.selected.bot === null)
    throw new Error("未確定の札は精算できません");
  const refunded = { human: 0, bot: 0 };
  const matched = Math.min(s.contributions.human, s.contributions.bot);
  for (const p of ["human", "bot"] as const) {
    const diff = s.contributions[p] - matched;
    s.chips[p] += diff;
    s.pot -= diff;
    refunded[p] = diff;
    s.contributions[p] = matched;
  }
  const cards = { human: s.selected.human, bot: s.selected.bot };
  const winner: Player | "tie" = folded
    ? other(folded)
    : cards.human === cards.bot
      ? "tie"
      : (s.mode === "BIG" ? cards.human > cards.bot : cards.human < cards.bot)
        ? "human"
        : "bot";
  const pot = s.pot;
  if (winner === "tie") {
    s.chips.human += pot / 2;
    s.chips.bot += pot / 2;
  } else s.chips[winner] += pot;
  s.pot = 0;
  for (const p of ["human", "bot"] as const)
    s.hands[p] = s.hands[p].filter((c) => c !== cards[p]);
  s.history.push({
    round: s.round,
    ante: s.ante,
    scheduledAnte: s.scheduledAnte,
    mode: s.mode,
    cards,
    winner,
    reason: folded ? "fold" : "showdown",
    pot,
    refunded,
    delta: {
      human: s.chips.human - s.roundStart.human,
      bot: s.chips.bot - s.roundStart.bot,
    },
    actions: structuredClone(s.actions),
  });
  s.phase = "resolved";
  s.events.push({
    type: "settled",
    text:
      winner === "tie"
        ? "引き分け。ポットを分配"
        : `${winner === "human" ? "あなた" : "NPC"}がポット${pot}を獲得`,
  });
}
export function transition(
  state: GameState,
  command: GameCommand,
  rng: () => number = Math.random,
): GameState {
  const s = structuredClone(state);
  s.events = [];
  s.revision++;
  switch (command.type) {
    case "select": {
      const { player, card } = command;
      if (
        s.phase !== "selecting" ||
        s.selected[player] !== null ||
        !s.hands[player].includes(card)
      )
        throw new Error("そのカードは確定できません");
      s.selected[player] = card;
      s.events.push({
        type: "committed",
        text: `${player === "human" ? "あなた" : "NPC"}が札を伏せた`,
      });
      if (s.selected.human !== null && s.selected.bot !== null)
        s.phase = "drawing";
      break;
    }
    case "draw": {
      if (s.phase !== "drawing")
        throw new Error("抽選は双方の確定後に一度だけ行います");
      const roll = rng();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
        throw new Error("乱数が範囲外です");
      s.mode = roll < 0.5 ? "BIG" : "SMALL";
      s.phase = "betting";
      s.events.push({ type: "drawn", text: s.mode });
      if (s.chips.human === 0 || s.chips.bot === 0) settle(s);
      break;
    }
    case "act": {
      const { player, action } = command;
      if (!getLegalActions(s, player).some((a) => sameAction(a, action)))
        throw new Error("現在はその行動を選べません");
      const target = Math.max(s.contributions.human, s.contributions.bot);
      const paid =
        action.type === "call"
          ? target - s.contributions[player]
          : "total" in action
            ? action.total - s.contributions[player]
            : 0;
      s.chips[player] -= paid;
      s.pot += paid;
      s.contributions[player] += paid;
      s.actions.push({ player, action, paid });
      s.events.push({
        type: "action",
        text: `${player === "human" ? "あなた" : "NPC"}：${actionText(action, paid)}`,
      });
      if (action.type === "fold") settle(s, player);
      else if (action.type === "call") settle(s);
      else if (action.type === "check" && s.checks === 1) settle(s);
      else {
        if (action.type === "check") s.checks++;
        else s.checks = 0;
        if (action.type === "raise") s.raises++;
        s.turn = other(player);
      }
      break;
    }
    case "next":
      if (s.phase !== "resolved")
        throw new Error("まだラウンドは終了していません");
      s.round++;
      ante(s);
      break;
    default:
      throw new Error("不明なコマンドです");
  }
  assertInvariants(s);
  return s;
}
export function assertInvariants(s: GameState) {
  if (s.chips.human + s.chips.bot + s.pot !== 600)
    throw new Error("チップ総数が600ではありません");
  if (
    ![s.chips.human, s.chips.bot, s.pot].every(
      (n) => Number.isInteger(n) && n >= 0,
    )
  )
    throw new Error("チップが不正です");
  for (const p of ["human", "bot"] as const) {
    const cards = [...s.hands[p], ...s.history.map((h) => h.cards[p])];
    if (
      cards.length !== 13 ||
      new Set(cards).size !== 13 ||
      cards.some((c) => !Number.isInteger(c) || c < 1 || c > 13)
    )
      throw new Error("カードの重複または欠落");
  }
  if (
    ["selecting", "drawing", "betting"].includes(s.phase) &&
    s.pot !== s.ante * 2 + s.contributions.human + s.contributions.bot
  )
    throw new Error("参加料・追加拠出とポットが一致しません");
  if (s.history.length > 13) throw new Error("ラウンド数が不正です");
}
export function getPlayerView(
  s: GameState,
  viewer: Player,
  revealAfterMatch = true,
): PlayerView {
  const visible = (r: RoundRecord): VisibleRound => ({
    ...structuredClone(r),
    cards: {
      human:
        viewer === "human" ||
        r.reason === "showdown" ||
        (s.phase === "finished" && revealAfterMatch)
          ? r.cards.human
          : null,
      bot:
        viewer === "bot" ||
        r.reason === "showdown" ||
        (s.phase === "finished" && revealAfterMatch)
          ? r.cards.bot
          : null,
    },
  });
  const latest = s.history.at(-1);
  const revealed =
    latest && (s.phase === "resolved" || s.phase === "finished")
      ? visible(latest).cards
      : { human: null, bot: null };
  const canContinue =
    s.round < 13 &&
    Math.min(s.chips.human, s.chips.bot) >= (s.ruleset === "classic" ? 2 : 1);
  const nextScheduledAnte =
    s.phase === "finished" || (s.phase === "resolved" && !canContinue)
      ? null
      : s.round < 13
        ? getRoundStakes(s.round + 1, s.ruleset, s.allIn).scheduledAnte
        : null;
  return {
    viewer,
    revision: s.revision,
    phase: s.phase,
    round: s.round,
    allIn: s.allIn,
    ruleset: s.ruleset,
    ante: s.ante,
    scheduledAnte: s.scheduledAnte,
    betLimit: s.betLimit,
    canContinue,
    nextScheduledAnte,
    nextAnte:
      canContinue && nextScheduledAnte !== null
        ? Math.min(nextScheduledAnte, s.chips.human, s.chips.bot)
        : null,
    chips: { ...s.chips },
    pot: s.pot,
    hand: [...s.hands[viewer]],
    ownCard: s.selected[viewer],
    opponentCommitted: s.selected[other(viewer)] !== null,
    revealed,
    mode: s.mode,
    turn: s.turn,
    contributions: { ...s.contributions },
    raises: s.raises,
    legal: getLegalActions(s, viewer),
    history: s.history.map(visible),
    actions: structuredClone(s.actions),
    events: structuredClone(s.events),
    winner: matchWinner(s),
  };
}
