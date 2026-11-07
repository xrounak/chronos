"use client";

import { useEffect, useState } from "react";
import { FESTIVAL } from "@/lib/festival";

const start = new Date(FESTIVAL.startsAt).getTime();
const end = new Date(FESTIVAL.endsAt).getTime();

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    ["Days", Math.floor(s / 86400)],
    ["Hours", Math.floor((s % 86400) / 3600)],
    ["Minutes", Math.floor((s % 3600) / 60)],
    ["Seconds", s % 60],
  ] as const;
}

/** Ticks down to the opening of the gates; "Live now" during the festival. */
export function Countdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (now !== null && now >= start) {
    return <p className="label text-gold-hi">{now < end ? "Live now · Gates are open" : "Thank you for being part of Chronos 2026"}</p>;
  }
  return (
    <div className="flex items-end gap-5 sm:gap-8" role="timer" aria-label="Time until Chronos begins">
      {parts(now === null ? start - start : start - now).map(([label, value], i) => (
        <div key={label} className="flex items-end gap-5 sm:gap-8">
          {i > 0 && <span className="mb-5 h-6 w-px bg-paper/20" aria-hidden="true" />}
          <div className="flex flex-col items-center">
            <span className="font-display text-3xl font-bold tabular-nums sm:text-5xl" suppressHydrationWarning>
              {now === null ? "--" : String(value).padStart(2, "0")}
            </span>
            <span className="label mt-2 text-[0.6rem] text-muted">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
