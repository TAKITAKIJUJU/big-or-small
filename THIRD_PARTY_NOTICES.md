# 外部ライブラリと素材

本作の美術、ロゴ、テクスチャ、合成効果音は本プロジェクトで制作。外部素材、画像、音声、Webフォントは含まない。参考作品の素材は使用しない。

| パッケージ                                      | ライセンス | 用途                       |
| ----------------------------------------------- | ---------- | -------------------------- |
| React / react-dom                               | MIT        | UI                         |
| Three.js                                        | MIT        | WebGL                      |
| @react-three/fiber                              | MIT        | ReactとThree.jsの接続      |
| Vite / @vitejs/plugin-react                     | MIT        | ビルド                     |
| TypeScript                                      | Apache-2.0 | 型検査                     |
| Vitest                                          | MIT        | 単体・シミュレーション検査 |
| ESLint / typescript-eslint / react-hooks plugin | MIT        | 静的検査                   |
| Playwright                                      | Apache-2.0 | 開発時ブラウザ検査         |
| @types各種                                      | MIT        | 開発用型定義               |

実際に解決したバージョンはpackage-lock.jsonを参照。各パッケージおよび推移依存のLICENSE/COPYING/NOTICEはnode_modules内に保持される。リリース前に依存更新時のライセンスを再確認する。ブラウザ配信物の依存通知は `public/licenses.txt` にまとめる。
