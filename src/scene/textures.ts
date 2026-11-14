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
      c.fillStyle = value === undefined ? "#253b36" : "#d9cfb3";
      c.fillRect(0, 0, 256, 384);
      // 決定的な紙の繊維。外部素材なし。
      for (let i = 0; i < 1800; i++) {
        const x = (i * 71) % 256,
          y = (i * 97) % 384;
        c.fillStyle = i % 2 ? "#00000008" : "#ffffff0a";
        c.fillRect(x, y, 1, 2);
      }
      c.strokeStyle = value === undefined ? "#8f936d" : "#786e51";
      c.lineWidth = 2;
      c.strokeRect(13, 13, 230, 358);
      c.strokeRect(20, 20, 216, 344);
      c.save();
      c.translate(128, 192);
      c.rotate(Math.PI / 4);
      c.strokeStyle = value === undefined ? "#a8a079" : "#a69a78";
      c.strokeRect(-53, -53, 106, 106);
      c.strokeRect(-43, -43, 86, 86);
      c.restore();
      if (value !== undefined) {
        c.fillStyle = "#25332e";
        c.textAlign = "center";
        c.font = "bold 116px Georgia";
        c.fillText(String(value), 128, 227);
        c.font = "bold 34px Georgia";
        c.textAlign = "left";
        c.fillText(String(value), 31, 61);
        c.save();
        c.translate(256, 384);
        c.rotate(Math.PI);
        c.fillText(String(value), 31, 61);
        c.restore();
        c.font = "12px Georgia";
        c.textAlign = "center";
        c.fillText("U S O T U K I", 128, 316);
      } else {
        c.strokeStyle = "#929e78";
        c.lineWidth = 1;
        for (let y = 36; y < 360; y += 16)
          for (let x = 36; x < 240; x += 16) {
            c.beginPath();
            c.moveTo(x, y - 5);
            c.lineTo(x + 5, y);
            c.lineTo(x, y + 5);
            c.lineTo(x - 5, y);
            c.closePath();
            c.stroke();
          }
        c.fillStyle = "#253b36";
        c.fillRect(92, 151, 72, 82);
        c.fillStyle = "#c9bb8c";
        c.font = "42px Georgia";
        c.textAlign = "center";
        c.fillText("U", 128, 207);
      }
    },
  );
}
export function woodTexture() {
  return texture("wood", 512, 512, (c) => {
    c.fillStyle = "#4d3525";
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
    c.fillStyle = "#151b17";
    c.fillRect(0, 0, 512, 160);
    c.strokeStyle = "#a99365";
    c.lineWidth = 3;
    c.strokeRect(8, 8, 496, 144);
    c.fillStyle = "#e0d2a3";
    c.textAlign = "center";
    c.font = `${text.length > 8 ? 35 : 64}px Georgia`;
    c.fillText(text, 256, 104);
  });
}
