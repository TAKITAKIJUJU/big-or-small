# ビルドとCloudflare公開手順

確認日：2026-11-14。ユーザーの明示承認を受け、本番へ公開済み。

## 公開中のURL

**https://usotuki.app/**

Cloudflare Worker `usotuki` のStatic Assetsのみで配信する。動的コードなし（API確認で`has_modules: false`）、bindingsなし、Worker Cacheなし、`run_worker_first: false`。プラン変更、DB、Durable Objects、課金APIは追加していない。

検証済みビルドの7ファイルを公式のDirect Uploads APIでアップロードし、Custom Domainを接続。Cloudflareが管理するプロキシ付きAAAAレコードが作成された。HTTPS 200と全アセットのバイト一致、公開URLでの3D表示・13ラウンド完走・履歴・再戦を確認済み。

初回公開のソースは`3de022c`、配信ファイルは既存リポジトリの`codex/usotuki-static-release`ブランチ、コミット`94e8849d2010880df2726266dcc5c66d8961a294`に保存。秘密を含まない配信記録は`deployment/production.json`。

接続済みCloudflareツールを利用できたため、CLIへの認証情報の受け渡しは行わず公式APIを使用した。アセット用の短期JWTはメモリと非表示の標準入力でのみ扱い、ソース・ファイル・出力ログへ保存していない。

公式API手順：https://developers.cloudflare.com/workers/static-assets/direct-upload/

## 今の成果物とプレビュー

`npm ci && npm run build` で `dist/` を生成する。Bot、描画、音、保存はブラウザ内だけで動作し、Workerの動的コード、DB、WebSocketは不要。

仮想環境内では `npm run dev`、ビルド確認は `npm run preview`。標準のVite URLは同じ仮想環境のブラウザ専用。スマホ自身のlocalhostからは届かない。Android版Codexの正規プレビュー転送が利用できる場合に開く。今回のSitesプレビューは `relay could not open browser port 4173: timed out waiting for relay readiness` で失敗。外向きのプレビューURLは発行されていない。

Playwrightは独立したローカルのテスト用サーバーを立ち上げ、仮想環境内Chromiumで検査する。これは公開・スマホ向け転送ではない。

## ドメインの確認結果

接続済みCloudflare APIの読取専用検査：

- `usotuki.app` のZoneは `active`。
- ネームサーバーは `byron.ns.cloudflare.com` と `noor.ns.cloudflare.com`。
- SSL verificationは `certificate_status: active`、ワイルドカードのUniversal証明書。
- 公開前のルートDNSは0件。公開時にCustom Domainが管理するプロキシ付きAAAAレコードを作成。
- HTTPS配信と仮想環境Chromiumの対戦開始は確認済み。Android実機は未検証。

別ドメインや別リポジトリへは公開しない。

## CLIで更新する場合の参考手順（今回の公開は上記API経由）

新規Cloudflare設定なので公式推奨の `cf` を選ぶ。既存Wrangler設定はない。2026-11-14時点で npm の `cf` は `1.0.0-beta.32`。betaの設定を想像して追加せず、CLIの自動構成をレビューして導入する。現在のアプリはViteだけでビルドでき、Cloudflare CLIを起動依存にしない。

