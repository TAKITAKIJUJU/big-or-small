"""Developer-only asset generation. Requires pyopenjtalk 0.4.1, numpy and ffmpeg.

Usage: python scripts/generate-audio.py /path/to/mei_normal.htsvoice
The voice is MMDAgent Mei (CC BY 3.0); see public/audio-attribution.txt.
No TTS engine or external TTS service is used by the browser app.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import wave

import numpy as np
import pyopenjtalk

ROOT = pathlib.Path(__file__).resolve().parents[1]
RATE = 22050
pyopenjtalk.DEFAULT_HTS_VOICE = str(pathlib.Path(sys.argv[1]).resolve()).encode()


def wav(path, samples):
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())


def mp3(path, samples):
    with tempfile.TemporaryDirectory() as temp:
        raw = pathlib.Path(temp) / "audio.wav"
        wav(raw, samples)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-codec:a",
                        "libmp3lame", "-b:a", "64k", str(path)], check=True)


def speech(text):
    raw, rate = pyopenjtalk.tts(text, speed=1.25, half_tone=-1.5)
    raw = raw / max(1, np.max(np.abs(raw))) * 0.72
    active = np.flatnonzero(np.abs(raw) > 0.008)
    raw = raw[max(0, active[0] - int(rate * 0.035)):active[-1] + int(rate * 0.06)]
    return np.interp(np.arange(0, len(raw), rate / RATE), np.arange(len(raw)), raw)


clips, index, tape = {}, {}, []
offset = 0
texts = {f"hour-{h}": f"{'午前' if h < 12 else '午後'}{h % 12 or 12}時"
         for h in range(24)}
texts.update({f"minute-{m}": f"{m}分" for m in range(60)})
texts.update({f"second-{s}": f"{('1分' if s == 60 else str(s) + '秒') if s else 'ちょうど'}をお知らせします"
              for s in range(0, 70, 10)})
for key, text in texts.items():
    clip = speech(text)
    clips[key] = clip
    index[key] = {"start": offset / RATE, "length": len(clip) / RATE, "text": text}
    tape.extend([clip, np.zeros(int(RATE * 0.15))])
    offset += len(clip) + int(RATE * 0.15)
mp3(ROOT / "public/time-voice.mp3", np.concatenate(tape))
(ROOT / "src/audio/voice-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")


def tone(frequency, length, level, bell=False):
    t = np.arange(int(RATE * length)) / RATE
    envelope = np.minimum(1, t / 0.003) * np.minimum(1, (length - t) / 0.008)
    if bell:
        envelope *= np.exp(-t * 2.7)
    return np.sin(2 * np.pi * frequency * t) * envelope * level


tones = {"tick": tone(2000, 0.035, 0.28), "pip": tone(500, 0.14, 0.65),
         "bell": tone(1000, 1.5, 0.8, True)}
for name, data in tones.items():
    wav(ROOT / f"public/{'chime' if name == 'bell' else name}.wav", data)
preview = np.zeros(int(RATE * 11.5))
for second in range(11):
    sound = tones["bell" if second in [0, 10] else "pip" if second >= 7 else "tick"]
    start = second * RATE
    preview[start:start + len(sound)] += sound
wav(ROOT / "public/signal-preview.wav", preview)
sample_voice = clips["second-60"]
assert len(sample_voice) < RATE * 6, "Announcement must finish before the three pips"
preview[RATE * 7:RATE * 7 + len(sample_voice)] += sample_voice
mp3(ROOT / "public/signal-preview-voice.mp3", preview)
max_seconds = max(len(clips[f"hour-{h}"]) + len(clips[f"minute-{m}"]) +
                  len(clips[f"second-{s}"]) for h in range(24) for m in range(60) for s in range(0, 60, 10)) / RATE + 0.16
assert max_seconds < 6.5
print(json.dumps({"clips": len(index), "longestAnnouncementSeconds": max_seconds,
                  "previewSeconds": len(preview) / RATE, "voiceBytes": (ROOT / 'public/time-voice.mp3').stat().st_size}))
