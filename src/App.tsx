import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { actionText, type BetAction, type PlayerView } from "./game/engine";
import { useGame } from "./lib/useGame";
import { unlockAudio } from "./lib/audio";
import type { Settings } from "./lib/session";
import "./style.css";
const TableScene = lazy(() => import("./scene/TableScene"));
export const GAME_NAME = "USOTUKI";
const DIFFICULTY = { easy: "初級", medium: "中級", hard: "上級" };
type ModalName = "settings" | "rules" | "history" | "new" | null;
function Icon({
  kind,
  muted = false,
}: {
  kind: "settings" | "sound" | "history";
  muted?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "settings" ? (
        <>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
        </>
      ) : kind === "history" ? (
        <>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.1M3 12h.1M3 18h.1" />
        </>
      ) : (
        <>
          <path d="M3 9h4l5-4v14l-5-4H3Z" />
          {muted ? (
            <path d="m17 9 5 6m0-6-5 6" />
          ) : (
            <path d="M16 8q4 4 0 8m3-11q7 7 0 14" />
          )}
        </>
      )}
    </svg>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="dialog"
    >
      <div className="dialog-head">
        <span className="eyebrow">USOTUKI / FIELD NOTES</span>
        <button className="icon-button" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <h2>{title}</h2>
      {children}
      <button className="button outline full" onClick={onClose}>
        卓に戻る
      </button>
    </dialog>
  );
}
function Rules() {
  return (
    <div className="prose">
      <p>
        13枚の札を、一度ずつ。番人より多くのチップを残せば、あなたの勝ちです。
      </p>
      <ol>
        <li>お互いに2チップを中央へ出します。</li>
        <li>1〜13から1枚を選び、伏せて確定。番人も抽選前に確定します。</li>
        <li>
          <b>BIG</b>なら大きい数字、<b>SMALL</b>
          なら小さい数字が勝ち。毎回、独立した五分五分の抽選です。
        </li>
        <li>結果を見て、賭けるか、降りるかを決めます。</li>
        <li>
          コール、または双方チェックで札を公開。同数はポットを半分ずつ受け取ります。
        </li>
      </ol>
      <dl>
        <dt>チェック</dt>
        <dd>追加で賭けずに手番を渡す。</dd>
        <dt>ベット</dt>
        <dd>追加でチップを賭け始める。</dd>
        <dt>コール</dt>
        <dd>相手の追加拠出と同じ合計額にする。</dd>
        <dt>レイズ</dt>
        <dd>相手の額に上乗せする。1ラウンド合計2回まで。</dd>
        <dt>フォールド</dt>
        <dd>降りてポットを譲る。両者の札は裏のまま廃棄。</dd>
      </dl>
      <p>
        通常は2チップ刻み・1人の追加拠出合計20まで。先手は交代します。受けられていない差額は返還されます。
      </p>
      <p>
        13ラウンド、またはどちらかが次のアンティ2を払えなくなると終了。使った札は戻りません。
      </p>
      <p>
        オールインをONにすると20の上限を外します。相手が払える有効額までで、端数のみ1チップ刻みも可。双方が同額を拠出してから公開します。
      </p>
      <small>
        チップはゲーム内だけの数値です。現実のお金・課金・換金・賞金はありません。Botは通信せず、このブラウザ内で動作します。
      </small>
    </div>
  );
}
function SettingsPanel({
  settings,
  setSettings,
  inMatch,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  inMatch: boolean;
}) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings({ ...settings, [key]: value });
  return (
    <div className="settings-grid">
      <label>
        番人の難易度
        <select
          value={settings.difficulty}
          onChange={(e) =>
            update("difficulty", e.target.value as Settings["difficulty"])
          }
        >
          {Object.entries(DIFFICULTY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        演出の速度
        <select
          value={settings.speed}
          onChange={(e) => update("speed", e.target.value as Settings["speed"])}
        >
          <option value="normal">標準</option>
          <option value="fast">速い</option>
          <option value="skip">演出を省略</option>
        </select>
      </label>
      <label>
        描画品質
        <select
          value={settings.quality}
          onChange={(e) =>
            update("quality", e.target.value as Settings["quality"])
          }
        >
          <option value="auto">自動</option>
          <option value="high">高</option>
          <option value="low">低・省電力</option>
        </select>
      </label>
      <label className="toggle">
        動きを軽減する
        <input
          type="checkbox"
          checked={settings.reduced}
          onChange={(e) => update("reduced", e.target.checked)}
        />
      </label>
      <label className="toggle">
        音をミュート
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(e) => update("muted", e.target.checked)}
        />
      </label>
      <label>
        音量 {Math.round(settings.volume * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.volume}
          onChange={(e) => {
            unlockAudio();
            update("volume", Number(e.target.value));
          }}
        />
      </label>
      <label className="toggle">
        オールイン（次の対局から）
        <input
          type="checkbox"
          checked={settings.allIn}
          onChange={(e) => update("allIn", e.target.checked)}
        />
      </label>
      {inMatch && <small>進行中の対局の上限は変更されません。</small>}
      <label className="toggle">
        試合終了後に全カードを開示
        <input
          type="checkbox"
          checked={settings.reveal}
          onChange={(e) => update("reveal", e.target.checked)}
        />
      </label>
      <small>対局中、フォールドされた相手の札は履歴にも表示されません。</small>
    </div>
  );
}
function History({ view }: { view: PlayerView | null }) {
  return (
    <div className="history">
      {!view?.history.length ? (
        <p>まだ決着したラウンドはありません。</p>
      ) : (
        <>
          <div className="history-header">
            <span>回 / 判定</span>
            <span>あなた</span>
            <span>番人</span>
            <span>増減</span>
          </div>
          {view.history.map((r) => (
            <div className="history-row" key={r.round}>
              <span>
                <b>{String(r.round).padStart(2, "0")}</b>{" "}
                <small>{r.mode}</small>
              </span>
              <span>{r.cards.human ?? "非公開"}</span>
              <span>{r.cards.bot ?? "非公開"}</span>
              <span className={r.delta.human > 0 ? "positive" : ""}>
                {r.delta.human > 0 ? "+" : ""}
                {r.delta.human}
                <small>
                  {r.reason === "fold"
                    ? "フォールド"
                    : r.winner === "tie"
                      ? "引き分け"
                      : "札を公開"}
                </small>
              </span>
            </div>
          ))}
          {view.phase === "finished" && (
            <div className="review">
              <h3>卓の記録</h3>
              {view.history
                .filter((r) => r.reason === "fold" && r.cards.bot !== null)
                .map((r) => {
                  const player = r.winner === "human";
                  const winAtShowdown =
                    r.cards.bot === r.cards.human
                      ? "tie"
                      : (
                            r.mode === "BIG"
                              ? r.cards.human! > r.cards.bot!
                              : r.cards.human! < r.cards.bot!
                          )
                        ? "human"
                        : "bot";
                  return (
                    <p key={r.round}>
                      第{r.round}回：
                      {winAtShowdown !== r.winner && winAtShowdown !== "tie"
                        ? player
                          ? "あなたのブラフが成功。"
                          : "番人のブラフが成功。"
                        : "降りた札を振り返る。"}{" "}
                      あなた {r.cards.human} / 番人 {r.cards.bot}
                    </p>
                  );
                })}
              <small>
                公開後の札による振り返りです。対局中のBotは相手の札を参照しません。
              </small>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function Betting({
  view,
  busy,
  onAct,
}: {
  view: PlayerView;
  busy: boolean;
  onAct: (a: BetAction) => void;
}) {
  const [amount, setAmount] = useState(2);
  const increases = view.legal.filter(
    (a): a is Extract<BetAction, { total: number }> => "total" in a,
  );
  const amounts = increases.map((a) => a.total),
    total = amounts.includes(amount) ? amount : (amounts[0] ?? 0);
  const due = Math.max(0, view.contributions.bot - view.contributions.human),
    selected = increases.find((a) => a.total === total);
  return (
    <>
      <div className="bet-status">
        <span>
          あなたの追加拠出 <b>{view.contributions.human}</b>
        </span>
        <span>
          番人 <b>{view.contributions.bot}</b> / 上限{" "}
          {view.allIn ? "有効スタック" : 20}
        </span>
      </div>
      {increases.length > 0 && (
        <div className="amount-control">
          <button
            aria-label="ベット総額を減らす"
            disabled={busy || total === amounts[0]}
            onClick={() =>
              setAmount(amounts[Math.max(0, amounts.indexOf(total) - 1)])
            }
          >
            −
          </button>
          <div>
            <label htmlFor="bet-amount">
              {selected?.type === "raise" ? "レイズ後の合計" : "ベット額"}{" "}
              <b>{total}</b>
            </label>
            <input
              id="bet-amount"
              aria-label="追加拠出の合計額"
              type="range"
              min="0"
              max={amounts.length - 1}
              step="1"
              value={amounts.indexOf(total)}
              disabled={busy}
              onChange={(e) => setAmount(amounts[Number(e.target.value)])}
            />
          </div>
          <button
            aria-label="ベット総額を増やす"
            disabled={busy || total === amounts.at(-1)}
            onClick={() =>
              setAmount(
                amounts[
                  Math.min(amounts.length - 1, amounts.indexOf(total) + 1)
                ],
              )
            }
          >
            ＋
          </button>
        </div>
      )}
      <div className="action-buttons">
        {view.legal.some((a) => a.type === "fold") && (
          <button
            className="button danger"
            disabled={busy}
            onClick={() => onAct({ type: "fold" })}
          >
            降りる<small>フォールド</small>
          </button>
        )}
        {view.legal.some((a) => a.type === "check") && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => onAct({ type: "check" })}
          >
            チェック<small>追加 0</small>
          </button>
        )}
        {view.legal.some((a) => a.type === "call") && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => onAct({ type: "call" })}
          >
            コール<small>追加 {due}</small>
          </button>
        )}
        {selected && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => onAct(selected)}
          >
            {selected.type === "bet" ? "ベット" : "レイズ"}
            <small>
              追加 {total - view.contributions.human} → 合計 {total}
            </small>
          </button>
        )}
      </div>
    </>
  );
}
export default function App() {
  const game = useGame(),
    { view, settings, setSettings } = game;
  const [screen, setScreen] = useState<"home" | "game">("home"),
    [modal, setModal] = useState<ModalName>(null),
    [candidate, setCandidate] = useState<number | null>(null),
    [snap, setSnap] = useState(0),
    [fallback, setFallback] = useState(false),
    [tutorial, setTutorial] = useState(false),
    [tutorialRequest, setTutorialRequest] = useState(false),
    [reducedOS, setReducedOS] = useState(false);
  const revision = view?.revision ?? -1;
  const autoStep =
    view &&
    (view.phase === "drawing" ||
      (view.phase === "selecting" && !view.opponentCommitted) ||
      (view.phase === "betting" && view.turn === "bot"));
  const stepRef = useRef(game.step);
  stepRef.current = game.step;
  const revealRef = useRef(game.completeReveal);
  revealRef.current = game.completeReveal;
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedOS(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (screen !== "game" || modal || (!autoStep && !game.revealPending))
      return;
    const delay =
      settings.reduced || reducedOS || settings.speed === "skip"
        ? 80
        : settings.speed === "fast"
          ? 250
          : game.revealPending
            ? 1300
            : view?.phase === "drawing"
              ? 0
              : 850;
    const t = setTimeout(
      () =>
        game.revealPending ? revealRef.current() : stepRef.current(revision),
      delay,
    );
    return () => clearTimeout(t);
  }, [
    revision,
    screen,
    modal,
    autoStep,
    settings.speed,
    settings.reduced,
    reducedOS,
    view?.phase,
    game.revealPending,
  ]);
  function start(forceTutorial = false) {
    unlockAudio();
    game.newGame(settings);
    setScreen("game");
    setCandidate(null);
    setModal(null);
    setTutorial(forceTutorial || !settings.tutorialSeen);
  }
  function closeTutorial() {
    setTutorial(false);
    setSettings({ ...settings, tutorialSeen: true });
  }
  const inMatch = !!view && view.phase !== "finished";
  const last = view?.history.at(-1);
  const chosen =
    candidate !== null &&
    view?.hand.includes(candidate) &&
    view.ownCard === null;
  const status = !view
    ? ""
    : game.revealPending
      ? "装置が、運命を告げる。"
      : view.phase === "selecting"
        ? "運命が決まる前に、一枚を。"
        : view.phase === "drawing"
          ? "二枚が伏せられた。装置が動く。"
          : view.phase === "betting"
            ? view.turn === "human"
              ? "あなたの手番"
              : "番人が考えています…"
            : view.phase === "resolved"
              ? last?.winner === "tie"
                ? "この勝負は、引き分け。"
                : last?.winner === "human"
                  ? "あなたが、この勝負を取った。"
                  : "番人が、この勝負を取った。"
              : "十三夜の卓、閉幕。";
  const tutorialText =
    view?.phase === "selecting"
      ? "① 手元の札、または下の数字を選び、「この札を伏せる」で確定。抽選前なので、まだ有利な数字は分かりません。"
      : view?.phase === "drawing"
        ? "② 札は変更できません。BIGは大きい札、SMALLは小さい札が勝ちます。"
        : view?.phase === "betting"
          ? "③ チェックは追加なし。ベット後はコールで勝負、フォールドで降ります。札の強さと相手の行動を考えてみましょう。"
          : "④ 公開された札で勝敗が決まります。降りた場合は裏のまま。使った札は戻りません。";
  return (
    <main
      className={`app ${screen === "home" ? "is-home" : ""} ${settings.reduced || reducedOS ? "reduce-motion" : ""}`}
    >
      <Suspense
        fallback={<div className="scene-loading">部屋の扉を開けています…</div>}
      >
        <TableScene
          view={view}
          candidate={candidate}
          onSelect={(n) => {
            if (!modal && !game.busy) {
              unlockAudio();
              setCandidate(n);
            }
          }}
          settings={{ ...settings, reduced: settings.reduced || reducedOS }}
          home={screen === "home"}
          snap={snap}
          onFallback={() => setFallback(true)}
        />
      </Suspense>
      {screen === "home" ? (
        <>
          <header className="home-header">
            <a href="#" className="wordmark" aria-label="USOTUKI ホーム">
              U<span className="diamond">◇</span>
            </a>
            <span className="eyebrow">十三夜の卓 / LOCAL BOT EDITION</span>
            <button
              className="icon-button"
              aria-label="設定"
              onClick={() => setModal("settings")}
            >
              <Icon kind="settings" />
            </button>
          </header>
          <section className="home-title">
            <span className="eyebrow">THE TRUTH STAYS FACE DOWN.</span>
            <h1>
              {GAME_NAME}
              <span className="logo-dot">.</span>
            </h1>
            <div className="title-rule">
              <span>BIG</span>
              <i />
              or
              <i />
              <span>SMALL</span>
            </div>
            <p>十三枚の札。ひとつの嘘。</p>
          </section>
          <section className="home-menu">
            <div className="menu-note">
              <span className="status-dot" /> 向かいの席は、空いていない。
            </div>
            {inMatch && (
              <button
                className="button primary full"
                onClick={() => {
                  unlockAudio();
                  setScreen("game");
                }}
              >
                対局を再開<span>第 {view?.round} 回 →</span>
              </button>
            )}
            <button
              className={`button ${inMatch ? "outline" : "primary"} full`}
              onClick={() => {
                setTutorialRequest(false);
                if (inMatch) setModal("new");
                else start();
              }}
            >
              {inMatch ? "新しい対局" : "卓につく"}
              <span>{DIFFICULTY[settings.difficulty]}の番人 →</span>
            </button>
            <div className="home-links">
              <button onClick={() => setModal("rules")}>遊び方</button>
              <span>/</span>
              <button
                onClick={() => {
                  setTutorialRequest(true);
                  if (inMatch) setModal("new");
                  else start(true);
                }}
              >
                実践チュートリアル
              </button>
            </div>
            <div className="home-foot">
              <span>1 PLAYER · 13 ROUNDS</span>
              <span>音のある静けさを推奨</span>
            </div>
          </section>
        </>
      ) : (
        view && (
          <>
            <header className="game-header">
              <button
                className="mini-logo"
                aria-label="ホームへ戻る"
                onClick={() => setScreen("home")}
              >
                U<span>◇</span>
              </button>
              <div className="round-counter">
                <span>ROUND</span>
                <strong>
                  {String(view.round).padStart(2, "0")}
                  <small> / 13</small>
                </strong>
              </div>
              <div className="header-actions">
                <button
                  className="icon-button"
                  aria-label={settings.muted ? "音をオン" : "音をミュート"}
                  onClick={() => {
                    unlockAudio();
                    setSettings({ ...settings, muted: !settings.muted });
                  }}
                >
                  <Icon kind="sound" muted={settings.muted} />
                </button>
                <button
                  className="icon-button"
                  aria-label="対局履歴"
                  onClick={() => setModal("history")}
                >
                  <Icon kind="history" />
                </button>
                <button
                  className="icon-button"
                  aria-label="設定"
                  onClick={() => setModal("settings")}
                >
                  <Icon kind="settings" />
                </button>
              </div>
            </header>
            <div className="scoreboard">
              <div>
                <span>YOU / あなた</span>
                <b>
                  {view.chips.human}
                  <small>chips</small>
                </b>
              </div>
              <div className="pot">
                <span>POT</span>
                <b>{view.pot}</b>
              </div>
              <div className="opponent-score">
                <span>番人 / {DIFFICULTY[settings.difficulty]}</span>
                <b>
                  {view.chips.bot}
                  <small>chips</small>
                </b>
              </div>
            </div>
            <div className="table-caption">
              <span className="eyebrow">
                {view.phase === "selecting"
                  ? "KEEP YOUR INTENTIONS QUIET"
                  : view.phase === "drawing"
                    ? "THE MACHINE DECIDES"
                    : "READ THE SILENCE"}
              </span>
              <span
                className={`mode-badge ${game.revealPending ? "drawing" : ""}`}
              >
                {view.mode ?? (view.phase === "drawing" ? "抽選中" : "?")}
              </span>
              <span>
                {view.mode === "BIG"
                  ? "大きい数字が勝つ"
                  : view.mode === "SMALL"
                    ? "小さい数字が勝つ"
                    : "双方の確定後に抽選"}
              </span>
            </div>
            <div className="scene-tools">
              <span>
                {fallback ? "軽量モード" : "3D TABLE"} ·{" "}
                {view.allIn ? "オールイン有効" : "上限 20"}
              </span>
              <button
                onClick={() => {
                  setSnap((n) => n + 1);
                  if (game.revealPending) game.completeReveal();
                  else if (autoStep && !modal) game.step(revision);
                }}
              >
                演出スキップ ↗
              </button>
            </div>
            <section
              className={`control-panel ${view.phase === "finished" ? "end-panel" : ""}`}
              aria-label="対局操作"
            >
              {tutorial && (
                <div className="tutorial">
                  <p>{tutorialText}</p>
                  <button
                    onClick={closeTutorial}
                    aria-label="チュートリアルを終了"
                  >
                    スキップ ×
                  </button>
                </div>
              )}
              <div className="panel-heading">
                <h2 aria-live="polite">{status}</h2>
                <button
                  className="help"
                  onClick={() => setModal("rules")}
                  aria-label="ルールを読む"
                >
                  ?
                </button>
              </div>
              {view.phase === "selecting" && (
                <>
                  <div className="hand-label">
                    <span>
                      YOUR HAND{" "}
                      <small>残り {view.hand.length} 枚 · 横にスクロール</small>
                    </span>
                    <span>
                      {chosen ? `選択中：${candidate}` : "札をタップ"}
                    </span>
                  </div>
                  <div
                    className="hand-strip"
                    role="group"
                    aria-label="あなたの手札"
                  >
                    {view.hand.map((c) => (
                      <button
                        key={c}
                        aria-label={`カード${c}を選択`}
                        aria-pressed={candidate === c}
                        disabled={view.ownCard !== null || game.busy || !!modal}
                        onClick={() => {
                          unlockAudio();
                          setCandidate(c);
                        }}
                      >
                        {String(c).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                  <button
                    className="button primary full commit"
                    disabled={!chosen || game.busy || !!modal}
                    onClick={() => {
                      unlockAudio();
                      if (chosen)
                        game.humanCommand({
                          type: "select",
                          player: "human",
                          card: candidate!,
                        });
                    }}
                  >
                    {chosen
                      ? `${candidate} の札を伏せる`
                      : "一枚、選んでください"}
                    <span>確定後は変更できません</span>
                  </button>
                </>
              )}
              {(view.phase === "drawing" || game.revealPending) && (
                <div className="waiting">
                  <span className="spinner" />
                  <p>
                    BIG / SMALL は毎回 50% / 50%
                    <small>あなたの札：{view.ownCard} · 確定済み</small>
                  </p>
                </div>
              )}
              {view.phase === "betting" &&
                !game.revealPending &&
                (view.turn === "human" ? (
                  <Betting
                    key={view.round}
                    view={view}
                    busy={game.busy || !!modal}
                    onAct={(a) => {
                      unlockAudio();
                      game.humanCommand({
                        type: "act",
                        player: "human",
                        action: a,
                      });
                    }}
                  />
                ) : (
                  <div className="waiting">
                    <span className="spinner" />
                    <p>
                      番人の手が、チップに伸びる。
                      <small>
                        あなたの札：{view.ownCard} / {view.mode} / 追加拠出：
                        {view.contributions.human}
                      </small>
                    </p>
                  </div>
                ))}
              {view.phase === "resolved" && !game.revealPending && last && (
                <>
                  <div className="round-result">
                    <div>
                      <span>
                        {last.reason === "fold"
                          ? "札は、闇の中へ。"
                          : `あなた ${last.cards.human} / 番人 ${last.cards.bot}`}
                      </span>
                      <small>
                        {last.reason === "fold"
                          ? "両者の札を非公開で廃棄"
                          : "両者の札を公開"}{" "}
                        · ポット {last.pot}
                        {last.refunded.human > 0
                          ? ` / 差額${last.refunded.human}を返還`
                          : ""}
                      </small>
                    </div>
                    <b className={last.delta.human > 0 ? "positive" : ""}>
                      {last.delta.human > 0 ? "+" : ""}
                      {last.delta.human}
                    </b>
                  </div>
                  <button
                    className="button primary full"
                    disabled={game.busy || !!modal}
                    onClick={() => {
                      setCandidate(null);
                      game.humanCommand({ type: "next" });
                      if (tutorial) closeTutorial();
                    }}
                  >
                    {view.round === 13 ||
                    Math.min(view.chips.human, view.chips.bot) < 2
                      ? "対局の結果へ"
                      : "次のラウンド"}
                    <span>
                      {view.round < 13 ? "札を使い切るまで →" : "幕を閉じる →"}
                    </span>
                  </button>
                </>
              )}
              {view.phase === "finished" && (
                <>
                  <div className="final-result">
                    <span className="eyebrow">
                      {view.winner === "tie"
                        ? "A PERFECT BALANCE"
                        : view.winner === "human"
                          ? "YOU READ THE SILENCE"
                          : "THE KEEPER KNEW WHEN TO WAIT"}
                    </span>
                    <h3>
                      {view.winner === "tie"
                        ? "引き分け"
                        : view.winner === "human"
                          ? "あなたの勝利"
                          : "番人の勝利"}
                    </h3>
                    <p>
                      {view.history.length}ラウンド終了 · あなた{" "}
                      {view.chips.human} / 番人 {view.chips.bot}
                    </p>
                    <small>
                      {view.history.length < 13
                        ? "次のアンティを支払えないため対局終了"
                        : "十三枚、すべての札が卓を去った。"}
                    </small>
                  </div>
                  <div className="action-buttons">
                    <button
                      className="button outline"
                      onClick={() => setModal("history")}
                    >
                      対局を振り返る
                    </button>
                    <button className="button primary" onClick={() => start()}>
                      もう一度、卓へ
                    </button>
                  </div>
                </>
              )}
              {view.actions.length > 0 && view.phase === "betting" && (
                <p className="last-action" aria-live="polite">
                  {view.actions.at(-1)?.player === "bot" ? "番人" : "あなた"}：
                  {actionText(
                    view.actions.at(-1)!.action,
                    view.actions.at(-1)!.paid,
                  )}
                  <span>あなたの札 {view.ownCard}</span>
                </p>
              )}
            </section>
          </>
        )
      )}
      {game.notice && (
        <div className="notice" role="status">
          <span>{game.notice}</span>
          <button aria-label="通知を閉じる" onClick={() => game.setNotice("")}>
            ×
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "settings"
              ? "卓の設定"
              : modal === "rules"
                ? "この卓のルール"
                : modal === "history"
                  ? "対局の記録"
                  : "新しい対局を始める"
          }
          onClose={() => setModal(null)}
        >
          {modal === "settings" ? (
            <>
              <SettingsPanel
                settings={settings}
                setSettings={setSettings}
                inMatch={inMatch}
              />
              <button
                className="button outline full"
                onClick={() => {
                  setModal(null);
                  setTutorial(true);
                  setScreen(view ? "game" : "home");
                  if (!view || view.phase === "finished") start(true);
                }}
              >
                チュートリアルを再表示
              </button>
            </>
          ) : modal === "rules" ? (
            <Rules />
          ) : modal === "history" ? (
            <History view={view} />
          ) : (
            <>
              <p className="prose">
                現在の対局を終了して、新しい十三夜を始めます。進行中の対局には戻れません。
              </p>
              <button
                className="button primary full"
                onClick={() => start(tutorialRequest)}
              >
                新しい対局を始める
              </button>
            </>
          )}
        </Modal>
      )}
    </main>
  );
}
