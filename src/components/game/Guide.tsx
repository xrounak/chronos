"use client";

import { useEffect, useRef, useState } from "react";
import type { WorldHandle } from "./engine";

/** Which touch controls the player uses. */
export type ControlStyle = "joystick" | "dpad";

/**
 * Minecraft-style direction pad: forward and reverse, with a turning key either side
 * of each (drive and turn at once). There are no plain left/right keys: turning only
 * works while moving, so on their own they just swivelled the wheels. Slide a thumb
 * between keys without lifting it.
 */
export function DPad({
  world,
  locked = false,
}: {
  world: React.RefObject<WorldHandle | null>;
  /** A locked sprint lights the forward slice until the pad is touched again. */
  locked?: boolean;
}) {
  const pad = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [cell, setCell] = useState<number | null>(null);

  // Thumb angle from the pad's centre picks one of six equal wedges; the hub in the
  // middle is a rest spot (no input).
  const apply = (e: React.PointerEvent) => {
    if (pointer.current !== e.pointerId || !pad.current) return;
    const r = pad.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const inHub = Math.hypot(dx, dy) < (r.width / 2) * HUB;
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const i = inHub ? null : Math.round(deg / 60) % 6;
    setCell(i);
    if (world.current) {
      world.current.input.x = i === null ? 0 : WEDGES[i].x;
      world.current.input.y = i === null ? 0 : WEDGES[i].y;
    }
  };
  const end = () => {
    pointer.current = null;
    setCell(null);
    if (world.current) {
      world.current.input.x = 0;
      world.current.input.y = 0;
      world.current.input.held = false;
    }
  };

  return (
    <div
      ref={pad}
      className={`dpad dpad-round ${cell !== null ? "is-active" : ""}`}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        if (world.current) world.current.input.held = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // capture is a nicety
        }
        apply(e);
      }}
      onPointerMove={apply}
      onPointerUp={end}
      onPointerCancel={end}
      aria-hidden="true"
    >
      <svg viewBox="-100 -100 200 200" className="dpad-svg">
        {WEDGES.map((w, i) => {
          const a = i * 60;
          return (
            <g key={w.label} className={`dpad-wedge ${w.main ? "is-main" : ""} ${cell === i || (locked && cell === null && i === 0) ? "is-on" : ""}`}>
              <title>{w.label}</title>
              <path d={wedgePath(a - 30 + GAP, a + 30 - GAP)} />
              <path
                className="dpad-arrow"
                d="M0 -13 L11 3 H5 V12 H-5 V3 H-11 Z"
                transform={`rotate(${a}) translate(0 -66)`}
              />
            </g>
          );
        })}
        <circle r={HUB * 100 - 6} className="dpad-hub" />
      </svg>
    </div>
  );
}

/** Six equal wedges clockwise from straight up: forward, the two diagonals each side, reverse. */
const WEDGES = [
  { label: "Forward", x: 0, y: 1, main: true },
  { label: "Forward right", x: 1, y: 1, main: false },
  { label: "Back right", x: 1, y: -1, main: false },
  { label: "Reverse", x: 0, y: -1, main: true },
  { label: "Back left", x: -1, y: -1, main: false },
  { label: "Forward left", x: -1, y: 1, main: false },
];
/** Hub radius as a share of the pad's radius, and the gap either side of each wedge (degrees). */
const HUB = 0.34;
const GAP = 2.2;
const OUTER = 96;

function wedgePath(from: number, to: number) {
  const inner = HUB * 100;
  const pt = (deg: number, r: number) => {
    const t = (deg * Math.PI) / 180;
    return `${(Math.sin(t) * r).toFixed(2)} ${(-Math.cos(t) * r).toFixed(2)}`;
  };
  return `M${pt(from, inner)} L${pt(from, OUTER)} A${OUTER} ${OUTER} 0 0 1 ${pt(to, OUTER)} L${pt(to, inner)} A${inner} ${inner} 0 0 0 ${pt(from, inner)} Z`;
}

