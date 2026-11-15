# 利用ライブラリと独自素材

React、React DOM、Scheduler：MIT License。配信する完全なライセンス文はビルド時生成のpublic/licenses.txt（配信では/licenses.txt）に含む。

計器UI、SVG、アプリアイコン、チャイム、アプリの日本語文章は独自作成。システムフォントを使用し、外部フォントを取得しない。原作漫画の画像・ロゴ・人物・フォント・音源は使用しない。

秒音tick.wav（2000Hz）、予告音pip.wav（500Hz）、長音chime.wav（1000Hz）は独自の正弦波合成（PCM 16bit／22.05kHz／モノラル）。原作や電話サービスの録音素材は使用しない。

内蔵時刻音声time-voice.mp3と試聴音声signal-preview-voice.mp3は、Open JTalk／HTS Voice Mei (normal) / MMDAgent Project Teamから生成し、切り出し・音量調整・再サンプリング・MP3化・独自音とのミックスを行った。音声は名古屋工業大学（2009–2013）、CC BY 3.0。完全な出典とライセンス告知は[public/audio-attribution.txt](public/audio-attribution.txt)、配信の/audio-attribution.txtと/licenses.txtに含む。開発用エンジンやモデルをアプリに同梱せず、関係機関の推奨や原作の声の再現を示すものではない。

開発時のライブラリはpackage-lock.jsonを参照。以前使用していた3D依存は今回の実行時依存と配信物から撤去した。
