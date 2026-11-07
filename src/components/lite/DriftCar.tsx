"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A little SIC rover that never leaves the screen: it roams between random spots in
 * the window, sliding sideways through its turns and leaving skid marks and dust that
 * fade away. Tap it and it spins out. Hidden for visitors who prefer less motion.
 */

const MARGIN = 44;
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function DriftCar() {
  const marks = useRef<HTMLCanvasElement>(null);
  const car = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [say, setSay] = useState<string | null>(null);
  const spin = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = marks.current;
    const el = car.current;
    if (!cv || !el) return;
    const g = cv.getContext("2d")!;
    let W = window.innerWidth;
    let H = window.innerHeight;
    let raf = 0;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio, 2);
      cv.width = W * dpr;
      cv.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const clampX = (x: number) => Math.min(W - MARGIN, Math.max(MARGIN, x));
    const clampY = (y: number) => Math.min(H - MARGIN, Math.max(MARGIN, y));
    const pickTarget = () => ({ x: MARGIN + Math.random() * (W - MARGIN * 2), y: MARGIN + Math.random() * (H - MARGIN * 2) });

    // Start in a lower corner, heading in
    const car_ = { x: W * 0.15, y: H * 0.8, heading: -0.6, move: -0.6, speed: 0 };
    let target = pickTarget();
    let cruise = 170;
    let last = performance.now();
    el.style.opacity = "1";

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dx = target.x - car_.x;
      const dy = target.y - car_.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 70) {
        target = pickTarget();
        cruise = 130 + Math.random() * 120;
      }
      // Steer the nose quickly; the car's actual travel follows more slowly: that lag is the drift.
      const want = Math.atan2(dy, dx);
      const steer = angleDiff(want, car_.heading);
      car_.heading += Math.sign(steer) * Math.min(Math.abs(steer), 3.4 * dt);
      const slipNow = angleDiff(car_.heading, car_.move);
      car_.move += slipNow * Math.min(1, 1.9 * dt);
      const slip = angleDiff(car_.heading, car_.move);
      // Slow down a little while sliding hard
      const targetSpeed = cruise * (1 - Math.min(0.45, Math.abs(slip) * 0.5));
      car_.speed += (targetSpeed - car_.speed) * Math.min(1, 2 * dt);

      const px = car_.x;
      const py = car_.y;
      car_.x += Math.cos(car_.move) * car_.speed * dt;
      car_.y += Math.sin(car_.move) * car_.speed * dt;
      // Never leave the window: bounce the target back inside if we hit an edge
      const cx = clampX(car_.x);
      const cy = clampY(car_.y);
      if (cx !== car_.x || cy !== car_.y) {
        car_.x = cx;
        car_.y = cy;
        target = pickTarget();
      }

      spin.current *= 0.93;
      const angle = car_.heading + spin.current;
      el.style.transform = `translate(${car_.x - 28}px, ${car_.y - 16}px) rotate(${angle}rad)`;
      if (bubble.current) bubble.current.style.transform = `translate(${car_.x}px, ${car_.y - 34}px) translateX(-50%)`;

      // Fade old marks, then tyre tracks while sliding, and a little dust
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "rgba(0,0,0,0.03)";
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
      const sliding = Math.abs(slip) > 0.18 || Math.abs(spin.current) > 0.3;
      if (sliding) {
        const nx = -Math.sin(angle) * 9;
        const ny = Math.cos(angle) * 9;
        const bx = -Math.cos(angle) * 14;
        const by = -Math.sin(angle) * 14;
        g.strokeStyle = `rgba(29,24,19,${Math.min(0.45, 0.15 + Math.abs(slip) * 0.4)})`;
        g.lineWidth = 3;
        g.lineCap = "round";
        for (const s of [1, -1]) {
          g.beginPath();
          g.moveTo(px + bx + nx * s, py + by + ny * s);
          g.lineTo(car_.x + bx + nx * s, car_.y + by + ny * s);
          g.stroke();
        }
        if (Math.random() < 0.4) {
          g.fillStyle = "rgba(240,226,198,0.55)";
          g.beginPath();
          g.arc(car_.x + bx * 1.6 + (Math.random() - 0.5) * 8, car_.y + by * 1.6 + (Math.random() - 0.5) * 8, 3 + Math.random() * 6, 0, Math.PI * 2);
          g.fill();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <canvas ref={marks} className="drift-marks" aria-hidden="true" />
      <button
        ref={car}
        type="button"
        className="drift-car"
        aria-label="The SIC rover. Tap it!"
        tabIndex={-1}
        onClick={() => {
          spin.current += Math.PI * 2;
          setSay(["vroom!", "beep beep", "can't catch me", "see you at Chronos"][Math.floor(Math.random() * 4)]);
          window.setTimeout(() => setSay(null), 1400);
        }}
      >
        <svg viewBox="0 0 56 32" aria-hidden="true">
          <rect x="6" y="2" width="9" height="6" rx="1.5" fill="#1d1813" />
          <rect x="6" y="24" width="9" height="6" rx="1.5" fill="#1d1813" />
          <rect x="38" y="2" width="9" height="6" rx="1.5" fill="#1d1813" />
          <rect x="38" y="24" width="9" height="6" rx="1.5" fill="#1d1813" />
          <rect x="3" y="6" width="48" height="20" rx="3" fill="#e2452b" stroke="#1d1813" strokeWidth="2.5" />
          <rect x="14" y="9" width="18" height="14" rx="2" fill="#fff3dc" stroke="#1d1813" strokeWidth="2" />
          <rect x="34" y="10" width="6" height="12" fill="#5fb4e0" stroke="#1d1813" strokeWidth="1.5" />
          <rect x="49" y="9" width="4" height="4" fill="#fff7c2" />
          <rect x="49" y="19" width="4" height="4" fill="#fff7c2" />
          <path d="M18 9 V2 h7 v4 h-7" fill="#f4b536" stroke="#1d1813" strokeWidth="1.5" />
        </svg>
      </button>
      <span ref={bubble} className={`drift-say ${say ? "is-on" : ""}`} aria-hidden="true">
        {say}
      </span>
    </>
  );
}
