# USOTUKI 初期版の要件

2026-11-14。対象リポジトリは TAKITAKIJUJU/big-or-small。既存は README と .gitignore のみ。ブランチ `codex/usotuki-3d-bot` で実装する。

- プレイヤー1人とローカルBot。通信、登録、広告、課金、外部AI APIなし。
- React / TypeScript strict / Vite / Three.js / React Three Fiber。drei、物理エンジン、外部3D素材は不要と判断。
- 13ラウンド、1〜13各一枚、300チップずつ。純粋エンジンで合法手を一元化。
- 通常体験はWebGLの実際の3D空間。DOMは情報・入力の補助。GPU障害時のみ操作可能な軽量モード。
- 日本語UI、44px前後のタッチ領域、縦画面、キーボード、Reduced Motion。
- 設定とコマンド履歴をバージョン付き保存。再開時に履歴全体をエンジンで検証。
- 本番公開、DNS、GitHub公開設定、アカウント変更、有料リソース作成は行わない。

初期版に含めないもの：オンライン対戦、4桁招待UI、サーバー、DB、WebSocket、ユーザー認証。将来設計は online-future.md に限定する。

受入れ検証と実測の範囲は testing.md を参照。Android実機未検証。
