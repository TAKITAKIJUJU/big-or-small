import { useEffect, useRef, useState } from "react";
import { chooseAction, chooseCard } from "../game/bot";
import {
  createGame,
  getPlayerView,
  transition,
  type GameCommand,
} from "../game/engine";
import {
  load,
  save,
  secureRandom,
  type Session,
  type Settings,
} from "./session";
import { playSound, syncAmbient } from "./audio";
export function useGame() {
  const initial = useRef<ReturnType<typeof load> | null>(null);
  initial.current ??= load();
  const [settings, setSettings] = useState(initial.current.settings),
    [state, setState] = useState(initial.current.state),
    [notice, setNotice] = useState(initial.current.notice);
  const internal = useRef(state),
    session = useRef<Session | null>(initial.current.session),
    settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [revealPending, setRevealPending] = useState(false);
  const [busy, setBusy] = useState(false),
    lock = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    syncAmbient(settings.volume, settings.muted);
    const result = save(settings, session.current);
    if (result) setNotice(result);
  }, [settings, state]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function dispatch(command: GameCommand, expected?: number) {
    if (
      !internal.current ||
      !session.current ||
      (expected !== undefined && expected !== internal.current.revision)
    )
      return;
    try {
      const roll = command.type === "draw" ? secureRandom() : undefined;
      const next = transition(internal.current, command, () => roll!);
      session.current = {
        ...session.current,
        entries: [
          ...session.current.entries,
          { command, ...(roll === undefined ? {} : { roll }) },
        ],
      };
      internal.current = next;
      setState(next);
      if (command.type === "draw") setRevealPending(true);
      const cfg = settingsRef.current;
      playSound(
        next.events.some((e) => e.type === "settled")
          ? "settle"
          : command.type === "draw"
            ? "draw"
            : command.type === "act"
              ? "chip"
              : "card",
        cfg.volume,
        cfg.muted,
      );
      // 抽選は演出より先に確定。次ラウンドのBotも人間の操作前に伏せる。
      if (next.phase === "drawing") dispatch({ type: "draw" }, next.revision);
      else if (next.phase === "selecting" && next.selected.bot === null)
        dispatch(
          {
            type: "select",
            player: "bot",
            card: chooseCard(
              getPlayerView(next, "bot", false),
              settingsRef.current.difficulty,
              secureRandom,
            ),
          },
          next.revision,
        );
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "操作を受け付けられませんでした",
      );
    }
  }
  function newGame(config: Settings) {
    setRevealPending(false);
    let next = createGame(config.allIn);
    const card = chooseCard(
      getPlayerView(next, "bot", false),
      config.difficulty,
      secureRandom,
    );
    const command: GameCommand = { type: "select", player: "bot", card };
    next = transition(next, command);
    session.current = {
      ruleset: next.ruleset,
      allIn: config.allIn,
      entries: [{ command }],
    };
    internal.current = next;
    setState(next);
    setNotice("");
  }
  function humanCommand(command: GameCommand) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    dispatch(command);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lock.current = false;
      setBusy(false);
    }, 180);
  }
  function step(expected: number) {
    const s = internal.current;
    if (!s || s.revision !== expected) return;
    if (s.phase === "selecting" && s.selected.bot === null)
      dispatch(
        {
          type: "select",
          player: "bot",
          card: chooseCard(
            getPlayerView(s, "bot", false),
            settings.difficulty,
            secureRandom,
          ),
        },
        expected,
      );
    else if (s.phase === "drawing") dispatch({ type: "draw" }, expected);
    else if (s.phase === "betting" && s.turn === "bot")
      dispatch(
        {
          type: "act",
          player: "bot",
          action: chooseAction(
            getPlayerView(s, "bot", false),
            settings.difficulty,
            secureRandom,
          ),
        },
        expected,
      );
  }
  return {
    view: state ? getPlayerView(state, "human", settings.reveal) : null,
    settings,
    setSettings,
    notice,
    setNotice,
    newGame,
    humanCommand,
    step,
    busy,
    revealPending,
    completeReveal: () => setRevealPending(false),
  };
}
