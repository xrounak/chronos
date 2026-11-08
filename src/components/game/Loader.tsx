"use client";

import { useEffect, useState } from "react";

/**
 * The loading stage under the title while the island is built: voxel blocks drop in to
 * build a little island, the rover drives on a scrolling road past nitro cans, and a
 * segmented bar fills as the real steps finish (code, fonts, building). Only transform
 * and opacity animate, so it keeps moving even while the main thread is busy building.
 */

const LINES = [
  "Pouring the roads",
  "Planting the oak trees",
  "Waking up the sheep",
  "Filling the nitro cans",
  "Hanging the street lamps",
  "Painting GEC PALAMU",
  "Inflating the balloons",
  "Teaching the gulls to fly",
];

/** Real progress per loading step: 0 code, 1 code ready, 2 fonts ready, 3 building, 4 done. */
const STEP_PCT = [14, 42, 58, 82, 100];

export function LoadingStage({ step }: { step: number }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setLine((l) => (l + 1) % LINES.length), 1300);
    return () => clearInterval(id);
  }, []);
  const pct = STEP_PCT[Math.min(step, STEP_PCT.length - 1)];
  const cells = 12;
  const filled = Math.round((pct / 100) * cells);

  return (
    <div className="ldr" role="status" aria-live="polite" aria-label={`Building the island, ${pct} percent`}>
      <div className="ldr-scene" aria-hidden="true">
        {/* the island, assembled block by block */}
        <div className="ldr-blocks">
          {["#7fbf4d", "#4f9a45", "#c4a676", "#7fbf4d", "#e2452b", "#2453b3", "#7fbf4d", "#f4b536", "#4f9a45"].map((c, i) => (
            <i key={i} style={{ background: c, animationDelay: `${i * 0.16}s` }} />
          ))}
        </div>
        {/* the road, scrolling under the rover */}
        <div className="ldr-road">
          <span className="ldr-dash" />
          <span className="ldr-can" style={{ animationDelay: "0s" }} />
          <span className="ldr-can" style={{ animationDelay: "-1.3s" }} />
        </div>
        <svg className="ldr-rover" viewBox="0 0 40 26">
          <rect x="22" y="1" width="1.5" height="9" fill="#1d1813" />
          <rect x="23.5" y="1" width="6" height="4" fill="#f4b536" />
          <rect x="4" y="9" width="24" height="7" fill="#fff3dc" stroke="#1d1813" strokeWidth="1.5" />
          <rect x="1" y="14" width="36" height="7" fill="#e2452b" stroke="#1d1813" strokeWidth="1.5" />
          <rect x="18" y="10.5" width="8" height="3.5" fill="#5fb4e0" />
          <rect x="34" y="15.5" width="3" height="2.5" fill="#fff7c2" />
          <g className="ldr-wheel" style={{ transformOrigin: "9px 21px" }}>
            <circle cx="9" cy="21" r="4.2" fill="#1d1813" />
            <rect x="8.3" y="17.5" width="1.4" height="7" fill="#f4b536" />
          </g>
          <g className="ldr-wheel" style={{ transformOrigin: "30px 21px" }}>
            <circle cx="30" cy="21" r="4.2" fill="#1d1813" />
            <rect x="29.3" y="17.5" width="1.4" height="7" fill="#f4b536" />
          </g>
        </svg>
        <span className="ldr-puff" />
        <span className="ldr-puff ldr-puff-b" />
      </div>
      <div className="ldr-bar" aria-hidden="true">
        {Array.from({ length: cells }, (_, i) => (
          <i key={i} className={i < filled ? "is-on" : ""} style={{ transitionDelay: `${i * 40}ms` }} />
        ))}
      </div>
      <p className="ldr-line">
        <span key={line} className="ldr-line-text">
          {LINES[line]}
        </span>
        <span className="ldr-pct">{pct}%</span>
      </p>
    </div>
  );
}
