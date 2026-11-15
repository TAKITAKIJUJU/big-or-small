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
  countdownChimes,
  playSignal,
  isAudioReady,
  DEFAULTS,
  preferences,
  previewChime,
  stopPreview,
  unlockAudio,
  type Preferences,
} from "../audio/chime";
import { TimeSignalPlanner } from "../audio/signal";
import { TurnClock } from "./clock";
export function useInstrument(signalActive: boolean) {
  const [matches, setMatches] = useState<Match[]>([]),
    [current, setCurrent] = useState<Match | null>(null),
    [settings, setSettingsState] = useState<Preferences>(DEFAULTS),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState(""),
    [fault, setFault] = useState(false),
    [saving, setSaving] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [countdown, setCountdown] = useState(0),
    [wakeNotice, setWakeNotice] = useState(""),
    [previewPlaying, setPreviewPlaying] = useState(false),
    [audioReady, setAudioReady] = useState(false),
    [audioRevision, setAudioRevision] = useState(0),
    [audioNotice, setAudioNotice] =
      useState("時報は試聴で動作を確認してください"),
    [, force] = useState(0);
  const countdownDeadline = useRef<number | null>(null);
  function cancelCountdown() {
    countdownDeadline.current = null;
    setCountdown(0);
    cancelSound(true);
  }
  const signalOrigin = useRef<number | null>(null);
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
      if (countdownDeadline.current !== null) {
        const at = countdownDeadline.current;
        if (performance.now() >= at) {
          countdownDeadline.current = null;
          if (faultRef.current || document.hidden) {
            cancelSound(true);
            setCountdown(0);
            return;
          }
          clock.start(at);
          signalOrigin.current = clock.startedMonotonic;
          setCountdown(0);
          setAudioRevision((n) => n + 1);
        } else setCountdown(Math.ceil((at - performance.now()) / 1000));
      }
      clock.tick();
      if (clock.running) setElapsed(clock.elapsed());
    }, 40);
    const hidden = () => {
      if (document.hidden) {
        countdownDeadline.current = null;
        setCountdown(0);
        clock.interrupt("画面が非表示になったため無効・やり直し");
        cancelSound(true);
      }
    };
    const hide = () => {
      countdownDeadline.current = null;
      setCountdown(0);
      cancelSound(true);
      clock.interrupt("ページを離れたため無効・やり直し");
    };
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
      cancelSound(true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("beforeunload", before);
    };
  }, [clock]);
  useEffect(() => {
    if (!signalActive) {
      cancelSound();
      return;
    }
    const planner = new TimeSignalPlanner();
    const step = () => {
      const mono = performance.now(),
        now = signalOrigin.current === null ? 0 : mono - signalOrigin.current,
        plan = planner.step(
          now,
          mono,
          signalOrigin.current !== null &&
            (clock.running ||
              (clock.timedOut && now >= 60000 && now < 61500)) &&
            settings.chime &&
            isAudioReady() &&
            !document.hidden,
        );
      if (plan.cancel) cancelSound();
      for (const cue of plan.cues.filter(
        (cue) => cue.at > 0 && cue.at <= 60000,
      ))
        playSignal(
          settings,
          cue.tone,
          cue.at - now,
          cue.announceAt,
          (message) => {
            setAudioReady(isAudioReady());
            setAudioNotice(message);
          },
        );
    };
    const timer = setInterval(step, 200);
    step();
    return () => {
      clearInterval(timer);
      cancelSound();
    };
  }, [settings, audioRevision, signalActive, clock]);
  const active = !!current?.active || countdown > 0;
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
        const result = await previewChime(settings, setPreviewPlaying);
        if (result === "cancelled") return;
        setAudioNotice(
          "試聴を再生しました。聞こえない場合は端末のメディア音量を確認してください",
        );
      } else {
        const recovered = await unlockAudio(true);
        if (recovered) setAudioRevision((revision) => revision + 1);
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
    if (
      !faultRef.current &&
      !saving &&
      !clock.running &&
      countdownDeadline.current === null
    ) {
      signalOrigin.current = null;
      cancelSound(true);
      countdownDeadline.current = performance.now() + 3000;
      const deadline = countdownDeadline.current;
      setCountdown(3);
      setAudioReady(false);
      setAudioNotice("開始音を準備しています");
      setAudioRevision((revision) => revision + 1);
      void audio().then(() => {
        if (countdownDeadline.current === deadline && !document.hidden)
          countdownChimes(settings, deadline, setAudioNotice);
      });
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
    countdown,
    cancelCountdown,
    wakeNotice,
    audioNotice,
    audioReady,
    previewPlaying,
    stopPreview,
    stopAudio: () => cancelSound(true),
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
