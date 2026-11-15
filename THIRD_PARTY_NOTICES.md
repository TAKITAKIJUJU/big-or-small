# 利用ライブラリと独自素材

React、React DOM、Scheduler：MIT License。配信する完全なライセンス文はビルド時生成のpublic/licenses.txt（配信では/licenses.txt）に含む。

計器UI、SVG、アプリアイコン、チャイム、アプリの日本語文章は独自作成。システムフォントを使用し、外部フォントを取得しない。原作漫画の画像・ロゴ・人物・フォント・音源は使用しない。

public/chime.wavは784Hz・1174.66Hzを基に波形を合成した独自音源（PCM 16bit／44.1kHz／モノラル）。外部の録音素材は使用しない。

開発時のライブラリはpackage-lock.jsonを参照。以前使用していた3D依存は今回の実行時依存と配信物から撤去した。
