"use client";

import { useEffect, useState } from "react";
import type { ShowDay } from "@/lib/events";
import { FESTIVAL } from "@/lib/festival";
import { festivalStatus } from "@/lib/live";

/** Countdown as four paper chips; "Day 2 is on" during the festival. */
export function LiteCountdown({ days }: { days: ShowDay[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const start = new Date(FESTIVAL.startsAt).getTime();
  const end = new Date(FESTIVAL.endsAt).getTime();
  if (now !== null && now >= start) {
    return <p className="chip chip-solid">{now < end ? festivalStatus(days, now).text : "Thank you for Chronos 2026"}</p>;
  }
  const s = now === null ? 0 : Math.max(0, Math.floor((start - now) / 1000));
  const parts: Array<[string, number]> = [
    ["Days", Math.floor(s / 86400)],
    ["Hours", Math.floor((s % 86400) / 3600)],
    ["Min", Math.floor((s % 3600) / 60)],
    ["Sec", s % 60],
  ];
  return (
    <div className="count-row" role="timer" aria-label="Time until Chronos begins">
      {parts.map(([label, v], i) => (
        <div key={label} className="count-chip" style={{ rotate: `${[-3, 2, -2, 3][i]}deg` }}>
          <span suppressHydrationWarning>{now === null ? "--" : String(v).padStart(2, "0")}</span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

/** The flat clock tower in the hero; its hands show the time in India. */
export function TowerClock() {
  const [t, setT] = useState<{ h: number; m: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + 5.5 * 3600 * 1000);
      setT({ h: d.getUTCHours() % 12, m: d.getUTCMinutes() + d.getUTCSeconds() / 60 });
    };
    tick();
    const id = window.setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);
  const hr = t ? ((t.h + t.m / 60) / 12) * 360 : 300;
  const mn = t ? (t.m / 60) * 360 : 0;
  return (
    <svg viewBox="0 0 120 300" className="tower" aria-hidden="true">
      <rect x="18" y="286" width="96" height="14" fill="#1d1813" />
      <rect x="10" y="280" width="96" height="14" fill="#efe1c4" stroke="#1d1813" strokeWidth="3" />
      <rect x="34" y="126" width="56" height="160" fill="#1d1813" />
      <rect x="28" y="120" width="56" height="160" fill="#c7553a" stroke="#1d1813" strokeWidth="3" />
      {[150, 190, 230].map((y) => (
        <rect key={y} x="48" y={y} width="16" height="22" fill="#1d1813" opacity="0.35" />
      ))}
      <rect x="22" y="110" width="68" height="12" fill="#1d1813" />
      <rect x="26" y="56" width="60" height="56" fill="#f4ecdd" stroke="#1d1813" strokeWidth="3" />
      <path d="M18 58 L56 8 L94 58 Z" fill="#2453b3" stroke="#1d1813" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="56" cy="8" r="5" fill="#f4b536" stroke="#1d1813" strokeWidth="2.5" />
      <circle cx="56" cy="84" r="21" fill="#fff3dc" stroke="#1d1813" strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={56 + Math.cos(a) * 16} cy={84 + Math.sin(a) * 16} r={i % 3 === 0 ? 2 : 1} fill="#1d1813" />;
      })}
      <line x1="56" y1="84" x2="56" y2="72" stroke="#1d1813" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${hr} 56 84)`} />
      <line x1="56" y1="84" x2="56" y2="66" stroke="#e2452b" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${mn} 56 84)`} />
    </svg>
  );
}

/** Pieces marked data-pop slap onto the page as they scroll into view. */
export function PopIn() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-pop]");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((e) => e.classList.add("is-in"));
      return;
    }
    document.documentElement.classList.add("pop-ready");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            io.unobserve(en.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
