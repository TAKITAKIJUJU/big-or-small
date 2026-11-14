/** 外部音源なし。ユーザー操作後だけ鳴るオリジナル合成音。 */
let ctx: AudioContext | null = null;
let roomGain: GainNode | null = null;
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* 音声非対応でも進行可能 */
  }
}
export function syncAmbient(volume: number, muted: boolean) {
  if (!ctx || ctx.state !== "running") return;
  if (!roomGain) {
    roomGain = ctx.createGain();
    roomGain.gain.value = 0;
    roomGain.connect(ctx.destination);
    for (const frequency of [47, 71.3]) {
      const tone = ctx.createOscillator();
      tone.frequency.value = frequency;
      tone.connect(roomGain);
      tone.start();
    }
  }
  roomGain.gain.setTargetAtTime(
    muted ? 0 : volume * 0.009,
    ctx.currentTime,
    0.2,
  );
}
export function playSound(
  kind: "card" | "chip" | "draw" | "settle",
  volume: number,
  muted: boolean,
) {
  if (!ctx || ctx.state !== "running" || muted || volume === 0) return;
  const now = ctx.currentTime;
  if (kind === "card") {
    const buffer = ctx.createBuffer(
        1,
        Math.floor(ctx.sampleRate * 0.13),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] =
        (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.024));
    const noise = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    noise.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 1900;
    filter.Q.value = 0.6;
    gain.gain.value = volume * 0.35;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    return;
  }
  const frequencies =
    kind === "chip"
      ? [1130, 1741]
      : kind === "draw"
        ? [350, 610]
        : [196, 247, 294];
  frequencies.forEach((frequency, i) => {
    const time = now + (kind === "draw" ? i * 0.055 : 0),
      osc = ctx!.createOscillator(),
      gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, time);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.94, time + 0.12);
    gain.gain.setValueAtTime(volume * (kind === "settle" ? 0.055 : 0.09), time);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      time + (kind === "settle" ? 0.45 : 0.13),
    );
    osc.connect(gain);
    gain.connect(ctx!.destination);
    osc.start(time);
    osc.stop(time + 0.5);
  });
}
