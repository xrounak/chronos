import { ImageResponse } from "next/og";

export const alt = "CHRONOS 2026 · Earned, Never Given · 11–13 December · GEC Palamu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1d1813";
const CREAM = "#fff3dc";
const LETTERS: Array<[string, string]> = [
  ["#e2452b", CREAM],
  ["#2453b3", CREAM],
  [CREAM, INK],
  [INK, "#f4b536"],
  ["#1f9c86", CREAM],
  ["#f08aa0", INK],
  [CREAM, "#e2452b"],
];
const TILT = [-6, 4, -3, 7, -5, 3, -4];

/** Share picture for WhatsApp, Instagram, LinkedIn and search: the paper-cut look of the site. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #5fb4e0 0%, #bfe3ef 58%, #ffe3b8 100%)",
          color: INK,
          fontFamily: "serif",
          position: "relative",
        }}
      >
        {/* hills and road */}
        <div style={{ position: "absolute", left: -60, right: -60, bottom: 40, height: 150, background: "#4f9a45", borderTop: `5px solid ${INK}`, borderRadius: "50% 50% 0 0", display: "flex" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 70, background: "#7fbf4d", borderTop: `5px solid ${INK}`, display: "flex" }} />

        <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, textTransform: "uppercase", fontFamily: "sans-serif", fontWeight: 700 }}>Science &amp; Innovation Club · GEC Palamu</div>

        <div style={{ display: "flex", gap: 14, marginTop: 26 }}>
          {"CHRONOS".split("").map((ch, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 128,
                height: 150,
                fontSize: 120,
                fontWeight: 900,
                background: LETTERS[i][0],
                color: LETTERS[i][1],
                border: `6px solid ${INK}`,
                boxShadow: `10px 10px 0 ${INK}`,
                transform: `rotate(${TILT[i]}deg)`,
              }}
            >
              {ch}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 40,
            padding: "14px 34px",
            fontSize: 40,
            fontWeight: 900,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: "#f4b536",
            background: INK,
            boxShadow: "8px 8px 0 #e2452b",
            transform: "rotate(-1.5deg)",
          }}
        >
          Earned, Never Given.
        </div>

        <div style={{ display: "flex", marginTop: 34, gap: 14, fontFamily: "sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: 5, textTransform: "uppercase" }}>
          <div style={{ display: "flex", padding: "8px 18px", background: CREAM, border: `4px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}` }}>11 – 13 December 2026</div>
          <div style={{ display: "flex", padding: "8px 18px", background: "#e2452b", color: CREAM, border: `4px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}` }}>Drive the 3D island</div>
        </div>
      </div>
    ),
    size,
  );
}
