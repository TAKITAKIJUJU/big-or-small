# 静的配信とusotuki.app

2026-11-15確認。プロダクトはハンカチ落とし計時器。Reactの静的SPA／PWAで、サーバー処理・試合データの送信・外部DBはない。

## 既存資産の確認

接続済みCloudflare APIで、usotuki.appがWorker「usotuki」のproductionへ割り当て済み、compatibility_date=2026-11-14、bindings=0と確認した。既存の静的配信方式を維持する。DNS・ドメイン割当・契約プランは変更しない。アプリを置き換えても、既存ブラウザの旧保存データを勝手に削除しない。

今回の作業ブランチはcodex/handkerchief-pwa。作業中だった変更はcodex/archive-air-poker-wip-20261115へコミットして保全した。Git履歴とリポジトリ名は保持する。

## 公式資料と無料枠

確認日2026-11-15。

- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ ：静的資産へのリクエストは無料・無制限、資産保存の追加料金なし。動的Workerを起動するリクエストは別扱い。
- https://developers.cloudflare.com/workers/platform/limits/#static-assets ：Freeは20,000資産／バージョン、1ファイル25MiB。今回のビルドは9ファイル、最大のJSも約264KB。
- https://developers.cloudflare.com/workers/platform/pricing/ ：Worker Cacheを有効にすると静的配信でも別のリクエスト課金条件があるため、既存同様無効を維持する。
- https://developers.cloudflare.com/changelog/post/2026-11-11-static-assets-base-path/ ：新規構成はcf CLI、既存は利用中の方式を維持するという現行の案内を確認。
- https://developers.cloudflare.com/cf/ ：CLIを新規利用する場合の公式入口。今回は認証済みの既存API連携で静的資産を送るため、CLIを追加して認証方式を混在させない。別環境で手動実行する場合は公式のログイン／プロジェクト手順を先に確認する。

資産のみ、run_worker_first=false、bindingsなし、動的JSモジュールなし、Worker Cache無効。Cloudflare側のWorkerとブラウザ内のService Workerは別物。PWAのオフラインキャッシュは端末内で動く。

## ビルドと配信

npm ci → npm run typecheck → npm run lint → npm test → npm run build → npm run test:e2e。

dist/の内容だけを公開する。Service Workerはルート/sw.js、manifestは/manifest.webmanifest。sw.jsをSPA用HTMLへフォールバックさせないよう、実ファイルとContent-Typeを確認する。全ファイルのハッシュ・サイズから資産manifestを作り、既存APIのassets-upload-sessionと静的アップロードで更新する。認証情報はメモリと非表示stdinだけに渡し、ソース・ログ・テキストへ保存しない。

公開URLのHTML・JS・CSS・アイコン・manifest・Service Worker・ライセンスがビルドと一致することを照合し、公開URLで主要ブラウザ検査を行う。公開コミットとdeployment IDはdeployment/production.jsonに記録する。

Service WorkerにはskipWaitingを入れない。更新データの取得後、全画面を閉じて開き直すと次の版へ切り替わる。計測中に強制リロードしない。資産は静的な同一内容なので、オフライン読込でVaryヘッダーの差によりキャッシュが外れないようにする。

## 公開結果

2026-11-15、上記の既存設定を確認後に同じ https://usotuki.app/ へ公開した。DNS変更なし。

- source：0a3cca56618ad6c662423eaa59ef171a621a98d4（codex/handkerchief-pwa）
- build：e1b2d7de67768d1504408480300c41d1457b4c91（codex/usotuki-static-release）
- deployment：d2234112fbf74f208b9bbbd244936cbe
- 静的9ファイルが配信とバイト一致。assets-only、動的モジュールなし、bindingsなし、Worker Cache無効。
- 公開URLの全11件のブラウザ検査が成功（28.8秒）。計測・集計・終了・無効化・中断復元・オフライン再起動・時報試聴操作・保存失敗・別タブ競合を含む。

初回公開ではCloudflareの/index.html→/という正規化で、キャッシュ内HTMLがリダイレクト済みResponseとなり、再ナビゲーション時にブラウザが拒否した。HTMLを最初から/で取得・保存する方式へ修正し、ソース0a3cca5の全11件が公開URLで成功。中間deployment 5d639477d6d34b0bb902bdaa0f034577はこの修正前の版。

配信用ZIP、画面、資産照合JSONは /workspace/artifacts/usotuki/handkerchief/ 。Android実機未検証。