/** Babu, the island's guide: a small round robot critter, drawn in code. */
export function Babu({ mood }: { mood: "wave" | "point" | "happy" }) {
  return (
    <svg
      viewBox="0 0 120 130"
      className={`bolt bolt-${mood}`}
      aria-hidden="true"
    >
      {/* antenna */}
      <path
        d="M60 30 Q58 16 66 8"
        stroke="#1d1813"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <circle
        className="bolt-bulb"
        cx="67"
        cy="8"
        r="7"
        fill="#f4b536"
        stroke="#1d1813"
        strokeWidth="3"
      />
      {/* feet */}
      <ellipse cx="42" cy="118" rx="13" ry="7" fill="#1d1813" />
      <ellipse cx="78" cy="118" rx="13" ry="7" fill="#1d1813" />
      {/* arms */}
      <path
        className="bolt-arm-l"
        d="M18 74 Q4 66 8 52"
        stroke="#1d1813"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="bolt-arm-r"
        d="M102 74 Q116 62 112 46"
        stroke="#1d1813"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      {/* body */}
      <ellipse cx="64" cy="76" rx="44" ry="42" fill="#1d1813" />
      <ellipse
        cx="60"
        cy="72"
        rx="44"
        ry="42"
        fill="#e2452b"
        stroke="#1d1813"
        strokeWidth="4"
      />
      {/* face plate */}
      <rect
        x="28"
        y="46"
        width="64"
        height="44"
        rx="20"
        fill="#fff3dc"
        stroke="#1d1813"
        strokeWidth="3.5"
      />
      {/* eyes */}
      <g className="bolt-eyes">
        <ellipse cx="47" cy="66" rx="7" ry="9" fill="#1d1813" />
        <ellipse cx="73" cy="66" rx="7" ry="9" fill="#1d1813" />
        <circle cx="49.5" cy="62.5" r="2.6" fill="#fff" />
        <circle cx="75.5" cy="62.5" r="2.6" fill="#fff" />
      </g>
      {/* cheeks + mouth */}
      <ellipse cx="36" cy="78" rx="5" ry="3" fill="#f08aa0" />
      <ellipse cx="84" cy="78" rx="5" ry="3" fill="#f08aa0" />
      <path
        d="M53 79 Q60 86 67 79"
        stroke="#1d1813"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* gear badge */}
      <circle
        cx="60"
        cy="104"
        r="6"
        fill="#f4b536"
        stroke="#1d1813"
        strokeWidth="2.5"
      />
    </svg>
  );
}

type Step = {
  title: string;
  text: string;
  mood: "wave" | "point" | "happy";
  focus?: "controls" | "menu" | "boost" | "arrow";
};

/**
 * The tutorial: Babu walks new players through driving, the guide arrow, events and the
 * menu. Shown every time the game starts; "Skip tutorial" closes it at any step. The
 * game runs underneath, so players can try each thing as Babu explains it.
 */
