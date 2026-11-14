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

1. 「対戦をはじめる」。卓上の一枚、または下の数字ボタンからカードを選び、「この札を伏せる」で確定。
2. BIGなら大きい札、SMALLなら小さい札が勝ち。判定後にチェック／ベット／コール／レイズ／フォールド。
3. 札を公開してポットを精算。降りた場合は双方の札を非公開で廃棄。
4. 参加料は毎回2→4→6→…→80、追加上限も増えます。最終回は有効スタックまでの全額勝負。最後にチップが多ければ勝利。

初回は実操作チュートリアル。設定は3難易度、速度、画質、動きの軽減、音量、ミュート、次回から全ラウンドの全額勝負、終了後の開示。設定と試合はブラウザへ保存。WebGL障害時も同じルールで軽量モードへ切り替わります。

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

上級NPCは、公開されたブラフ・降り方・賭ける額を読む戦略に更新。全額ベットにも強い札と弱いブラフの両方を見積もり、札の温存・誘い・コールを比較します。試合後の履歴で判断を振り返れます。[NPCの戦略と限界](docs/npc-strategy.md)を参照。
