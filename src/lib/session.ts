import type { Ruleset } from "../game/stakes";
import {
  createGame,
  transition,
  type Difficulty,
  type GameCommand,
  type GameState,
} from "../game/engine";
export interface Settings {
  difficulty: Difficulty;
  speed: "normal" | "fast" | "skip";
  quality: "auto" | "high" | "low";
  reduced: boolean;
  muted: boolean;
  volume: number;
  allIn: boolean;
  reveal: boolean;
  tutorialSeen: boolean;
}
export const defaults: Settings = {
  difficulty: "medium",
  speed: "normal",
  quality: "auto",
  reduced: false,
  muted: false,
  volume: 0.35,
  allIn: false,
  reveal: true,
  tutorialSeen: false,
};
export interface Entry {
  command: GameCommand;
  roll?: number;
}
export interface Session {
  ruleset?: Ruleset;
  allIn: boolean;
  entries: Entry[];
}
const KEY = "usotuki.v1";
export function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
export function settingsFrom(value: unknown): Settings {
  const x =
    value && typeof value === "object" ? (value as Partial<Settings>) : {};
  return {
    difficulty: ["easy", "medium", "hard"].includes(x.difficulty ?? "")
      ? x.difficulty!
      : defaults.difficulty,
    speed: ["normal", "fast", "skip"].includes(x.speed ?? "")
      ? x.speed!
      : defaults.speed,
    quality: ["auto", "high", "low"].includes(x.quality ?? "")
      ? x.quality!
      : defaults.quality,
    volume:
      typeof x.volume === "number" && Number.isFinite(x.volume)
        ? Math.max(0, Math.min(1, x.volume))
        : defaults.volume,
    ...Object.fromEntries(
      ["reduced", "muted", "allIn", "reveal", "tutorialSeen"].map((k) => [
        k,
        typeof x[k as keyof Settings] === "boolean"
          ? x[k as keyof Settings]
          : defaults[k as keyof Settings],
      ]),
    ),
  } as Settings;
}
export function replay(session: Session): GameState {
  if (
    !session ||
    typeof session.allIn !== "boolean" ||
    !Array.isArray(session.entries) ||
    session.entries.length > 1500
  )
    throw new Error("保存形式が不正です");
  if (
    session.ruleset !== undefined &&
    !["classic", "pressure"].includes(session.ruleset)
  )
    throw new Error("ルールの保存形式が不正です");
  // 公開済みv1のログは固定参加料のまま再生する。
  let state = createGame(session.allIn, session.ruleset ?? "classic");
  for (const entry of session.entries) {
    if (!entry || typeof entry.command !== "object" || !entry.command)
      throw new Error("コマンドが不正です");
    const c = entry.command;
    if (
      (c.type === "select" || c.type === "act") &&
      !["human", "bot"].includes(c.player)
    )
      throw new Error("プレイヤーが不正です");
    if (
      c.type === "draw" &&
      (typeof entry.roll !== "number" ||
        !Number.isFinite(entry.roll) ||
        entry.roll < 0 ||
        entry.roll >= 1)
    )
      throw new Error("抽選記録が不正です");
    state = transition(state, c, () => entry.roll!);
  }
  return state;
}
export function load(): {
  settings: Settings;
  session: Session | null;
  state: GameState | null;
  notice: string;
} {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw)
      return {
        settings: { ...defaults },
        session: null,
        state: null,
        notice: "",
      };
    if (raw.length > 600000) throw new Error("データが大きすぎます");
    const x = JSON.parse(raw);
    if (x.version !== 1) throw new Error("保存バージョンが異なります");
    const settings = settingsFrom(x.settings);
    return {
      settings,
      session: x.session ?? null,
      state: x.session ? replay(x.session) : null,
      notice: "",
    };
  } catch {
    return {
      settings: { ...defaults },
      session: null,
      state: null,
      notice: "保存データを読み込めませんでした。新しい対局を始められます。",
    };
  }
}
export function save(settings: Settings, session: Session | null) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, settings, session }),
    );
    return "";
  } catch {
    return "このブラウザでは保存できません。画面を閉じると進行が失われます。";
  }
}
