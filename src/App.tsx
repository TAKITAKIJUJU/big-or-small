import { useEffect, useMemo, useState } from "react";
import { useInstrument } from "./application/useInstrument";
import {
  derive,
  other,
  REASONS,
  seconds,
  total,
  type Person,
} from "./domain/game";
import { download, exportCSV, exportJSON, removeMatch } from "./storage/db";
import {
  Chart,
  History,
  Rules,
  ScoreCard,
  Timer,
  TurnDetail,
} from "./ui/components";
import "./style.css";
type Page =
  "home" | "setup" | "match" | "history" | "past" | "rules" | "settings";
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const app = useInstrument(page === "match"),
    [nameA, setNameA] = useState(""),
    [nameB, setNameB] = useState(""),
    [first, setFirst] = useState<Person>("A"),
    [dialog, setDialog] = useState<"void" | "delete" | null>(null),
    [reason, setReason] = useState(""),
    [agreed, setAgreed] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [offlineReady, setOfflineReady] = useState(
      !!navigator.serviceWorker?.controller,
    ),
    [installPrompt, setInstallPrompt] = useState<
      (Event & { prompt?: () => Promise<void> }) | null
    >(null);
  const m = app.current,
    d = useMemo(() => (m ? derive(m) : null), [m]),
    last = d?.turns.at(-1),
    running = app.running;
  const setNotice = app.setNotice;
  useEffect(() => {
    const status = () => setOffline(!navigator.onLine),
      install = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e);
      };
    const offlineFailure = () =>
      setNotice(
        "オフライン準備に失敗しました。試合の合間にオンラインで再読込してください",
      );
    window.addEventListener("offline-unavailable", offlineFailure);
    void navigator.serviceWorker?.ready.then(() => setOfflineReady(true));
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("offline-unavailable", offlineFailure);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, [setNotice]);
  function go(next: Page) {
    if (!running && next !== page) {
      app.stopAudio();
      setPage(next);
    }
  }
  async function confirmed() {
    if (!m) return;
    try {
      if (dialog === "void") app.invalidate(reason);
      else {
        await removeMatch(m.id);
        app.forget(m.id);
        app.stopAudio();
        setPage("past");
      }
      setDialog(null);
      setReason("");
      setAgreed(false);
    } catch (e) {
      app.setNotice(
        e instanceof Error ? e.message : "記録を変更できませんでした",
      );
    }
  }
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null,
      modal = document.querySelector<HTMLElement>("[role=dialog]");
    const elements = () => [
      ...(modal?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,textarea",
      ) ?? []),
    ];
    elements()[0]?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialog(null);
      if (e.key === "Tab") {
        const list = elements(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [dialog]);
  const record = (kind: "drop" | "check") => app.clock.input(kind);
  return (
    <div
      className={`instrument ${running && page === "match" ? "is-running" : ""} ${app.settings.reduced ? "reduce-motion" : ""}`}
    >
      <header className="app-header" inert={!!dialog}>
        <button className="brand" disabled={running} onClick={() => go("home")}>
          <span className="brand-symbol">⌁</span>
          <span>
            USOTUKI<small>ハンカチ落とし 計時器</small>
          </span>
        </button>
        <div className="header-status">
          <i className={offline ? "offline" : ""} />
          {offline ? "OFFLINE" : "LOCAL"}
        </div>
        <button
          className="settings-button"
          aria-label="設定"
          disabled={running}
          onClick={() => go("settings")}
        >
          ⚙
        </button>
      </header>
      {app.notice && (
        <div className={`notice ${app.fault ? "error" : ""}`} role="status">
          <span>{app.notice}</span>
          {app.fault && (
            <button onClick={() => void app.retry()}>保存を再試行</button>
          )}
        </div>
      )}
      {!app.ready ? (
        <main className="loading">端末内の記録を確認しています…</main>
      ) : (
        <main inert={!!dialog}>
          {page === "home" && (
            <>
              <section className="hero">
                <div className="eyebrow">2人用・スマホ1台</div>
                <h1>ハンカチ落とし</h1>
                <p>計時・判定・記録</p>
                <div className="home-facts">
                  <span>
                    1ターン <b>60秒</b>
                  </span>
                  <span>
                    累計 <b>300秒</b>で敗北
                  </span>
                </div>
              </section>
              <section className="home-actions">
                <button
                  className="primary"
                  disabled={app.fault}
                  onClick={() => go("setup")}
                >
                  新しい試合 <span>→</span>
                </button>
                {m && !d?.loser && (
                  <button className="secondary" onClick={() => go("match")}>
                    試合の続き{" "}
                    <span>第 {(d?.turns.length ?? 0) + 1} ターン</span>
                  </button>
                )}
                <div className="menu-grid">
                  <button onClick={() => go("past")}>
                    過去の試合 <small>{app.matches.length} 件</small>
                  </button>
                  <button onClick={() => go("rules")}>
                    ルール <small>はじめての方へ</small>
                  </button>
                </div>
                {installPrompt && (
                  <button
                    className="text-button"
                    onClick={() => void installPrompt.prompt?.()}
                  >
                    ホーム画面に追加
                  </button>
                )}
                <section className="sound-check">
                  <div>
                    <b>音を確認</b>
                    <p>{app.previewPlaying ? "▶ 再生中" : app.audioNotice}</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      app.previewPlaying
                        ? app.stopPreview()
                        : void app.audio(true)
                    }
                  >
                    {app.previewPlaying ? "試聴を止める" : "音を試す"}
                  </button>
                </section>
                <p className="footnote">
                  試聴は約12秒。「1分」のサンプルです。
                </p>
                <p className="footnote">
                  記録はこの端末だけに保存。ログイン・対戦中の通信は不要です。
                </p>
              </section>
            </>
          )}
          {page === "setup" && (
            <>
              <PageHeading
                kicker="試合前の確認"
                title="試合の準備"
                back={() => go("home")}
              />
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  app.newGame({ A: nameA, B: nameB }, first);
                  go("match");
                }}
              >
                <label>
                  プレイヤーA
                  <input
                    aria-label="プレイヤーAの名前"
                    value={nameA}
                    maxLength={24}
                    placeholder="A"
                    onChange={(e) => setNameA(e.target.value)}
                  />
                </label>
                <label>
                  プレイヤーB
                  <input
                    aria-label="プレイヤーBの名前"
                    value={nameB}
                    maxLength={24}
                    placeholder="B"
                    onChange={(e) => setNameB(e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>最初のドロップ側（D）</legend>
                  <div className="segmented">
                    {(["A", "B"] as Person[]).map((p) => (
                      <button
                        type="button"
                        aria-pressed={first === p}
                        key={p}
                        onClick={() => setFirst(p)}
                      >
                        {p === "A" ? nameA || "A" : nameB || "B"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setFirst(
                        crypto.getRandomValues(new Uint8Array(1))[0] % 2
                          ? "A"
                          : "B",
                      )
                    }
                  >
                    ランダムに選ぶ
                  </button>
                </fieldset>
                <HandSetting
                  hand={app.settings.hand}
                  change={(hand) => app.update({ ...app.settings, hand })}
                />
                <div className="rule-note">
                  <b>累計300秒で敗北</b>
                  <p>
                    成功は蓄積、失敗は蓄積＋60秒を消化。D/Cは毎ターン交代し、休憩は自由です。
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    app.previewPlaying
                      ? app.stopPreview()
                      : void app.audio(true)
                  }
                >
                  {app.previewPlaying ? "試聴を止める" : "経過音を試聴"}
                </button>
                <p className="footnote" role="status">
                  {app.previewPlaying ? "▶ 試聴を再生中" : app.audioNotice}
                </p>
                <p className="footnote">
                  試聴は約12秒、「1分」のサンプルです。端末の音量・マナーモードを確認してください。落下・チェックの操作音と振動はありません。
                </p>
                <button className="primary" disabled={app.fault || app.saving}>
                  準備を終える →
                </button>
              </form>
            </>
          )}
          {page === "match" && m && d && (
            <>
              <div className="match-heading">
                <div>
                  <span className="eyebrow">
                    {d.loser
                      ? "終了"
                      : running
                        ? "計測中"
                        : "準備ができたら開始"}
                  </span>
                  <h1>
                    {d.loser ? "試合終了" : `第 ${d.turns.length + 1} ターン`}
                  </h1>
                </div>
                <button
                  className="text-button"
                  disabled={running}
                  onClick={() => go("history")}
                >
                  履歴 ↗
                </button>
              </div>
              {d.loser && (
                <section className="winner">
                  <span>WINNER</span>
                  <h2>{m.names[d.winner!]} の勝利</h2>
                  <p>
                    {m.names[d.loser]} の累計臨死時間が{" "}
                    {seconds(total(d.scores[d.loser]))} 秒に達しました。
                  </p>
                  <small>
                    {d.turns.length} ターン ／{" "}
                    {new Date(m.createdAt).toLocaleString("ja-JP")}
                  </small>
                </section>
              )}
              {!d.loser && (
                <div className="role-band">
                  <span>
                    <b>D</b> {m.names[d.dropper]}{" "}
                    <small>
                      スマホを持つ · 累計 {seconds(total(d.scores[d.dropper]))}
                      秒
                    </small>
                  </span>
                  <span>
                    <b>C</b> {m.names[other(d.dropper)]}{" "}
                    <small>
                      前を向く · 累計{" "}
                      {seconds(total(d.scores[other(d.dropper)]))}秒
                    </small>
                  </span>
                </div>
              )}
              {app.countdown > 0 && (
                <section
                  className="start-area"
                  aria-label="開始前カウントダウン"
                >
                  <p className="eyebrow">まもなく計測開始</p>
                  <div
                    role="timer"
                    aria-live="assertive"
                    style={{
                      fontSize: "clamp(5rem, 25vw, 9rem)",
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    {app.countdown}
                  </div>
                  <p className="footnote center">0になったら60秒の計測開始</p>
                  <button className="secondary" onClick={app.cancelCountdown}>
                    開始を取り消す
                  </button>
                </section>
              )}
              {running && !app.countdown && (
                <>
                  <Timer elapsed={app.elapsed} />
                  <p className="recording-state" aria-live="polite">
                    {app.dropped === null
                      ? "落下・チェックを記録してください"
                      : `落下 ${seconds(app.dropped)} 秒で記録済み`}
                  </p>
                  <p className="audio-state">
                    {app.settings.chime
                      ? app.audioReady
                        ? "時報 ON · 秒音と10秒ごと"
                        : "時報は未準備・計測は続行できます"
                      : "時報 OFF"}
                  </p>
                  <p className="wake-note">{app.wakeNotice}</p>
                  <div
                    className={`record-controls ${app.settings.hand === "left" ? "left-handed" : ""}`}
                  >
                    <button
                      className="drop-button"
                      disabled={app.dropped !== null}
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        record("drop");
                      }}
                      onClick={(e) => {
                        if (e.detail === 0) record("drop");
                      }}
                    >
                      <span>DROP</span>
                      <strong>
                        {app.dropped === null ? "落下" : "記録済み"}
                      </strong>
                    </button>
                    <button
                      className="check-button"
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        record("check");
                      }}
                      onClick={(e) => {
                        if (e.detail === 0) record("check");
                      }}
                    >
                      <span>CHECK</span>
                      <strong>チェック</strong>
                      <small>振り向いた瞬間</small>
                    </button>
                  </div>
                  <p className="footnote center">
                    操作音・振動なし。60.000秒で自動判定。
                  </p>
                </>
              )}
              {!running && last && (
                <section className="last-result" aria-label="直前ターンの結果">
                  <span className="eyebrow">前のターン · {last.number}</span>
                  <h2>{REASONS[last.reason]}</h2>
                  <p>
                    {m.names[last.subject]}：
                    {last.reason === "success"
                      ? `蓄積 +${seconds(last.addedMs)} 秒`
                      : `ペナルティ +60.00 秒 ／ 今回の消化 ${seconds(last.consumedThisTurnMs)} 秒`}
                  </p>
                  <details>
                    <summary>計算の内訳</summary>
                    <TurnDetail turn={last} match={m} />
                  </details>
                </section>
              )}
              {!running && !d.loser && (
                <div className="start-area">
                  {m.events.at(-1)?.kind === "interrupted" && (
                    <div className="rule-note">
                      中断したターンは無効です。役割・累計を変えずにやり直します。
                    </div>
                  )}
                  <button
                    className="primary start-button"
                    disabled={app.saving || app.fault}
                    onClick={app.start}
                  >
                    {d.turns.length ? "次のターンを開始" : "カウント開始"}
                    <small>3秒のカウントダウン後に計測</small>
                  </button>
                  <p className="footnote center">
                    両者の準備ができてから。待ち時間の制限はありません。
                  </p>
                </div>
              )}
              <div className="score-grid" hidden={running}>
                {(["A", "B"] as Person[]).map((p) => (
                  <ScoreCard
                    key={p}
                    name={m.names[p]}
                    score={d.scores[p]}
                    role={
                      running || !d.loser
                        ? d.dropper === p
                          ? "次・現在のD"
                          : "次・現在のC"
                        : undefined
                    }
                  />
                ))}
              </div>
              <p className="formula-note" hidden={running}>
                <span className="swatch accumulated" /> 蓄積 ＋{" "}
                <span className="swatch consumed" /> 消化済み ＝
                累計。ペナルティは消化済みの内訳です。
              </p>
              {!running && (
                <>
                  <div className="button-row">
                    <button className="secondary" onClick={() => go("home")}>
                      ホーム
                    </button>
                    <button className="secondary" onClick={() => go("history")}>
                      全履歴・推移
                    </button>
                  </div>
                  {last && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setDialog("void");
                        setAgreed(false);
                        setReason("");
                      }}
                    >
                      直前ターンを無効化・再プレイ
                    </button>
                  )}
                </>
              )}
              {d.loser && (
                <>
                  <Chart match={m} />
                  <button className="primary" onClick={() => go("setup")}>
                    新しい試合を準備
                  </button>
                </>
              )}
              <div
                className={`save-status ${app.fault ? "bad" : ""}`}
                role="status"
              >
                {app.fault
                  ? "未保存の記録があります。JSONで保管してください"
                  : app.saving
                    ? "端末に保存中…"
                    : "✓ 端末内に保存済み"}
              </div>
            </>
          )}
          {page === "history" && m && (
            <>
              <PageHeading
                kicker="記録"
                title={`${m.names.A} × ${m.names.B}`}
                back={() => go("match")}
              />
              <Chart match={m} />
              <History match={m} />
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() =>
                    download("handkerchief-match.json", exportJSON([m]))
                  }
                >
                  JSON書き出し
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      "handkerchief-match.csv",
                      exportCSV([m]),
                      "text/csv",
                    )
                  }
                >
                  CSV書き出し
                </button>
              </div>
              <button
                className="text-button danger-text"
                onClick={() => {
                  setDialog("delete");
                  setAgreed(false);
                }}
              >
                この試合を削除
              </button>
            </>
          )}
          {page === "past" && (
            <>
              <PageHeading
                kicker="端末内に保存"
                title="過去の試合"
                back={() => go("home")}
              />
              {app.matches.length === 0 && (
                <p className="empty">保存された試合はありません。</p>
              )}
              {app.matches.map((row) => {
                const result = derive(row);
                return (
                  <button
                    className="archive-row"
                    key={row.id}
                    onClick={() => {
                      app.open(row);
                      go("history");
                    }}
                  >
                    <div>
                      <b>
                        {row.names.A} × {row.names.B}
                      </b>
                      <small>
                        {new Date(row.createdAt).toLocaleString("ja-JP")} ·{" "}
                        {result.turns.length} ターン
                      </small>
                    </div>
                    <span>
                      {result.winner
                        ? `${row.names[result.winner]} 勝利`
                        : "中断・続行可"}{" "}
                      →
                    </span>
                  </button>
                );
              })}
              <button
                className="secondary full"
                onClick={() =>
                  download(
                    "handkerchief-all-matches.json",
                    exportJSON(app.matches),
                  )
                }
              >
                全試合をJSONで書き出す
              </button>
            </>
          )}
          {page === "rules" && (
            <>
              <PageHeading
                kicker="遊び方"
                title="ルールと計測について"
                back={() => go("home")}
              />
              <Rules />
            </>
          )}
          {page === "settings" && (
            <>
              <PageHeading
                kicker="設定"
                title="計器の設定"
                back={() => go("home")}
              />
              <div className="form">
                <HandSetting
                  hand={app.settings.hand}
                  change={(hand) => app.update({ ...app.settings, hand })}
                />
                <label className="toggle">
                  時報（秒音・10秒ごと）
                  <input
                    type="checkbox"
                    checked={app.settings.chime}
                    onChange={(e) =>
                      app.update({ ...app.settings, chime: e.target.checked })
                    }
                  />
                </label>
                <label>
                  時報の音量 <b>{Math.round(app.settings.volume * 100)}%</b>
                  <input
                    aria-label="時報の音量"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={app.settings.volume}
                    onChange={(e) =>
                      app.update({
                        ...app.settings,
                        volume: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="toggle">
                  経過時間の読み上げ（内蔵の女性音声）
                  <input
                    type="checkbox"
                    checked={app.settings.voice}
                    onChange={(e) =>
                      app.update({ ...app.settings, voice: e.target.checked })
                    }
                  />
                </label>
                <small>
                  1秒ごとにチッ、10秒ごとにポーン。開始から57・58・59秒はピッ。経過時間を10秒ごとに予告します。
                </small>
                <button
                  className="secondary"
                  onClick={() =>
                    app.previewPlaying
                      ? app.stopPreview()
                      : void app.audio(true)
                  }
                >
                  {app.previewPlaying ? "試聴を止める" : "時報を試聴"}
                </button>
                <small>試聴は約12秒。「1分」のサンプルです。</small>
                <p className="footnote">
                  {app.previewPlaying ? "▶ 試聴を再生中" : app.audioNotice}{" "}
                  音声が利用できなくても計測は続行できます。
                </p>
                <label className="toggle">
                  アニメーションを軽減
                  <input
                    type="checkbox"
                    checked={app.settings.reduced}
                    onChange={(e) =>
                      app.update({ ...app.settings, reduced: e.target.checked })
                    }
                  />
                </label>
                <div className="rule-note">
                  音はターン開始を0秒として、計測と同じ時計で鳴ります。60秒は3回の予告音の後のポーンが基準です。音と読み上げは通信なしで使えます。音量・マナーモード・ブラウザ制限・遅延の影響を受けます。
                </div>
                <div className="rule-note">
                  <b>
                    {offlineReady ? "オフライン準備完了" : "オフライン準備中"}
                  </b>
                  <p>
                    一度オンラインで読み込みを完了してから、Chromeのメニューで「ホーム画面に追加」を選んでください。更新は次回起動時に反映され、計測中に自動再読込はしません。
                  </p>
                </div>
                <a href="/licenses.txt">利用ライブラリのライセンス</a>
              </div>
            </>
          )}
        </main>
      )}
      {dialog && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <h2 id="dialog-title">
              {dialog === "void" ? "直前ターンを無効化" : "この試合を削除"}
            </h2>
            <p>
              {dialog === "void"
                ? "旧記録と理由は監査履歴に残ります。確定データから累計を計算し直し、同じ役割で再プレイします。"
                : "この端末から試合記録を削除します。元には戻せません。必要なら先にJSONを書き出してください。"}
            </p>
            {dialog === "void" && (
              <label>
                訂正理由
                <textarea
                  aria-label="訂正理由"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={300}
                />
              </label>
            )}
            <label className="toggle">
              <span>
                {dialog === "void"
                  ? "両者で無効化に合意しました"
                  : "記録の削除を確認しました"}
              </span>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
            </label>
            <div className="button-row">
              <button className="secondary" onClick={() => setDialog(null)}>
                戻る
              </button>
              <button
                className="primary"
                disabled={!agreed || (dialog === "void" && !reason.trim())}
                onClick={() => void confirmed()}
              >
                {dialog === "void" ? "無効化してやり直す" : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}
      <footer className="app-footer">
        USOTUKI · ハンカチ計時器 · v1.5 <span>記録は端末内のみ</span>
      </footer>
    </div>
  );
}
function PageHeading({
  kicker,
  title,
  back,
}: {
  kicker: string;
  title: string;
  back: () => void;
}) {
  return (
    <div className="page-heading">
      <button className="back" onClick={back} aria-label="戻る">
        ←
      </button>
      <div>
        <span className="eyebrow">{kicker}</span>
        <h1>{title}</h1>
      </div>
    </div>
  );
}
function HandSetting({
  hand,
  change,
}: {
  hand: "left" | "right";
  change: (h: "left" | "right") => void;
}) {
  return (
    <fieldset>
      <legend>スマホを持つ手・ボタン配置</legend>
      <div className="segmented">
        <button
          type="button"
          aria-pressed={hand === "left"}
          onClick={() => change("left")}
        >
          左手
        </button>
        <button
          type="button"
          aria-pressed={hand === "right"}
          onClick={() => change("right")}
        >
          右手
        </button>
      </div>
    </fieldset>
  );
}
