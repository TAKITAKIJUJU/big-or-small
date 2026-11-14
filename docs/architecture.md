# アーキテクチャ

`入力 → GameCommand → transition / getLegalActions → GameState → PlayerView → DOM / Three.js` の単方向フロー。

| モジュール               | 責務                                                            |
| ------------------------ | --------------------------------------------------------------- |
| src/game/engine.ts       | 型、合法手、乱数注入、状態遷移、600チップの不変条件、情報の射影 |
| src/game/bot.ts          | PlayerViewのみを引数にする3難易度の戦略                         |
| src/lib/useGame.ts       | 内部状態とコマンド記録の所有、Bot入力の作成、暗号乱数           |
| src/lib/session.ts       | 設定の正規化、保存、記録の合法再生                              |
| src/scene/TableScene.tsx | ビューから立体カード・チップ・NPC・照明・カメラを表現           |
| src/scene/textures.ts    | オリジナルの紙、裏模様、木目、表示板の手続き生成                |
| src/lib/audio.ts         | 操作後にWeb Audioで短い効果音と小さな環境音を合成               |
| src/App.tsx              | ホーム、入力補助、ベット額、結果、モーダル、再開                |

エンジンはReact、Three、localStorageをimportしない。各遷移は入力をcloneし、検証失敗時は元の状態を変更しない。`GameEvent` は秘密の数字を含めず、描画は状態とイベントから決定する。

Botへの入力は `getPlayerView(state, 'bot', false)`。Botにはstateも人間のhandも渡さない。人間向けも `getPlayerView(state, 'human', settings.reveal)` のみを描画。Reactコンポーネントは秘密のGameStateを受け取らない。Botは公開履歴、ポット、手札、抽選、合法手から選ぶ。

初級は強い札で小さく賭け、ブラフは少ない。中級は公開札を考慮した推定と適度なブラフ。上級は公開札候補、相手のフォールド傾向、チップ差、残りラウンド、混合した確率的選択を使う。万能・最適戦略ではない。

保存は `usotuki.v1` に設定と `Session { allIn, entries }` を保存。内部chipsのスナップショットを信用せず、300対300から全コマンドと抽選を合法再生。破損JSON、不正コマンド、重複札、無効乱数、未知バージョンは破棄し通知。容量600KB、最大1500コマンド。localStorage拒否時も対局は続行し、保存不能を通知。

ブラウザ内のBot戦では開発者ツールや保存記録を見れば秘密を取得・改変できる。これは対人戦の保護機構ではない。対人戦へはエンジンだけを移し、サーバーで権限、認証、重複、乱数、保存を所有する。

二重操作は180msの同期ロック、エンジンのphase/turn検証、Botタイマーのrevision検証で防ぐ。モーダル・ホーム中はBot進行を停止。遷移タイマーはEffect cleanupで破棄し、再開時に現在のphaseから続行する。
