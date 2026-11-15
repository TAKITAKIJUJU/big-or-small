export const RULE_VERSION = "handkerchief-1" as const;
export const TURN_MS = 60000;
export const LIMIT_MS = 300000;
export type Person = "A" | "B";
export type Score = {
  currentAccumulatedMs: number;
  consumedMs: number;
  penaltyLifetimeMs: number;
};
export type Scores = Record<Person, Score>;
export type Reason =
  | "success"
  | "early-check"
  | "drop-timeout"
  | "check-timeout";
export type TurnInput = {
  dropElapsedMs: number | null;
  checkElapsedMs: number | null;
};
export type TurnEvent = TurnInput & {
  kind: "turn";
  id: string;
  startedAt: number;
  at: number;
};
export type AuditEvent =
  | {
      kind: "interrupted";
      id: string;
      at: number;
      reason: string;
      elapsedMs: number;
    }
  | { kind: "void"; id: string; at: number; reason: string; target: string };
export type MatchEvent = TurnEvent | AuditEvent;
export type ActiveMarker = { id: string; startedAt: number };
export type Match = {
  schema: 1;
  rules: typeof RULE_VERSION;
  id: string;
  createdAt: number;
  names: Record<Person, string>;
  firstDropper: Person;
  revision: number;
  events: MatchEvent[];
  active: ActiveMarker | null;
};
export type Turn = TurnEvent & {
  number: number;
  dropper: Person;
  checker: Person;
  reason: Reason;
  subject: Person;
  addedMs: number;
  penaltyMs: number;
  consumedThisTurnMs: number;
  before: Scores;
  after: Scores;
};
export const other = (p: Person): Person => (p === "A" ? "B" : "A");
export const total = (score: Score) =>
  score.currentAccumulatedMs + score.consumedMs;
