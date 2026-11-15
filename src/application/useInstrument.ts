import { useEffect, useRef, useState } from "react";
import {
  createMatch,
  derive,
  interruptTurn,
  voidLast,
  type Match,
  type Person,
} from "../domain/game";
import {
  allMatches,
  readSettings,
  saveMatch,
  writeSettings,
} from "../storage/db";
import {
  cancelSound,
  chime,
  isAudioReady,
  DEFAULTS,
  MinutePlanner,
  preferences,
  previewChime,
  unlockAudio,
  type Preferences,
} from "../audio/chime";
import { TurnClock } from "./clock";
export function useInstrument() {
  const [matches, setMatches] = useState<Match[]>([]),
    [current, setCurrent] = useState<Match | null>(null),
    [settings, setSettingsState] = useState<Preferences>(DEFAULTS),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState(""),
    [fault, setFault] = useState(false),
    [saving, setSaving] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [wakeNotice, setWakeNotice] = useState(""),
    [previewPlaying, setPreviewPlaying] = useState(false),
    [audioReady, setAudioReady] = useState(false),
    [audioNotice, setAudioNotice] =
      useState("時報は試聴で動作を確認してください"),
    [, force] = useState(0);
  const currentRef = useRef<Match | null>(null),
    faultRef = useRef(false),
    revisions = useRef(new Map<string, number>()),
    queue = useRef(Promise.resolve());
  const commitRef = useRef<(m: Match) => void>(() => {});
  const [clock] = useState<TurnClock>(
    () =>
      new TurnClock(
        () => currentRef.current,
        (m) => commitRef.current(m),
        () => {
          setElapsed(clock.elapsed());
          force((x) => x + 1);
        },
      ),
  );
  function show(m: Match) {
    currentRef.current = m;
    setCurrent(m);
    setMatches((list) =>
      [m, ...list.filter((x) => x.id !== m.id)].sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
    );
  }
  function persist(m: Match) {
    setSaving(true);
    queue.current = queue.current
      .then(async () => {
        if (faultRef.current) return;
        try {
          await saveMatch(m, revisions.current.get(m.id));
          revisions.current.set(m.id, m.revision);
        } catch (e) {
          faultRef.current = true;
          setFault(true);
          setNotice(e instanceof Error ? e.message : "保存に失敗しました");
          clock.interrupt("保存に失敗したため計測を中断");
        }
      })
      .finally(() => setSaving(false));
  }
  commitRef.current = (m) => {
    show(m);
    persist(m);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await allMatches();
        for (const m of rows) {
          revisions.current.set(m.id, m.revision);
          if (m.active) {
            const stopped = interruptTurn(
              m,
              crypto.randomUUID(),
              Date.now(),
              0,
              "計測中にページが閉じられたため無効・やり直し",
            );
            await saveMatch(stopped, m.revision);
            revisions.current.set(m.id, stopped.revision);
            rows[rows.indexOf(m)] = stopped;
          }
        }
        const p = preferences(await readSettings());
        if (!cancelled) {
          setMatches(rows);
          setSettingsState(p);
          const latest = rows.find((m) => !derive(m).loser);
          if (latest) {
            currentRef.current = latest;
            setCurrent(latest);
          }
          if (rows.some((m) => m.events.at(-1)?.kind === "interrupted"))
            setNotice("中断した計測は無効です。確定済みの記録から再開できます");
        }
      } catch (e) {
        if (!cancelled) {
          faultRef.current = true;
          setFault(true);
          setNotice(e instanceof Error ? e.message : "保存を読み込めません");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      clock.tick();
      if (clock.running) setElapsed(clock.elapsed());
    }, 40);
    const hidden = () => {
      if (document.hidden) {
        clock.interrupt("画面が非表示になったため無効・やり直し");
        cancelSound(true);
      }
    };
    const hide = () => clock.interrupt("ページを離れたため無効・やり直し");
    const before = (event: BeforeUnloadEvent) => {
      if (clock.running) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", hide);
    window.addEventListener("beforeunload", before);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("beforeunload", before);
    };
  }, [clock]);
  useEffect(() => {
    const planner = new MinutePlanner();
    const step = () => {
      const now = Date.now(),
        plan = planner.step(
          now,
          performance.now(),
          settings.chime && isAudioReady() && !document.hidden,
        );
      if (plan.cancel) cancelSound();
      if (plan.at !== null)
        chime(settings, plan.at - now, plan.at, () => {
          setAudioReady(false);
          setAudioNotice(
            "時報の再生が拒否されました。次のターンの前に再試聴してください",
          );
        });
    };
    const timer = setInterval(step, 200);
    step();
    return () => {
      clearInterval(timer);
      cancelSound();
    };
  }, [settings]);
  const active = !!current?.active;
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinel | undefined,
      stopped = false;
    if (!navigator.wakeLock) {
      setWakeNotice("画面点灯維持は未対応です。画面ロックに注意してください");
      return;
    }
    navigator.wakeLock
      .request("screen")
      .then((result) => {
        if (stopped) {
          void result.release();
          return;
        }
        lock = result;
        setWakeNotice("画面点灯を維持しています");
        result.addEventListener("release", () => {
          if (!stopped)
            setWakeNotice(
              "画面点灯維持が解除されました。ロックすると計測は無効になります",
            );
        });
      })
      .catch(() =>
        setWakeNotice("画面点灯を維持できません。画面ロックに注意してください"),
      );
    return () => {
      stopped = true;
      void lock?.release();
    };
  }, [active]);
  async function audio(test = false) {
    try {
      if (test) {
        await previewChime(settings, setPreviewPlaying);
        setAudioNotice(
          "試聴を再生しました。聞こえない場合は端末のメディア音量を確認してください",
        );
      } else {
        await unlockAudio();
        setAudioNotice("時報の再生を準備しました");
      }
      setAudioReady(true);
    } catch (error) {
      setAudioReady(false);
      setAudioNotice(
        error instanceof Error
          ? error.message
          : "音声を有効にできません。計測は音なしでも続行できます",
      );
    }
  }
  function update(p: Preferences) {
    setSettingsState(p);
    void writeSettings(p).catch(() => setNotice("設定を保存できませんでした"));
  }
  function newGame(names: Record<Person, string>, first: Person) {
    if (faultRef.current) return;
    const m = createMatch(crypto.randomUUID(), Date.now(), names, first);
    show(m);
    persist(m);
    setElapsed(0);
  }
  async function retry() {
    await queue.current;
    try {
      if (currentRef.current) {
        await saveMatch(
          currentRef.current,
          revisions.current.get(currentRef.current.id),
        );
        revisions.current.set(
          currentRef.current.id,
          currentRef.current.revision,
        );
      } else await allMatches();
      faultRef.current = false;
      setFault(false);
      setNotice("保存を確認しました");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "保存できません");
    }
  }
  function start() {
    if (!faultRef.current && !saving) {
      clock.start();
      void audio();
    }
  }
  function invalidate(reason: string) {
    if (currentRef.current)
      commitRef.current(
        voidLast(currentRef.current, crypto.randomUUID(), Date.now(), reason),
      );
  }
  return {
    matches,
    setMatches,
    current,
    ready,
    settings,
    update,
    notice,
    setNotice,
    fault,
    saving,
    elapsed,
    wakeNotice,
    audioNotice,
    audioReady,
    previewPlaying,
    audio,
    running: active,
    dropped: clock.dropped,
    clock,
    newGame,
    retry,
    start,
    invalidate,
    forget: (id: string) => {
      setMatches((rows) => rows.filter((m) => m.id !== id));
      if (currentRef.current?.id === id) {
        currentRef.current = null;
        setCurrent(null);
      }
    },
    open: (m: Match) => {
      if (!clock.running) {
        currentRef.current = m;
        setCurrent(m);
        setElapsed(0);
      }
    },
  };
}
