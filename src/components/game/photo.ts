/**
 * Photo mode: the current 3D view framed as an Instagram portrait (1080 x 1350) with
 * a cut-paper CHRONOS stamp, the visitor's score and the site address.
 */

const INK = "#1d1813";
const CREAM = "#fff3dc";
const LETTERS = ["#e2452b", "#2453b3", "#fff3dc", "#1d1813", "#1f9c86", "#f08aa0", "#f4b536"];

const fontOf = (v: string, fallback: string) => {
  const f = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return f ? `${f}, ${fallback}` : fallback;
};

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function composePhoto(shot: string, info: { events: number; total: number; gears: number }) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const display = fontOf("--font-pixel-display", "Georgia, serif");
  const label = fontOf("--font-pixel-label", "system-ui, sans-serif");
  const hand = fontOf("--font-pixel-hand", "cursive");
  const digits = fontOf("--font-pixel-digits", "monospace");

  g.fillStyle = CREAM;
  g.fillRect(0, 0, W, H);

  // The shot, cropped to fill the frame
  const img = await load(shot);
  const fx = 48;
  const fy = 210;
  const fw = W - fx * 2;
  const fh = 880;
  const scale = Math.max(fw / img.width, fh / img.height);
  const sw = fw / scale;
  const sh = fh / scale;
  g.fillStyle = INK;
  g.fillRect(fx + 14, fy + 14, fw, fh);
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, fx, fy, fw, fh);
  g.lineWidth = 8;
  g.strokeStyle = INK;
  g.strokeRect(fx, fy, fw, fh);

  // Cut-paper CHRONOS letters across the top
  g.font = `400 130px ${display}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const word = "CHRONOS";
  const step = 134;
  const x0 = W / 2 - (step * (word.length - 1)) / 2;
  [...word].forEach((ch, i) => {
    const x = x0 + i * step;
    const y = 112;
    g.save();
    g.translate(x, y);
    g.rotate([-0.1, 0.07, -0.05, 0.12, -0.08, 0.05, -0.07][i]);
    g.fillStyle = INK;
    g.fillRect(-56 + 9, -64 + 9, 112, 128);
    g.fillStyle = LETTERS[i];
    g.fillRect(-56, -64, 112, 128);
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.strokeRect(-56, -64, 112, 128);
    g.fillStyle = LETTERS[i] === CREAM || LETTERS[i] === "#f08aa0" || LETTERS[i] === "#f4b536" ? INK : CREAM;
    g.fillText(ch, 0, 8);
    g.restore();
  });

  // Score stamp, tilted over the corner of the shot
  g.save();
  g.translate(W - 210, fy + fh - 40);
  g.rotate(-0.14);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(10, 10, 140, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f4b536";
  g.beginPath();
  g.arc(0, 0, 140, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = INK;
  g.font = `700 30px ${label}`;
  g.fillText("EVENTS", 0, -62);
  g.font = `400 52px ${digits}`;
  g.fillText(`${info.events}/${info.total}`, 0, 6);
  g.font = `700 32px ${label}`;
  g.fillText(`${info.gears} NITRO ${info.gears === 1 ? "CAN" : "CANS"}`, 0, 70);
  g.restore();

  // Footer
  g.fillStyle = INK;
  g.fillRect(0, H - 150, W, 150);
  g.fillStyle = "#f4b536";
  g.font = `400 60px ${display}`;
  g.fillText("EARNED, NEVER GIVEN.", W / 2, H - 98);
  g.fillStyle = CREAM;
  g.font = `400 26px ${label}`;
  g.fillText("11–13 DEC 2026 · GEC PALAMU · CHRONOS.SIC.GECP.IN", W / 2, H - 46, W - 80);
  g.fillStyle = "#e2452b";
  g.font = `400 70px ${hand}`;
  g.save();
  g.translate(fx + 40, fy + 60);
  g.rotate(-0.08);
  g.textAlign = "left";
  g.lineWidth = 10;
  g.strokeStyle = CREAM;
  g.strokeText("I was on the island ✦", 0, 0);
  g.fillText("I was on the island ✦", 0, 0);
  g.restore();

  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("photo failed"))), "image/png"));
}

const fileOf = (blob: Blob) => new File([blob], "chronos-2026.png", { type: "image/png" });

/** Whether this browser can hand the picture to other apps (Instagram, WhatsApp...). */
export function canSharePhoto(blob: Blob) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return !!nav.canShare?.({ files: [fileOf(blob)] });
}

export async function sharePhoto(blob: Blob) {
  try {
    await navigator.share({ files: [fileOf(blob)], title: "CHRONOS 2026", text: "On the Chronos island · @sic_gecp #Chronos2026 · chronos.sic.gecp.in" });
    return true;
  } catch {
    return false;
  }
}

export function downloadPhoto(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chronos-2026.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
