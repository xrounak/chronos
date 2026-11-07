import type { ShowDay } from "./events";
import { FESTIVAL } from "./festival";

/** How long an event counts as "live" when sic.gecp.in gives no end time. */
const DEFAULT_LENGTH_MS = 2 * 60 * 60 * 1000;

const todayIST = (now: number) => new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Indexes (in day order, the same numbering the game uses) of events happening right now. */
export function liveEventIds(days: ShowDay[], now = Date.now()) {
  const ids: number[] = [];
  let id = 0;
  for (const d of days) {
    for (const e of d.events) {
      if (e.startsAt) {
        const start = new Date(e.startsAt).getTime();
        const end = e.endsAt ? new Date(e.endsAt).getTime() : start + DEFAULT_LENGTH_MS;
        if (now >= start && now < end) ids.push(id);
      }
      id++;
    }
  }
  return ids;
}

/** The festival right now: counting down, which day is on, or over. */
export function festivalStatus(days: ShowDay[], now = Date.now()) {
  const start = new Date(FESTIVAL.startsAt).getTime();
  const end = new Date(FESTIVAL.endsAt).getTime();
  if (now >= end) return { phase: "over" as const, text: "Thank you for Chronos 2026" };
  if (now >= start) {
    const i = days.findIndex((d) => d.isoDate === todayIST(now));
    if (i >= 0) return { phase: "live" as const, day: i, text: `Day ${i + 1} is on · ${days[i].title}` };
    return { phase: "live" as const, text: "Chronos is on" };
  }
  const s = Math.floor((start - now) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return { phase: "soon" as const, seconds: s, text: `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m to gates` };
}
