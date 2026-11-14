import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { actionText, type BetAction, type PlayerView } from "./game/engine";
import { ANTES, BET_LIMITS } from "./game/stakes";
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
        <span className="eyebrow">USOTUKI</span>
        <button className="icon-button" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      <h2>{title}</h2>
      {children}
      <button className="button outline full" onClick={onClose}>
        戻る
      </button>
    </dialog>
  );
}
function Rules() {
  return (
    <div className="prose">
      <p>
        13枚を一度ずつ使い、最後に多くのチップを残した方の勝ちです。参加料も賭けられる額も、ラウンドが進むほど上がります。
      </p>
      <ol>
        <li>
          双方が参加料を出します。支払った分はポットに入り、勝者が受け取ります。
        </li>
        <li>カードを1枚ずつ伏せて確定。NPCも抽選前に確定します。</li>
        <li>
          BIGなら大きい数字、SMALLなら小さい数字が勝ち。毎回50%ずつの独立抽選です。
        </li>
        <li>
          抽選後に賭ける額を決めます。双方チェック、またはコールでカードを公開。
        </li>
        <li>降りたらポットを譲り、両方のカードを非公開で使い終えます。</li>
      </ol>
      <table className="stakes-table" aria-label="参加料と追加上限">
        <thead>
          <tr>
            <th>回</th>
            <th>参加料 / 人</th>
            <th>追加上限 / 人</th>
          </tr>
        </thead>
        <tbody>
          {ANTES.map((fee, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{fee}</td>
              <td>{BET_LIMITS[i] ?? "有効スタック"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        参加料に足りない場合は、少ない側の残額を双方が出して最後の勝負に参加します。参加料だけで全額になったら、選札・抽選後に自動で公開します。どちらかの所持チップが0になるか、13回で終了です。
      </p>
      <dl>
        <dt>チェック</dt>
        <dd>追加で賭けずに手番を渡す。</dd>
        <dt>ベット</dt>
        <dd>追加でチップを賭け始める。</dd>
        <dt>コール</dt>
        <dd>相手と同じ合計額まで出す。</dd>
        <dt>レイズ</dt>
        <dd>相手の額に上乗せする。双方で合計2回まで。</dd>
        <dt>フォールド</dt>
        <dd>降りてポットを譲る。カードは非公開。</dd>
      </dl>
      <p>
        追加額は原則2刻み。相手が払える額が上限です。残額の端数だけ例外で、受けられなかった差額は返します。同数の札はポットを半分ずつ受け取ります。
      </p>
      <p>
        最終回は有効スタックまで賭けられます。設定で「全ラウンドで全額勝負」をONにすると、最初からこの制限になります。「最大」は額を選ぶ操作で、ベット／レイズを押すまでチップは出ません。
      </p>
      <small>
        古い保存試合は参加料2・追加上限20の旧ルールを維持します。新しい対戦から参加料上昇が適用されます。チップはゲーム内だけの数値で、現実のお金・課金・換金・賞金はありません。
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
        NPCの難易度
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
        全ラウンドで全額勝負（次の対戦から）
        <input
          type="checkbox"
          checked={settings.allIn}
          onChange={(e) => update("allIn", e.target.checked)}
        />
      </label>
      {inMatch && <small>進行中の対戦の上限は変更されません。</small>}
      <label className="toggle">
        試合終了後に全カードを開示
        <input
          type="checkbox"
          checked={settings.reveal}
          onChange={(e) => update("reveal", e.target.checked)}
        />
      </label>
      <small>対戦中、フォールドされた相手の札は履歴にも表示されません。</small>
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
            <span>NPC</span>
            <span>増減</span>
          </div>
          {view.history.map((r) => (
            <div className="history-row" key={r.round}>
              <span>
                <b>{String(r.round).padStart(2, "0")}</b>{" "}
                <small>
                  {r.mode}
                  <span className="history-fee">参加料 {r.ante}</span>
                </small>
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
              <h3>対戦の振り返り</h3>
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
                          : "NPCのブラフが成功。"
                        : "降りた札を振り返る。"}{" "}
                      あなた {r.cards.human} / NPC {r.cards.bot}
                    </p>
                  );
                })}
              <small>
                公開後の札による振り返りです。対戦中のBotは相手の札を参照しません。
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
          自分の札 <b>{view.ownCard}</b> · 追加 {view.contributions.human}
        </span>
        <span>
          NPC <b>{view.contributions.bot}</b> / 上限{" "}
          {view.betLimit ?? "有効スタック"}
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
      {increases.length > 0 && (
        <>
          <div className="bet-presets" role="group" aria-label="ベット額の候補">
            {[
              { label: "最小", value: amounts[0] },
              {
                label: "半分",
                value: amounts[Math.floor((amounts.length - 1) / 2)],
              },
              {
                label: total === amounts.at(-1) ? "最大を選択中" : "最大",
                value: amounts.at(-1)!,
              },
            ].map((preset, i) => (
              <button
                key={i}
                disabled={busy}
                aria-pressed={total === preset.value}
                onClick={() => setAmount(preset.value)}
              >
                {preset.label}
                <b>{preset.value}</b>
              </button>
            ))}
          </div>
          <p className="stake-risk">
            この額で双方が勝負したら{" "}
            <b>
              勝ち +{view.ante + total} / 負け −{view.ante + total}
            </b>
          </p>
        </>
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
    [reducedOS, setReducedOS] = useState(false),
    [landscape, setLandscape] = useState(false);
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
    const query = matchMedia(
      "(orientation: landscape) and (max-height: 600px) and (pointer: coarse)",
    );
    const update = () => setLandscape(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (landscape) setModal(null);
  }, [landscape]);
  useEffect(() => {
    if (
      screen !== "game" ||
      modal ||
      landscape ||
      (!autoStep && !game.revealPending)
    )
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
    landscape,
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
      ? "BIG / SMALL を抽選中"
      : view.phase === "selecting"
        ? "カードを1枚選ぶ"
        : view.phase === "drawing"
          ? "カードを確定しました"
          : view.phase === "betting"
            ? view.turn === "human"
              ? "あなたの手番"
              : "NPCが考えています…"
            : view.phase === "resolved"
              ? last?.winner === "tie"
                ? "このラウンドは引き分け"
                : last?.winner === "human"
                  ? "このラウンドはあなたの勝ち"
                  : "このラウンドはNPCの勝ち"
              : "対戦終了";
  const tutorialText =
    view?.phase === "selecting"
      ? "数字を選んで、カードを伏せます。選んだカードは一度だけ使えます。"
      : view?.phase === "drawing"
        ? "BIGは大きい数字、SMALLは小さい数字の勝ちです。"
        : view?.phase === "betting"
          ? "チェックは追加なし。相手が賭けたら、同額を出すか、増やすか、降りるかを選びます。"
          : "公開されたカードで勝敗を判定します。降りたときは両方のカードを伏せたまま使い終えます。";
  return (
    <>
      <main
        inert={landscape}
        className={`app ${screen === "home" ? "is-home" : ""} ${settings.reduced || reducedOS ? "reduce-motion" : ""}`}
      >
        <Suspense fallback={<div className="scene-loading">読み込み中…</div>}>
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
            paused={landscape}
            onFallback={() => setFallback(true)}
          />
        </Suspense>
        {screen === "home" ? (
          <>
            <header className="home-header">
              <a href="#" className="wordmark" aria-label="USOTUKI ホーム">
                USOTUKI
              </a>

              <button
                className="icon-button"
                aria-label="設定"
                onClick={() => setModal("settings")}
              >
                <Icon kind="settings" />
              </button>
            </header>
            <section className="home-title">
              <span className="eyebrow">BIG or SMALL</span>
              <h1>{GAME_NAME}</h1>
              <p>一枚選んで、相手の判断を読む。</p>
            </section>
            <section className="home-menu">
              <div className="menu-note">参加料 2 → 80 · 13ラウンド</div>
              {inMatch && (
                <button
                  className="button primary full"
                  onClick={() => {
                    unlockAudio();
                    setScreen("game");
                  }}
                >
                  対戦を再開<span>第 {view?.round} 回 →</span>
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
                {inMatch ? "新しい対戦" : "対戦をはじめる"}
                <span>{DIFFICULTY[settings.difficulty]} →</span>
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
                <span>1人プレイ</span>
                <span>設定は対戦中も変更できます</span>
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
                  <span className="back-arrow">←</span>
                </button>
                <div className="round-counter">
                  <span>ラウンド</span>
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
                    aria-label="対戦履歴"
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
                  <span>あなた</span>
                  <b>{view.chips.human}</b>
                </div>
                <div className="pot">
                  <span>ポット</span>
                  <b>{view.pot}</b>
                </div>
                <div className="opponent-score">
                  <span>NPC · {DIFFICULTY[settings.difficulty]}</span>
                  <b>{view.chips.bot}</b>
                </div>
              </div>
              <div className="table-caption">
                <span
                  className={`mode-badge ${game.revealPending ? "drawing" : ""}`}
                >
                  {view.mode ??
                    (view.phase === "drawing" ? "抽選中" : "BIG / SMALL")}
                  {view.mode && (
                    <small>
                      {view.mode === "BIG" ? "大きい数字" : "小さい数字"}
                    </small>
                  )}
                </span>
                <span className="ante-status">
                  参加料 <b>{view.ante}</b>
                  {view.nextScheduledAnte !== null && (
                    <> → 次 {view.nextScheduledAnte}</>
                  )}
                  {view.ante < view.scheduledAnte && (
                    <small>規定 {view.scheduledAnte} · 残額で参加</small>
                  )}
                </span>
              </div>
              <div
                className="scene-tools"
                hidden={
                  view.phase === "betting" &&
                  view.turn === "human" &&
                  !game.revealPending
                }
              >
                <span>
                  {fallback ? "軽量表示 · " : ""}
                  {view.ruleset === "classic" ? "旧ルール · " : ""}追加上限{" "}
                  {view.betLimit ?? "有効スタック"}
                </span>
                <button
                  onClick={() => {
                    setSnap((n) => n + 1);
                    if (game.revealPending) game.completeReveal();
                    else if (autoStep && !modal) game.step(revision);
                  }}
                >
                  スキップ →
                </button>
              </div>
              <section
                className={`control-panel ${view.phase === "finished" ? "end-panel" : ""}`}
                aria-label="対戦操作"
              >
                {view.ruleset === "classic" && (
                  <p className="legacy-note">
                    旧ルールで再開中。新しい対戦から参加料が上がります。
                  </p>
                )}
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
                        残りのカード <small>{view.hand.length} 枚</small>
                      </span>
                      <span>
                        {chosen ? `選択中：${candidate}` : "横にスクロール"}
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
                          disabled={
                            view.ownCard !== null || game.busy || !!modal
                          }
                          onClick={() => {
                            unlockAudio();
                            setCandidate(c);
                          }}
                        >
                          {c}
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
                        NPCの手番
                        <small>
                          あなたの札：{view.ownCard} / {view.mode} / 追加拠出：
                          {view.contributions.human}
                        </small>
                      </p>
                    </div>
                  ))}
                {view.phase === "resolved" && !game.revealPending && last && (
                  <>
                    {view.chips.human - last.delta.human <
                      view.chips.bot - last.delta.bot &&
                      view.chips.human > view.chips.bot && (
                        <p className="comeback-label">この勝負で逆転</p>
                      )}
                    <div className="round-result">
                      <div>
                        <span>
                          {last.reason === "fold"
                            ? "フォールドで決着"
                            : `あなた ${last.cards.human} / NPC ${last.cards.bot}`}
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
                      {!view.canContinue ? "対戦の結果へ" : "次のラウンド"}
                      <span>
                        {view.canContinue
                          ? `次は参加料 ${view.nextAnte}${view.nextAnte !== view.nextScheduledAnte ? `（規定${view.nextScheduledAnte}）` : ""} →`
                          : "結果へ →"}
                      </span>
                    </button>
                  </>
                )}
                {view.phase === "finished" && (
                  <>
                    <div className="final-result">
                      <h3>
                        {view.winner === "tie"
                          ? "引き分け"
                          : view.winner === "human"
                            ? "あなたの勝利"
                            : "NPCの勝利"}
                      </h3>
                      <p>
                        {view.history.length}ラウンド終了 · あなた{" "}
                        {view.chips.human} / NPC {view.chips.bot}
                      </p>
                      <small>
                        {view.history.length < 13
                          ? view.ruleset === "classic"
                            ? "次の参加料を払えないため対戦終了"
                            : "所持チップが0になったため対戦終了"
                          : "すべてのカードを使い終えました。"}
                      </small>
                    </div>
                    <div className="action-buttons">
                      <button
                        className="button outline"
                        onClick={() => setModal("history")}
                      >
                        対戦を振り返る
                      </button>
                      <button
                        className="button primary"
                        onClick={() => start()}
                      >
                        もう一度対戦する
                      </button>
                    </div>
                  </>
                )}
                {view.actions.length > 0 && view.phase === "betting" && (
                  <p className="last-action" aria-live="polite">
                    {view.actions.at(-1)?.player === "bot" ? "NPC" : "あなた"}：
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
            <button
              aria-label="通知を閉じる"
              onClick={() => game.setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {modal && (
          <Modal
            title={
              modal === "settings"
                ? "設定"
                : modal === "rules"
                  ? "ルール"
                  : modal === "history"
                    ? "対戦の記録"
                    : "新しい対戦を始める"
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
                  現在の対戦を終了して、新しい対戦を始めます。
                </p>
                <button
                  className="button primary full"
                  onClick={() => start(tutorialRequest)}
                >
                  新しい対戦を始める
                </button>
              </>
            )}
          </Modal>
        )}
      </main>
      <aside className="orientation-notice" role="status" hidden={!landscape}>
        <svg
          viewBox="0 0 48 64"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="10" y="4" width="28" height="54" rx="5" />
          <path d="M20 51h8" />
        </svg>
        <h2>縦向きにしてください</h2>
        <p>このゲームは縦画面でプレイします。</p>
      </aside>
    </>
  );
}
