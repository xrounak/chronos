import type { CSSProperties } from "react";

/**
 * Paper cut-outs drawn as SVG: torn section edges, gears, a light bulb, confetti and
 * the cut-paper CHRONOS letters. Each sits on the page with a hard paper shadow, so
 * stacked layers read as a paper diorama. All decorative (aria-hidden).
 */

/** Deterministic wobble so server and browser draw the same edge. */
function jag(seed: number, n: number, amp: number) {
  const out: number[] = [];
  let x = seed * 9301 + 49297;
  for (let i = 0; i <= n; i++) {
    x = (x * 9301 + 49297) % 233280;
    out.push((x / 233280) * amp);
  }
  return out;
}

/** A torn paper edge, the colour of the section it belongs to, overlapping the one before. */
export function TornEdge({ color, seed = 1, side = "top", className = "" }: { color: string; seed?: number; side?: "top" | "left"; className?: string }) {
  const n = 60;
  const pts = jag(seed, n, 22);
  if (side === "left") {
    const d = `M40 0 ${pts.map((p, i) => `L${(18 + p).toFixed(1)} ${((i / n) * 1000).toFixed(1)}`).join(" ")} L40 1000 Z`;
    return (
      <svg aria-hidden="true" className={`torn-left ${className}`} viewBox="0 0 40 1000" preserveAspectRatio="none" style={{ color }}>
        <path d={d} fill="currentColor" />
      </svg>
    );
  }
  const d = `M0 40 ${pts.map((p, i) => `L${((i / n) * 1200).toFixed(1)} ${(18 + p).toFixed(1)}`).join(" ")} L1200 40 Z`;
  return (
    <svg aria-hidden="true" className={`torn-top ${className}`} viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ color }}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

function gearPath(r: number, teeth: number, depth: number, hole: number) {
  const step = (Math.PI * 2) / teeth;
  const pt = (rad: number, a: number) => `${(rad * Math.cos(a)).toFixed(2)} ${(rad * Math.sin(a)).toFixed(2)}`;
  const outline = Array.from({ length: teeth }, (_, i) => {
    const a = i * step;
    return `${pt(r - depth, a)} L${pt(r, a + step * 0.12)} L${pt(r, a + step * 0.42)} L${pt(r - depth, a + step * 0.55)}`;
  }).join(" L");
  return `M${outline} Z M${hole} 0 A${hole} ${hole} 0 1 0 ${-hole} 0 A${hole} ${hole} 0 1 0 ${hole} 0 Z`;
}

type Pos = { top?: string; left?: string; right?: string; bottom?: string; w: string; depth?: number; className?: string; z?: number };
const posStyle = ({ top, left, right, bottom, w, z }: Pos) => ({ top, left, right, bottom, width: w, zIndex: z }) as CSSProperties;

/** A paper gear that turns slowly. `spin` is seconds per turn (negative turns the other way). */
export function CutGear({ color, teeth = 10, spin = 40, ...pos }: Pos & { color: string; teeth?: number; spin?: number }) {
  return (
    <div className={`cutout ${pos.className ?? ""}`} style={posStyle(pos)} data-speed={pos.depth || undefined} aria-hidden="true">
      <svg viewBox="-100 -100 200 200" className="cut-spin" style={{ animationDuration: `${Math.abs(spin)}s`, animationDirection: spin < 0 ? "reverse" : "normal" }}>
        <path d={gearPath(96, teeth, 16, 30)} fill={color} fillRule="evenodd" />
        <circle r="46" fill="none" stroke="rgb(0 0 0 / 0.12)" strokeWidth="3" strokeDasharray="6 8" />
      </svg>
    </div>
  );
}

/** A cut-paper light bulb: the spark of an idea. */
export function CutBulb(pos: Pos) {
  return (
    <div className={`cutout ${pos.className ?? ""}`} style={posStyle(pos)} data-speed={pos.depth || undefined} aria-hidden="true">
      <svg viewBox="0 0 200 300">
        <g className="bulb-rays" stroke="#e2452b" strokeWidth="10" strokeLinecap="round">
          <path d="M100 8 V34 M30 40 L48 58 M170 40 L152 58 M6 112 H32 M168 112 H194" />
        </g>
        <path d="M100 52 C55 52 34 86 34 118 C34 150 58 166 68 190 L132 190 C142 166 166 150 166 118 C166 86 145 52 100 52 Z" fill="#f4b536" />
        <path d="M78 88 C66 96 60 108 60 122" stroke="#fff7df" strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M84 190 V150 C84 136 116 136 116 150 V190" stroke="#1d1813" strokeWidth="6" fill="none" />
        <rect x="64" y="190" width="72" height="22" rx="6" fill="#1f9c86" />
        <rect x="68" y="214" width="64" height="18" rx="6" fill="#1d1813" />
        <rect x="76" y="234" width="48" height="16" rx="6" fill="#1f9c86" />
        <path d="M88 252 H112 L104 268 H96 Z" fill="#1d1813" />
      </svg>
    </div>
  );
}

const CONFETTI = ["#e2452b", "#f4b536", "#2453b3", "#1f9c86", "#f4ecdd", "#f08aa0"];

/** Scattered paper bits: squares, triangles and strips in the festival colours. */
export function Confetti({ count = 26, seed = 3, className = "" }: { count?: number; seed?: number; className?: string }) {
  const r = jag(seed, count * 4, 1);
  return (
    <div className={`confetti-layer ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const shape = i % 3;
        const size = 10 + r[i * 4 + 2] * 22;
        return (
          <i
            key={i}
            data-speed={(0.1 + r[i * 4 + 3] * 0.5).toFixed(2)}
            style={{
              left: `${(r[i * 4] * 100).toFixed(1)}%`,
              top: `${(r[i * 4 + 1] * 100).toFixed(1)}%`,
              width: shape === 2 ? size * 2.2 : size,
              height: shape === 2 ? size * 0.5 : size,
              background: CONFETTI[i % CONFETTI.length],
              clipPath: shape === 1 ? "polygon(50% 0, 100% 100%, 0 100%)" : undefined,
              rotate: `${Math.round(r[i * 4 + 2] * 360)}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

const LETTER_PAPER = [
  { bg: "#e2452b", fg: "#fff7df" },
  { bg: "#2453b3", fg: "#fff7df" },
  { bg: "#f4ecdd", fg: "#1d1813" },
  { bg: "#1d1813", fg: "#f4b536" },
  { bg: "#1f9c86", fg: "#fff7df" },
  { bg: "#f08aa0", fg: "#1d1813" },
  { bg: "#fff7df", fg: "#e2452b" },
];
const LETTER_TILT = [-6, 4, -3, 7, -5, 3, -4];

/** Each letter cut from a different sheet of paper and stuck down a little crooked. */
export function CutLetters({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`cut-letters ${className}`} aria-hidden="true">
      {text.split("").map((ch, i) => {
        const p = LETTER_PAPER[i % LETTER_PAPER.length];
        return (
          <span key={i} className="cut-letter" data-piece style={{ background: p.bg, color: p.fg, rotate: `${LETTER_TILT[i % LETTER_TILT.length]}deg` }}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}