export const remaining = (score: Score) => Math.max(0, LIMIT_MS - total(score));
const zero = (): Score => ({
  currentAccumulatedMs: 0,
  consumedMs: 0,
  penaltyLifetimeMs: 0,
});
const integer = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
export function createMatch(
  id: string,
  createdAt: number,
  names: Record<Person, string>,
  firstDropper: Person,
): Match {
  if (!id || !integer(createdAt) || !["A", "B"].includes(firstDropper))
    throw new Error("試合の形式が不正です");
  return {
    schema: 1,
    rules: RULE_VERSION,
    id,
    createdAt,
    names: {
      A: names.A.trim().slice(0, 24) || "A",
      B: names.B.trim().slice(0, 24) || "B",
    },
    firstDropper,
    revision: 0,
    events: [],
    active: null,
  };
}
export function adjudicate(input: TurnInput): {
  reason: Reason;
  addedMs: number;
  penaltyMs: number;
} {
  for (const t of [input.dropElapsedMs, input.checkElapsedMs])
    if (t !== null && !integer(t))
      throw new Error("時刻は整数ミリ秒で記録してください");
  const drop =
      input.dropElapsedMs !== null && input.dropElapsedMs < TURN_MS
        ? input.dropElapsedMs
        : null,
    check =
      input.checkElapsedMs !== null && input.checkElapsedMs < TURN_MS
        ? input.checkElapsedMs
        : null;
  if (check !== null)
    return drop !== null && drop < check
      ? { reason: "success", addedMs: check - drop, penaltyMs: 0 }
      : { reason: "early-check", addedMs: 0, penaltyMs: TURN_MS };
  return {
    reason: drop === null ? "drop-timeout" : "check-timeout",
    addedMs: 0,
    penaltyMs: TURN_MS,
  };
}
export function derive(match: Match) {
  if (
    !match ||
    typeof match.id !== "string" ||
    !integer(match.createdAt) ||
    !integer(match.revision) ||
    typeof match.names?.A !== "string" ||
    typeof match.names?.B !== "string"
  )
    throw new Error("試合の保存形式が不正です");
  if (
    match.schema !== 1 ||
    match.rules !== RULE_VERSION ||
    !["A", "B"].includes(match.firstDropper) ||
    !Array.isArray(match.events)
  )
    throw new Error("未対応の試合記録です");
  const voids = new Set<string>(),
    encountered: string[] = [],
    ids = new Set<string>();
  for (const e of match.events) {
    if (!e || !e.id || ids.has(e.id) || !integer(e.at))
      throw new Error("履歴の形式が不正です");
    ids.add(e.id);
    if (e.kind === "turn") encountered.push(e.id);
    else if (e.kind === "void") {
      if (
        encountered.filter((id) => !voids.has(id)).at(-1) !== e.target ||
        voids.has(e.target) ||
        !e.reason.trim()
      )
        throw new Error("訂正対象が不正です");
      voids.add(e.target);
    } else if (e.kind !== "interrupted" || !integer(e.elapsedMs))
      throw new Error("中断記録が不正です");
  }
  const scores: Scores = { A: zero(), B: zero() },
    turns: Turn[] = [];
  let loser: Person | null = null;
  for (const e of match.events) {
    if (e.kind !== "turn" || voids.has(e.id)) continue;
    if (loser) throw new Error("終了後にターンが追加されています");
    if (!integer(e.startedAt)) throw new Error("開始日時が不正です");
    const result = adjudicate(e),
      dropper =
        turns.length % 2 === 0 ? match.firstDropper : other(match.firstDropper),
      checker = other(dropper),
      subject = result.reason === "drop-timeout" ? dropper : checker,
      before = structuredClone(scores),
      score = scores[subject];
    let consumedThisTurnMs = 0;
    if (result.reason === "success")
      score.currentAccumulatedMs += result.addedMs;
    else {
      consumedThisTurnMs = score.currentAccumulatedMs + result.penaltyMs;
      score.consumedMs += consumedThisTurnMs;
      score.penaltyLifetimeMs += result.penaltyMs;
      score.currentAccumulatedMs = 0;
    }
    if (total(score) >= LIMIT_MS) loser = subject;
    turns.push({
      ...e,
      ...result,
      number: turns.length + 1,
      dropper,
      checker,
      subject,
      consumedThisTurnMs,
      before,
      after: structuredClone(scores),
    });
  }
  return {
    scores,
    turns,
    loser,
    winner: loser ? other(loser) : null,
    voids,
    dropper:
      turns.length % 2 === 0 ? match.firstDropper : other(match.firstDropper),
  };
}
export function startTurn(match: Match, marker: ActiveMarker): Match {
  if (match.active || derive(match).loser || !integer(marker.startedAt))
    throw new Error("現在は開始できません");
  return { ...match, revision: match.revision + 1, active: marker };
}
export function finishTurn(match: Match, input: TurnInput, at: number): Match {
  if (!match.active) throw new Error("計測中のターンがありません");
  adjudicate(input);
  const canonical = {
    dropElapsedMs:
      input.dropElapsedMs !== null && input.dropElapsedMs < TURN_MS
        ? input.dropElapsedMs
        : null,
    checkElapsedMs:
      input.checkElapsedMs !== null && input.checkElapsedMs < TURN_MS
        ? input.checkElapsedMs
        : null,
  };
  const next: Match = {
    ...match,
    revision: match.revision + 1,
    active: null,
    events: [
      ...match.events,
      { kind: "turn", ...match.active, ...canonical, at },
    ],
  };
  derive(next);
  return next;
}
export function interruptTurn(
  match: Match,
  id: string,
  at: number,
  elapsedMs: number,
  reason: string,
): Match {
  if (!match.active) return match;
  return {
    ...match,
    revision: match.revision + 1,
    active: null,
    events: [
      ...match.events,
      {
        kind: "interrupted",
        id,
        at,
        elapsedMs: Math.max(0, Math.floor(elapsedMs)),
        reason,
      },
    ],
  };
}
export function voidLast(
  match: Match,
  id: string,
  at: number,
  reason: string,
): Match {
  const last = derive(match).turns.at(-1);
  if (match.active || !last || !reason.trim())
    throw new Error("直前の確定ターンと訂正理由が必要です");
  const next: Match = {
    ...match,
    revision: match.revision + 1,
    events: [
      ...match.events,
      {
        kind: "void",
        id,
        at,
        target: last.id,
        reason: reason.trim().slice(0, 300),
      },
    ],
  };
  derive(next);
  return next;
}
export const REASONS: Record<Reason, string> = {
  success: "C チェック成功",
  "early-check": "C 落下前にチェック",
  "drop-timeout": "D 未落下で時間切れ",
  "check-timeout": "C 未チェックで時間切れ",
};
export const seconds = (ms: number) => (ms / 1000).toFixed(2);