export function Guide({
  touch,
  arrowOn,
  controls,
  onControls,
  onClose,
}: {
  touch: boolean;
  arrowOn: boolean;
  controls: ControlStyle;
  onControls: (c: ControlStyle) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const steps: Step[] = [
    {
      title: "Hi, I'm Babu!",
      text: "Welcome to the Chronos island. Every event of the fest is somewhere here. Let me show you how to drive around. It takes 20 seconds.",
      mood: "wave",
    },
    touch
      ? {
          title: "Driving",
          text:
            controls === "joystick"
              ? "Put your thumb on the round joystick (bottom left) and push it up to drive. Push left or right to turn. Prefer buttons? Switch to arrow buttons below."
              : "Hold the top of the wheel to drive and the bottom to reverse. The slices either side drive and turn at the same time. Slide your thumb round the wheel to steer. Prefer a joystick? Switch below.",
          mood: "point",
          focus: "controls",
        }
      : {
          title: "Driving",
          text: "Use W A S D or the arrow keys: W drives forward, A and D turn, S reverses, Space brakes. Try it now!",
          mood: "point",
          focus: "controls",
        },
    touch
      ? {
          title: "Nitro boost",
          text: "Hold the NITRO button (bottom right) to boost. It burns your tank; grab the glowing red nitro cans on the island to refill it by 33%. It also refills slowly on its own. On the coast loop road round the island it never runs out.",
          mood: "happy",
          focus: "boost",
        }
      : {
          title: "Nitro boost",
          text: "Hold Shift to boost. It burns the nitro tank (the dial, bottom right); grab the glowing red nitro cans to refill it by 33%. On the coast loop road round the island it never runs out. Drag with the mouse to look around.",
          mood: "happy",
          focus: "boost",
        },
    touch
      ? {
          title: "Hop out",
          text: "Tap GET OUT (above the NITRO button) to walk. On foot the big button JUMPS. Push the joystick all the way up and hold it a moment to lock a sprint; touch the joystick again to stop. Drag with a second finger to look around. Walk up to the rover or a supercar and tap DRIVE.",
          mood: "point",
          focus: "boost",
        }
      : {
          title: "Hop out",
          text: "Press F to get out and walk around: Shift runs, Space jumps, and the mouse turns the view. Walk up to the rover or one of the three supercars and press F to drive it. The menu has Customise for your look and paint.",
          mood: "point",
        },
    {
      title: "Follow the arrow",
      text:
        "Look just above your rover in the middle of the screen: the small floating arrow points to the next day (Day 1, 2, 3) and its events. The round map (top right) shows the whole island." +
        (arrowOn
          ? ""
          : " (The arrow is switched off right now: turn on Guide arrow in the menu.)"),
      mood: "point",
      focus: "arrow",
    },
    {
      title: "Find the events",
      text: "Drive onto a glowing ring and a card pops up with the event's details, its rule book and a Register button. Visit all of them!",
      mood: "happy",
    },
    {
      title: "The menu",
      text: "Top left: the menu has every event with fast travel, photos and the leaderboard. The gear under it is settings: speed, controls, camera, time of day (even a whole day cycle), resolution and sound. Have fun!",
      mood: "wave",
      focus: "menu",
    },
  ];
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => {
    document.documentElement.dataset.guideFocus = step.focus ?? "";
    return () => {
      delete document.documentElement.dataset.guideFocus;
    };
  }, [step.focus]);

  return (
    <>
      {/* Marks where the rover's guide arrow floats, so "the arrow" is easy to find */}
      {step.focus === "arrow" && (
        <span className="guide-spot" aria-hidden="true" />
      )}
      <div
        className="guide"
        role="dialog"
        aria-label="How to play"
        aria-live="polite"
      >
        <div className="guide-bolt">
          <Babu mood={step.mood} />
        </div>
        <div className="guide-card" key={i}>
          <p className="guide-step label">
            {i + 1} / {steps.length}
          </p>
          <p className="guide-title">{step.title}</p>
          <p className="guide-text">{step.text}</p>
          {touch && step.focus === "controls" && (
            <div
              className="guide-switch"
              role="radiogroup"
              aria-label="Touch controls"
            >
              {(["joystick", "dpad"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={controls === c}
                  className={controls === c ? "is-on" : ""}
                  onClick={() => onControls(c)}
                >
                  {c === "joystick" ? "Joystick" : "Arrow buttons"}
                </button>
              ))}
            </div>
          )}
          <div className="guide-actions">
            <button type="button" className="guide-skip" onClick={onClose}>
              Skip tutorial
            </button>
            <span className="flex gap-2">
              {i > 0 && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => setI(i - 1)}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="chip chip-solid"
                onClick={() => (last ? onClose() : setI(i + 1))}
              >
                {last ? "Let's go!" : "Next"}
              </button>
            </span>
          </div>
          <span className="guide-dots" aria-hidden="true">
            {steps.map((_, k) => (
              <i key={k} className={k === i ? "is-on" : ""} />
            ))}
          </span>
        </div>
      </div>
    </>
  );
}
