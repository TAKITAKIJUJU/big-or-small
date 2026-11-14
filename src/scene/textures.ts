import * as THREE from "three";
const cache = new Map<string, THREE.CanvasTexture>();
function texture(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("カード描画を初期化できません");
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  cache.set(key, t);
  return t;
}
export function cardTexture(value?: number) {
  return texture(
    value === undefined ? "back" : `card${value}`,
    256,
    384,
    (c) => {
      c.fillStyle = value === undefined ? "#405159" : "#e4e3da";
      c.fillRect(0, 0, 256, 384);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = i % 2 ? "#00000004" : "#ffffff08";
        c.fillRect((i * 71) % 256, (i * 97) % 384, 1, 2);
      }
      if (value !== undefined) {
        c.fillStyle = "#252b2e";
        c.textAlign = "center";
        c.font = "600 148px Arial, sans-serif";
        c.fillText(String(value), 128, 242);
        c.font = "600 32px Arial, sans-serif";
        c.textAlign = "left";
        c.fillText(String(value), 24, 50);
        c.save();
        c.translate(256, 384);
        c.rotate(Math.PI);
        c.fillText(String(value), 24, 50);
        c.restore();
        c.strokeStyle = "#a5aaa1";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(25, 77);
        c.lineTo(231, 77);
        c.moveTo(25, 307);
        c.lineTo(231, 307);
        c.stroke();
      } else {
        c.strokeStyle = "#a2adaf";
        c.lineWidth = 2;
        c.strokeRect(17, 17, 222, 350);
        c.fillStyle = "#c8ceca";
        c.fillRect(109, 156, 10, 72);
        c.fillRect(137, 156, 10, 72);
      }
    },
  );
}
export function woodTexture() {
  return texture("wood", 512, 512, (c) => {
    c.fillStyle = "#493b30";
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1500; i++) {
      const y = (i * 31.713) % 512;
      c.strokeStyle = i % 3 === 0 ? "#a48b5922" : "#130c0733";
      c.lineWidth = i % 7 === 0 ? 2 : 0.6;
      c.beginPath();
      for (let x = 0; x <= 512; x += 16) {
        const dy = Math.sin(x * 0.018 + i * 7) * 2.4;
        c.lineTo(x, y + dy);
      }
      c.stroke();
    }
    for (let y = 0; y < 512; y += 85) {
      c.fillStyle = "#160f0a88";
      c.fillRect(0, y, 512, 2);
    }
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = "#cab58022";
      c.beginPath();
      const x = (i * 73) % 512,
        y = (i * 113) % 512;
      c.moveTo(x, y);
      c.lineTo(x + 8 + (i % 17), y + 2);
      c.stroke();
    }
  });
}
export function labelTexture(text: string) {
  return texture(`label${text}`, 512, 160, (c) => {
    c.fillStyle = "#242d32";
    c.fillRect(0, 0, 512, 160);
    c.strokeStyle = "#526065";
    c.lineWidth = 3;
    c.strokeRect(8, 8, 496, 144);
    c.fillStyle = "#dedfd8";
    c.textAlign = "center";
    c.font = `600 ${text.length > 8 ? 35 : 64}px Arial, sans-serif`;
    c.fillText(text, 256, 104);
  });
}
