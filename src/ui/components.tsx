import {
  derive,
  LIMIT_MS,
  remaining,
  REASONS,
  seconds,
  total,
  type Match,
  type Person,
  type Score,
  type Turn,
} from "../domain/game";
export function ScoreCard({
  name,
  score,
  role,
}: {
  name: string;
  score: Score;
  role?: string;
}) {
  const consumed = Math.min(100, (score.consumedMs / LIMIT_MS) * 100),
    accumulated = Math.min(
      100 - consumed,
      (score.currentAccumulatedMs / LIMIT_MS) * 100,
    );
  return (
    <article
      className={`score-card ${total(score) >= LIMIT_MS ? "limit" : ""}`}
    >
      <div className="score-title">
        <h3>{name}</h3>
        {role && <span>{role}</span>}
      </div>
      <p className="score-label">累計臨死時間</p>
      <div className="score-total">
        <strong>{seconds(total(score))}</strong>
        <span> / 300秒</span>
      </div>
      <div
        className="gauge"
        role="meter"
        aria-label={`${name}の累計臨死時間`}
        aria-valuemin={0}
        aria-valuemax={300}
        aria-valuenow={Math.min(300, total(score) / 1000)}
      >
        <i className="consumed" style={{ width: `${consumed}%` }} />
        <i className="accumulated" style={{ width: `${accumulated}%` }} />
      </div>
      <dl className="metrics">
        <div>
          <dt>現在の蓄積</dt>
          <dd>
            {seconds(score.currentAccumulatedMs)}
            <small> 秒</small>
          </dd>
        </div>
        <div>
          <dt>消化済み</dt>
          <dd>
            {seconds(score.consumedMs)}
            <small> 秒</small>
          </dd>
        </div>
        <div>
          <dt>
            ペナルティ累計<span>（内訳）</span>
          </dt>
          <dd>
            {seconds(score.penaltyLifetimeMs)}
            <small> 秒</small>
          </dd>
        </div>
        <div>
          <dt>敗北まで残り</dt>
          <dd>
            {seconds(remaining(score))}
            <small> 秒</small>
          </dd>
        </div>
      </dl>
    </article>
  );
}
export function Timer({ elapsed }: { elapsed: number }) {
  const rest = Math.max(0, 60000 - elapsed),
    progress = rest / 60000;
  return (
    <div
      className={`timer ${rest <= 10000 ? "urgent" : ""}`}
      aria-label="60秒タイマー"
    >
      <svg viewBox="0 0 260 260" aria-hidden="true">
        <circle cx="130" cy="130" r="116" className="timer-track" />
        {Array.from({ length: 60 }, (_, i) => (
          <line
            key={i}
            x1="130"
            y1={i % 5 === 0 ? 5 : 9}
            x2="130"
            y2={i % 5 === 0 ? 18 : 15}
            transform={`rotate(${i * 6} 130 130)`}
            className={i % 5 === 0 ? "major" : ""}
          />
        ))}
        <circle
          cx="130"
          cy="130"
          r="100"
          className="timer-arc"
          pathLength="1"
          strokeDasharray={`${progress} 1`}
          transform="rotate(-90 130 130)"
        />
      </svg>
      <div className="timer-number">
        <span>このターンの残り</span>
        <strong data-testid="remaining-time">{seconds(rest)}</strong>
        <small>経過 {seconds(Math.min(60000, elapsed))} 秒</small>
      </div>
    </div>
  );
}
export function TurnDetail({ turn, match }: { turn: Turn; match: Match }) {
  return (
    <div className="turn-detail">
      <p>
        D {match.names[turn.dropper]} ／ C {match.names[turn.checker]}
      </p>
      <dl>
        <div>
          <dt>落下まで</dt>
          <dd>
            {turn.dropElapsedMs === null
              ? "記録なし"
              : `${seconds(turn.dropElapsedMs)} 秒 (${turn.dropElapsedMs}ms)`}
          </dd>
        </div>
        <div>
          <dt>チェックまで</dt>
          <dd>
            {turn.checkElapsedMs === null
              ? "記録なし"
              : `${seconds(turn.checkElapsedMs)} 秒 (${turn.checkElapsedMs}ms)`}
          </dd>
        </div>
        <div>
          <dt>蓄積の増加</dt>
          <dd>+{seconds(turn.addedMs)} 秒</dd>
        </div>
        <div>
          <dt>ペナルティ加算</dt>
          <dd>+{seconds(turn.penaltyMs)} 秒</dd>
        </div>
        <div>
          <dt>今回の消化</dt>
          <dd>{seconds(turn.consumedThisTurnMs)} 秒</dd>
        </div>
      </dl>
      <p className="formula">
        {turn.reason === "success"
          ? `${turn.checkElapsedMs} − ${turn.dropElapsedMs} = ${turn.addedMs} ms をCの蓄積へ`
          : `${turn.before[turn.subject].currentAccumulatedMs} + 60000 = ${turn.consumedThisTurnMs} ms を消化済みへ。現在の蓄積は0。`}
      </p>
      {(["A", "B"] as Person[]).map((p) => (
        <p key={p}>
          {match.names[p]}の累計：{seconds(total(turn.before[p]))} →{" "}
          <b>{seconds(total(turn.after[p]))} 秒</b>
        </p>
      ))}
      <small>
        {new Date(turn.startedAt).toLocaleString("ja-JP")} ／ ルール{" "}
        {match.rules}
      </small>
    </div>
  );
}
export function History({ match }: { match: Match }) {
  const d = derive(match);
  return (
    <>
      <div className="section-heading">
        <span>TURN LOG</span>
        <h2>全ターンの記録</h2>
      </div>
      {d.turns.length === 0 && (
        <p className="empty">確定したターンはまだありません。</p>
      )}
      {d.turns.map((t) => (
        <details className="log-row" key={t.id}>
          <summary>
            <span className="log-number">
              {String(t.number).padStart(2, "0")}
            </span>
            <div>
              <b>{REASONS[t.reason]}</b>
              <small>
                {match.names[t.subject]} ／ 蓄積 +{seconds(t.addedMs)} ／
                ペナルティ +{seconds(t.penaltyMs)}
              </small>
            </div>
            <span>＋</span>
          </summary>
          <TurnDetail turn={t} match={match} />
        </details>
      ))}
      {match.events.some((e) => e.kind !== "turn") && (
        <details className="audit">
          <summary>中断・訂正の監査履歴</summary>
          {match.events
            .filter((e) => e.kind !== "turn" || d.voids.has(e.id))
            .map((e) => (
              <p key={e.id}>
                {e.kind === "turn"
                  ? `無効化した旧記録：落下 ${e.dropElapsedMs ?? "なし"}ms／チェック ${e.checkElapsedMs ?? "なし"}ms`
                  : `${e.kind === "void" ? "直前ターン無効化" : "計測中断"}：${e.reason}`}
                <small>{new Date(e.at).toLocaleString("ja-JP")}</small>
              </p>
            ))}
        </details>
      )}
    </>
  );
}
export function Chart({ match }: { match: Match }) {
  const { turns } = derive(match),
    maximum = Math.max(
      LIMIT_MS,
      ...turns.flatMap((t) => [total(t.after.A), total(t.after.B)]),
    ),
    count = Math.max(1, turns.length);
  const points = (p: Person) =>
    `32,154 ` +
    turns
      .map(
        (t, i) =>
          `${32 + ((i + 1) / count) * 286},${154 - (total(t.after[p]) / maximum) * 130}`,
      )
      .join(" ");
  return (
    <figure className="chart">
      <figcaption>
        累計臨死時間の推移{" "}
        <span>
          <i className="key-a" /> {match.names.A} <i className="key-b" />{" "}
          {match.names.B}
        </span>
      </figcaption>
      <svg
        viewBox="0 0 340 190"
        role="img"
        aria-label="AとBの累計臨死時間の推移グラフ。詳細値は下の全ターン履歴に記載"
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <line x1="32" x2="318" y1={154 - i * 26} y2={154 - i * 26} />
            <text x="27" y={158 - i * 26} textAnchor="end">
              {Math.round(((maximum / 1000) * i) / 5)}
            </text>
          </g>
        ))}
        <polyline points={points("A")} className="line-a" />
        <polyline points={points("B")} className="line-b" />
        <text x="32" y="178">
          開始
        </text>
        <text x="318" y="178" textAnchor="end">
          第 {turns.length} ターン
        </text>
      </svg>
    </figure>
  );
}
export function Rules() {
  return (
    <div className="prose">
      <div className="section-heading">
        <span>HOW TO PLAY</span>
        <h2>実物で遊ぶ、2人の心理戦</h2>
      </div>
      <p>
        椅子とハンカチ、スマホ1台を使います。チェック側（C）は前を向いて座り、ドロップ側（D）が片手にハンカチ、もう片方にスマホを持ちます。
      </p>
      <ol>
        <li>Dが「カウント開始」を押すと即60秒計測が始まります。</li>
        <li>ハンカチを落とした瞬間にDが「落下」を押します。</li>
        <li>
          Cが振り向いた瞬間に、Dが「チェック」を押します。Cはスマホに触りません。
        </li>
        <li>
          結果を確認し、D/Cを交代。次のDが準備できたら開始します。休憩は無制限、強制の待ち時間はありません。
        </li>
      </ol>
      <h3>4つの値を区別します</h3>
      <dl>
        <dt>現在の蓄積（座視の際）</dt>
        <dd>チェック成功で増える未消化の時間。</dd>
        <dt>消化済み時間</dt>
        <dd>失敗時、蓄積に60秒を加えて移す先。</dd>
        <dt>ペナルティ累計</dt>
        <dd>60秒ペナルティの分析用内訳。消化済みに含まれます。</dd>
        <dt>累計臨死時間</dt>
        <dd>
          現在の蓄積＋消化済み。ペナルティをさらに足しません。300秒以上で敗北です。
        </dd>
      </dl>
      <h3>成功と失敗</h3>
      <p>
        落下12.40秒 →
        チェック19.80秒なら、Cに7.40秒蓄積。落下より前、または同じミリ秒でチェックするとC失敗です。
      </p>
      <p>
        蓄積90秒のCが失敗した場合、ペナルティ60秒、消化済み150秒、蓄積0秒、累計150秒になります。元の90秒を再び加算しません。
      </p>
      <p>
        60.000秒に達したら終了。未落下ならDだけに60秒ペナルティ。落下済みで未チェックならCだけに60秒ペナルティです。60秒以降の操作は受理しません。
      </p>
      <h3>参考にした発想と独自の変更</h3>
      <p>
        『嘘喰い』の蓄積と消化、毎分時報の発想を参考にしています。原作の蓄積5分での全量注入と、このアプリの「過去の消化済みを含む累計5分で敗北」は別の仕組みです。
      </p>
      <p>
        累計300秒での即敗北（成功時も含む）、時間切れの60秒ペナルティ、無制限ターン、中断時の無効化は本アプリの独自ルールです。薬・注射・蘇生の動作は行いません。
      </p>
      <h3>計測の限界</h3>
      <p>
        物理的な落下や振り向きから、Dが押すまでの反応遅れはなくせません。友人同士で合意して使ってください。カメラ・マイクで自動判定はしません。
      </p>
      <p>
        画面ロック・非表示・再読込中の正確な継続は保証できないため、そのターンを無効にします。時報は端末の毎分00秒を基準にしますが、音量・マナーモード・ブラウザの遅延の影響を受けます。厳密な音の同期は保証しません。
      </p>
      <p>
        記録は端末のIndexedDBだけへ保存し、サーバーへ送りません。ブラウザのデータ消去で記録も失われるため、JSONを書き出して保管できます。
      </p>
    </div>
  );
}
