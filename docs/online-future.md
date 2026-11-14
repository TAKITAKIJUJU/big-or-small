# 将来のオンライン対戦（設計のみ）

確認日：2026-11-14。本版にはサーバー・部屋・WebSocketを実装しない。Cloudflareリソースも作成しない。

## サーバーの権威

Workersを参加入口にし、暗号学的に十分長いroomIdごとにSQLite-backed Durable Objectを1つ割り当てる。全試合を1つのグローバルDOで処理しない。DOがGameState、選札、乱数、チップ、合法手、タイマーを所有し、プレイヤーごとにPlayerViewだけをWebSocketで送信する。

ブラウザのセッション記録はオンラインに持ち込まない。`playerId` は認証された接続から解決し、クライアント指定のplayerを信用しない。全入力をスキーマ検証し、commandIdで重複排除、expectedRevisionで競合を拒否。コマンド・状態・revisionをトランザクションで確定後に配信する。

再接続用には十分長い別トークンを使い、ハッシュで保存。有効期限・失効・ローテーションを定義し、URLやログに長期秘密を残さない。再接続はPlayerViewとrevisionを同期する。切断猶予、選札/行動タイムアウト、既定のCHECK/FOLD、放置終了、期限アラームをサーバーで管理。

WebSocket Hibernation APIの`acceptWebSocket`と接続attachmentを用い、休止後も接続権限と部屋情報を復元する。常設setIntervalは避ける。保存された期限をアラームで処理する。アイドルでも絶対に無料とは見積もらず、メッセージ・起床・保存の課金を個別計測。

## 4桁番号

0000〜9999は発見用のコードであり認証ではない。最大10,000の同時割当なので、それ以上のアクティブ部屋は識別できない。

- roomIdは128bit以上の乱数。参加・再開トークンはさらに独立した秘密とする。
- 4桁コードのleaseを原子的に確保する。衝突時に有限回再試行、期限後は再利用。コード単位の一意性を保証する管理ストレージを使う。
- シャードごとにコード領域を分割して原子的割当を行い、ランダムにシャードを選ぶ。1つの採番DOへ全世界の要求を集中させない。空き容量や偏りの監視、再配分時の重複防止も必要。
- 入場前にホスト承認と短期参加トークンを要求。コードを知るだけで秘密情報や手札を返さない。
- IP/セッション/部屋別に試行を制限し、総当たり、連続乱入、部屋列挙を防ぐ。ホストへ拒否・閉鎖・期限延長を提供。
- 枯渇時は明確に新規発行を止め、URL招待へ案内。6桁へ拡張すると100万通りになるが、認証の代わりにはならない。
- コードのlease期限と部屋の期限を区別。TTLだけに依存せず期限を必ず読取時にも検証。退出・アラーム後に履歴、トークン、コード割当を削除。

## 検証計画

まず100同時部屋・200接続でコマンド、再接続、抽選の独立性、他人の秘密情報が通信に含まれないことを検証。次に1,000同時部屋以上でp50/p95/p99遅延、CPU、DO起床時間、SQLite読書き、メッセージ数、再接続集中を計測。4桁衝突・9,999/10,000割当・枯渇・期限境界・シャード障害も試す。

この負荷は未実施。無料枠だけで1,000部屋を運用できる、あるいは無制限に遊べると保証しない。実装・負荷試験・リソース作成は別途承認後。

公式資料（2026-11-14参照）:

- https://developers.cloudflare.com/durable-objects/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
