# USOTUKI — BIG or SMALL

**プレイ：https://usotuki.app/**

一枚のカードで読み合う、縦画面専用の3D対戦ゲーム。普通の人間のNPCとテーブルを挟んで対戦します。1〜13の札を使い切る13ラウンドのローカルBot戦です。React、TypeScript、Vite、Three.js、React Three Fiberで実装。オンラインAPIや課金はありません。

## 起動

Node.js 22.12以上を推奨（開発環境は24.22.1）。

```sh
npm ci
npm run dev
```

Viteが表示するURLを同じ環境のブラウザで開きます（通常 `http://localhost:5173`）。Androidから使う場合は仮想環境の正規プレビュー転送、または承認後の静的ホスティングが必要です。スマホ自身のlocalhostからクラウド環境には接続できません。

```sh
npm run typecheck
npm run lint
npm run test
npm run build
npm run preview
```

本番ビルドは `dist/`。直接index.htmlをfile://で開かず、HTTPで配信してください。

## 遊び方

1. 「対戦をはじめる」。先にBIG／SMALLを公開。その条件を見て、卓上の一枚または数字ボタンから札を選んで伏せます。
2. BIGなら大きい札、SMALLなら小さい札が勝ち。双方の選札後にチェック／ベット／コール／レイズ／フォールド。
3. 札を公開してポットを精算。降りた場合は双方の札を非公開で廃棄。
4. 参加料は毎回2→4→6→…→80、全回で有効スタックまで賭けられます。同数は追加分を返し、参加料を次へ持ち越し。最後にチップが多ければ勝利。

初回は実操作チュートリアル。設定は3難易度、速度、画質、動きの軽減、音量、ミュート、終了後の開示。設定と試合はブラウザへ保存。WebGL障害時も同じルールで軽量モードへ切り替わります。

## 設計・検証

- [要件](docs/requirements.md) / [詳細ルール・端数例](docs/game-rules.md)
- [アーキテクチャ・Bot情報境界](docs/architecture.md)
- [美術](docs/art-direction.md) / [UX](docs/ux-flow.md)
- [テストと制約](docs/testing.md)
- [Cloudflareでの公開手順・無料枠](docs/deployment.md)
- [将来のオンライン設計](docs/online-future.md)
- [ライセンス](THIRD_PARTY_NOTICES.md)

Android実機未検証。実機30fpsや1,000部屋のオンライン性能を保証しません。usotuki.appへの初回公開とドメイン接続は明示承認を受けて実施済みです。

画面はPCでも最大480pxの縦型です。スマホの横向きでは縦向きへの案内を表示し、自動進行を停止します。

参加料上昇は新しい対戦から適用。途中の旧試合は旧ルールで再開します。[参加料と逆転幅](docs/balance.md)も参照してください。

新ルールではNPCも公開されたBIG／SMALLを見て選札します。上級NPCは、公開情報の札候補を保ち、チェックから再レイズまで128回の反復計算で比較します。強い札と弱いブラフを混ぜ、相手の降り方や見せた札へ適応。抽選後公開だった旧pressureルールでは、旧上級との400戦で241勝・2分・157敗でした（新ルールの勝率測定ではありません）。新規設定は上級、以前の設定は引き継ぎます。試合後に判断を振り返れます。[NPCの戦略・比較方法・限界](docs/npc-strategy.md)を参照。
