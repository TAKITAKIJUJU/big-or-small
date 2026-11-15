# 静的配信とusotuki.app

2026-11-15確認。プロダクトはハンカチ落とし計時器。Reactの静的SPA／PWAで、サーバー処理・試合データの送信・外部DBはない。

## 既存資産の確認

接続済みCloudflare APIで、usotuki.appがWorker「usotuki」のproductionへ割り当て済み、compatibility_date=2026-11-14、bindings=0と確認した。既存の静的配信方式を維持する。DNS・ドメイン割当・契約プランは変更しない。アプリを置き換えても、既存ブラウザの旧保存データを勝手に削除しない。

今回の作業ブランチはcodex/handkerchief-pwa。作業中だった変更はcodex/archive-air-poker-wip-20261115へコミットして保全した。Git履歴とリポジトリ名は保持する。

## 公式資料と無料枠

確認日2026-11-15。

- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ ：静的資産へのリクエストは無料・無制限、資産保存の追加料金なし。動的Workerを起動するリクエストは別扱い。
- https://developers.cloudflare.com/workers/platform/limits/#static-assets ：Freeは20,000資産／バージョン、1ファイル25MiB。v1.3は16ファイル、合計約1.63MB、最大は内蔵時刻音声の約643KB。
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

## v1.1 音声・視認性の修正版

2026-11-15、同じ https://usotuki.app/ へ公開。試聴の独立再生・時報のHTML Audioフォールバック・出力音量改善と、白地に濃い文字のUIへ更新した。計時・判定・IndexedDBの保存形式・既存設定は維持。

- source：8e170c424c124db94ffa31b49dafc067a0788813
- build：1d0ca794f8fda98ff246b98bca09dc015da8996f
- deployment：9da5fe9556bc4a5ab224c337af77c6b5
- 前版：d2234112fbf74f208b9bbbd244936cbe
- chime.wavを含む静的10ファイルがビルドとバイト一致。assets-only、動的モジュールなし。
- 単体40件成功。公開URLで全13件のブラウザ検査が成功（24.3秒）。試聴の終了までの再生、時報OFF時の試聴、Web Audio不可時の毎分00秒再生、主要文字・ボタンのコントラスト比4.5以上を含む。

更新には全タブとPWAを閉じてから開き直す。画面下部のv1.1で確認できる。計測中の強制リロードは行わない。配信用ZIP、画面、照合JSONは /workspace/artifacts/usotuki/handkerchief-readability/ 。Android実機とスピーカーからの実際の聴取は未検証。

## v1.2 秒音・予告音・長音と内蔵時刻音声

2026-11-15、同じ https://usotuki.app/ へ公開。毎秒のチッ、57/58/59秒のピッ、00秒のポーンへ変更。00/20/40秒を7秒前から内蔵男性音声で予告し、端末の音声エンジンに依存しない。試聴は約12秒の「午前8時8分」サンプル。時報と音声はオフライン対応。

- source：0d5f8cad5d0fd805235df5b13dc1e7ae62807b40
- build：ef2926540c5c44aa0475f74ecbc378fa83311a37
- deployment：fe620b5abf974f72a40d154848382c12
- 前の検証済み版：9da5fe9556bc4a5ab224c337af77c6b5
- 静的16ファイルがビルドとバイト一致。assets-only、動的モジュールなし、bindingsなし、DNS変更なし。
- 単体43件成功。公開URLで全13件のブラウザ検査が成功（35.4秒）。試聴終了・秒単位の予告音・正しい時刻区間へのシーク・オフラインRange応答を含む。

中間deployment eecf8ae21c7347ac97b70b06d7107ebaでは、初回のCDN音声がRange非対応でHTML Audioのシークが0秒へ戻ることを発見。現在は全内蔵音声を一度読み込み、HTML AudioはローカルBlobのメタデータ準備後に再生する。PWAキャッシュも音声のRange要求へ206で応答する。

全タブとPWAを閉じて開き直し、画面下部のv1.2で確認。配信用ZIP・試聴音声・画面・照合JSONは /workspace/artifacts/usotuki/handkerchief-time-signal/ 。Android実機のスピーカーでの聴取・音量は未検証。

## v1.3 10秒ごと・女性音声・ターン間の音声復帰

2026-11-15、同じ https://usotuki.app/ へ公開。長音と時刻予告を10秒ごとへ変更し、内蔵音声をMei (normal)の女性音声へ更新した。各ターンの開始時に代替音声の再生経路を準備し直し、AudioContextが終了状態なら再作成する。復帰時には時報予約も再同期。計時・判定・保存形式は維持。

- source：007931c121276af01a5542131a544724be6d4986
- build：25dfef199ca41f618a2f650a1bb9f4b8f03684b1
- deployment：3c323445b33b431c87e3f4c2568e96bf
- 前版：fe620b5abf974f72a40d154848382c12
- 静的16ファイルがビルドとバイト一致。assets-only、動的モジュールなし、bindingsなし、DNS変更なし。
- 単体44件成功。公開URLの全15件のブラウザ検査が成功（40.8秒）。3ターン連続の時報と読み上げ、音声機能を閉じた後の2ターン目の復帰も含む。

全タブとPWAを閉じて開き直し、画面下部のv1.3で確認する。計測中の強制再読込は行わない。配信用ZIP・女性音声サンプル・画面・照合JSONは /workspace/artifacts/usotuki/handkerchief-ten-second-voice/ 。ユーザーの実機で起きた停止原因そのものとスピーカーでの聴取は未確認。

## v1.3.1 ホームでの自動再生を停止

2026-11-15、同じ https://usotuki.app/ へ公開。自動時報を対戦画面だけに限定し、画面移動で再生中・予約中の音声を停止。ホーム・設定・準備・履歴の音は明示した試聴だけ。途中で取り消した試聴の遅れた再生完了・拒否が、合成音を再開させないようにした。

- source：aef2b7eb25984b60d154a785b1db090f55dab65f
- build：399d0bbe26230b6a5efdf8950be3bc72a8692214
- deployment：4b34e5e3ca5f4d108287aa3a4372236d
- 前版：3c323445b33b431c87e3f4c2568e96bf
- 静的16ファイルがビルドと一致。assets-only、bindingsなし、DNS変更なし。
- 単体45件成功。公開URLで全17件成功（46.9秒）。Web Audio・HTML Audioそれぞれのホーム無音、試聴停止、対戦への復帰と連続3ターンを含む。

更新は試合の合間にページを再読込し、全タブ・PWAを閉じて開き直す。画面下部のv1.3.1で確認。計測中の強制再読込や保存データの削除は行わない。成果物は /workspace/artifacts/usotuki/handkerchief-home-audio-fix/ 。