1. 公開作業時に `npm exec --package=cf@1.0.0-beta.32 -- cf init .` で既存プロジェクトを設定する。これは既存ソースを変更し得るため、専用ブランチで差分を確認する。新リポジトリは作らない。
2. 最新の `cf` とCloudflare Vite plugin 2.0 betaの公式手順を再確認。静的アセットのみのビルドを選び、動的entrypoint、リソースbindings、Workers Cacheを追加しない。`cloudflare.config.ts` の `worker.name` は `usotuki`、compatibilityDateはその作業日。
3. **`cloudflare.config.ts` に `assets.directory` は存在しない。** Vite構成ではViteのクライアント出力が配信ソース。`worker.assets` は実行時ルーティングの設定のみ。`runWorkerFirst` はfalse（既定のアセット優先）。CloudflareのWorkerキャッシュ機能も有効化しない。
4. `npm run typecheck && npm run lint && npm run test && npm run build` を通す。`cf build` はpackage.jsonのbuildスクリプト自体を実行しないので型検査等を別途行う。
5. `cf build` または `cf deploy --dry-run` で `.cloudflare/output/v0/` をローカル検証。公式資料ではdry-runはAPI送信・資格情報不要。今回、このCloudflareビルド／dry-runは未実行で、Vite製品ビルドまで検証済み。
6. 検証済み差分、対象アカウント、Worker名、静的ルーティング、無料プラン、ドメイン追加内容を提示し、**本番公開の承認を得る**。
7. 承認後に `cf auth login` など環境内の安全な接続を使用。APIトークンをチャット・ソース・コマンド引数・ログへ書かない。`cf deploy --prebuilt --mode production` で検証済みのビルドを配信する。自動構成や新規bindingsでリソースを作らないことを再確認。
8. `usotuki.app` をCustom Domainとして接続する操作と、そのDNS変更を別途承認対象として実行する。既存レコードがあれば削除せず影響を確認。公開後にDNS、HTTPS、キャッシュ、再読込、13ラウンドを確認する。

GitHubの自動ビルド連携は未設定。導入時は既存 `TAKITAKIJUJU/big-or-small` だけの最小権限、利用プラン、ブランチ条件、ビルド上限を確認する。リポジトリの公開設定・アカウント権限は変更しない。

## 無料枠と出典

以下は公式ドキュメントを2026-11-14に確認した値。アカウント全体の既存使用量と実際の契約は別途確認する。

| 項目                        | 無料枠・注意                                             | 出典                                                                             |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Workers Static Assets       | 静的リクエストは無料・無制限、アセット保管の追加料金なし | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ |
| 静的ファイル                | Freeは20,000ファイル/Worker version、1ファイル25MiB      | https://developers.cloudflare.com/workers/platform/limits/                       |
| Worker動的処理              | Free 100,000リクエスト/日、10ms CPU/回                   | https://developers.cloudflare.com/workers/platform/pricing/                      |
| Workers Builds              | Freeは3,000分/月、同時ビルド1、20分/回のtimeout          | https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/       |
| Durable Objects（将来のみ） | SQLiteのみFree対応、100,000 requests/日、13,000 GB-s/日  | https://developers.cloudflare.com/durable-objects/platform/pricing/              |
| DO SQLite（将来のみ）       | 500万読取行/日、10万書込行/日、合計5GB保管               | 同上                                                                             |

静的配信が無料でも、`runWorkerFirst` でWorkerを通すと別枠。Worker Cacheを有効化すると通常無料の静的リクエストもWorker料金の対象になる。初期版はどちらも必要ない。DOやオンラインを無料・無制限と説明しない。Paidへの変更や使用量課金につながるリソース作成は承認なしでは行わない。

公式CLI資料：

- https://developers.cloudflare.com/cf/agents/
- https://developers.cloudflare.com/cf/projects/
- https://developers.cloudflare.com/cf/projects/cloudflare-config/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/cache/

公開直前に上記ページとDashboardのプラン・使用量を再確認する。

## 参加料上昇版の公開更新

2026-11-14、同じWorkerとドメインへ更新。ソース`6b4edec`、静的ビルド`6793c8c`、deployment `d0762116f262401f9595904e846f46d7`。最新の配信記録とハッシュはdeployment/production.jsonを参照。

新しい対戦は参加料2〜80、追加上限も上昇、最終回は有効スタック。旧セーブはclassicで維持。更新後の7アセットは配信データとビルドのバイト一致を確認した。本番URLで13回完走・参加料2→4・160対440から320対280の逆転・0で途中終了の4件を実操作で確認して成功。

新規リソース作成、DNS変更、プラン変更はなく、静的配信のみを更新した。Android実機は未検証。
