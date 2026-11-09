"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { trackRegister } from "@/components/Tracked";
import { liveEventIds } from "@/lib/live";
import { ISLAND_A, ISLAND_B, shorePath } from "@/lib/island";
import type { ShowDay } from "@/lib/events";
import { ALL_EVENTS_URL } from "@/lib/events";

/**
 * The 3D island drawn flat: the same straight track from the start gate to the clock
 * tower, with a branch to each day. Each event is a pin you can tap.
 * Layout numbers match components/game/engine.ts.
 */

const DAY_COLORS = ["#f4b536", "#2453b3", "#e2452b"];
const SAND = shorePath(1);
const GRASS = shorePath(0.9);
/** The coast loop road (keep in step with RING_K in the game engine). */
const LOOP = shorePath(0.84);
const VB = 1.1;
const START_Z = 155;
const TOWER_Z = -150;
const JUNCTION_Z = [90, 0, -90];
const SIDE = [-1, 1, -1];
const BRANCH_LEN = 70;
const PLAZA = 27;
const KIND: Record<string, string> = { talk: "Talk", exhibition: "Exhibition", competition: "Competition", hackathon: "Hackathon", experience: "Experience" };
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;

export function IslandMap({ days }: { days: ShowDay[] }) {
  const pins = useMemo(() => {
    let id = 0;
    return days.flatMap((d, day) => {
      const cx = SIDE[day] * BRANCH_LEN;
      const cz = JUNCTION_Z[day];
      const out = SIDE[day] < 0 ? Math.PI : 0;
      return d.events.map((e, i, list) => {
        const spread = list.length > 1 ? (i / (list.length - 1) - 0.5) * Math.PI * 1.25 : 0;
        const a = out + spread;
        return { ...e, id: id++, day, dayTitle: d.title, dayNumber: d.number, date: d.date, x: cx + Math.cos(a) * 11, z: cz + Math.sin(a) * 11 };
      });
    });
  }, [days]);

  const [sel, setSel] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  useEffect(() => {
    const tick = () => setLive(liveEventIds(days));
    tick();
    const id = window.setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [days]);
  const cur = pins[sel];

  return (
    <div className="map-wrap">
      <svg viewBox={`${-ISLAND_A * VB - 8} ${-ISLAND_B * VB - 8} ${(ISLAND_A * VB + 8) * 2} ${(ISLAND_B * VB + 8) * 2}`} className="island-svg" role="img" aria-label="Map of the Chronos island with every event">
        <path d={SAND} fill="#1d1813" transform="translate(5 5)" />
        <path d={SAND} fill="#f0d29a" stroke="#1d1813" strokeWidth="3" strokeLinejoin="round" />
        <path d={GRASS} fill="#7fbf4d" />
        {/* the coast loop road */}
        <path d={LOOP} fill="none" stroke="#3b3430" strokeWidth="10" strokeLinejoin="round" />
        <path d={LOOP} fill="none" stroke="#fff3dc" strokeWidth="1" strokeDasharray="4 6" />
        {/* track and branches */}
        <line x1="0" y1={START_Z} x2="0" y2={TOWER_Z} stroke="#3b3430" strokeWidth="9" strokeLinecap="round" />
        <line x1="0" y1={START_Z - 10} x2="0" y2={TOWER_Z + 10} stroke="#fff3dc" strokeWidth="1.2" strokeDasharray="5 7" />
        {JUNCTION_Z.map((z, d) => (
          <line key={d} x1="0" y1={z} x2={SIDE[d] * BRANCH_LEN} y2={z} stroke="#3b3430" strokeWidth="7.5" />
        ))}
        {JUNCTION_Z.map((z, d) => (
          <g key={`p${d}`}>
            <circle cx={SIDE[d] * BRANCH_LEN} cy={z} r={PLAZA} fill="#efe1c4" stroke="#1d1813" strokeWidth="2" />
            <circle cx={SIDE[d] * BRANCH_LEN} cy={z} r={PLAZA} fill={DAY_COLORS[d]} opacity="0.25" />
          </g>
        ))}
        {/* start and tower */}
        <circle cy={START_Z} r="14" fill="#efe1c4" stroke="#1d1813" strokeWidth="2" />
        <text y={START_Z + 4} textAnchor="middle" className="map-small">
          START
        </text>
        <circle cy={TOWER_Z} r="18" fill="#efe1c4" stroke="#1d1813" strokeWidth="2" />
        <rect x="-7" y={TOWER_Z - 7} width="14" height="14" fill="#c7553a" stroke="#1d1813" strokeWidth="2" />
        <circle cy={TOWER_Z} r="4" fill="#fff3dc" stroke="#1d1813" strokeWidth="1.2" />
        <text y={TOWER_Z - 26} textAnchor="middle" className="map-word">
          CHRONOS
        </text>
        {/* big day numbers beside each plaza */}
        {JUNCTION_Z.map((z, d) => {
          const x = SIDE[d] * (BRANCH_LEN + PLAZA + 4) - SIDE[d] * 2;
          const y = z - PLAZA - 6;
          return (
            <g key={`n${d}`}>
              <circle cx={x + 2} cy={y + 2} r="11" fill="#1d1813" />
              <circle cx={x} cy={y} r="11" fill={DAY_COLORS[d]} stroke="#1d1813" strokeWidth="2" />
              <text x={x} y={y + 5} textAnchor="middle" className="map-num" fill={d === 0 ? "#1d1813" : "#fff3dc"}>
                {d + 1}
              </text>
            </g>
          );
        })}
        {pins.map((p) => (
          <g
            key={p.id}
            className={`map-pin ${p.id === sel ? "is-on" : ""} ${live.includes(p.id) ? "is-live" : ""}`}
            transform={`translate(${p.x.toFixed(2)} ${p.z.toFixed(2)})`}
            onClick={() => setSel(p.id)}
            role="button"
            tabIndex={0}
            aria-label={`${p.name}, day ${p.day + 1}`}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(p.id))}
          >
            <circle r="10" fill="transparent" />
            <circle className="map-pin-ring" r="7" fill="none" stroke="#fff3dc" strokeWidth="2" />
            <circle r="4.6" fill={DAY_COLORS[p.day]} stroke="#1d1813" strokeWidth="1.6" />
          </g>
        ))}
      </svg>

      {cur && (
        <div className="map-side">
          <article className="lite-card map-card" style={{ ["--day" as string]: DAY_COLORS[cur.day] }} aria-live="polite">
            {cur.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/photos/${cur.photo}`} alt="" className="lite-photo" loading="lazy" />
            )}
            <p className="label text-[0.62rem]">
              {live.includes(cur.id) && <span className="live-badge">Live now</span>}
              Day {cur.dayNumber} · {KIND[cur.kind] ?? "Event"}
            </p>
            <h3 className="lite-card-title">{cur.name}</h3>
            <p className="label text-[0.62rem] opacity-70">{[cur.venue, cur.date.split(" · ")[0], time(cur.startsAt), cur.team].filter(Boolean).join(" · ")}</p>
            {cur.summary && <p className="text-sm leading-relaxed">{cur.summary}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {cur.registerUrl ? (
                <a href={cur.registerUrl} className="sticker" onClick={() => trackRegister(cur.name, "lite-map")}>
                  Register →
                </a>
              ) : (
                <a href={ALL_EVENTS_URL} className="sticker sticker-quiet">
                  Opens soon
                </a>
              )}
              {cur.detailsUrl && (
                <a href={cur.detailsUrl} className="chip" target="_blank" rel="noopener noreferrer">
                  Rule book
                </a>
              )}
              <Link href="/" className="chip">
                See it in 3D
              </Link>
            </div>
          </article>
          <nav className="map-legend" aria-label="All events">
            {days.map((d, di) => (
              <div key={d.number} className="map-legend-day">
                <p className="label" style={{ color: di === 0 ? "#8a5a00" : DAY_COLORS[di] }}>
                  Day {di + 1}
                </p>
                {pins
                  .filter((p) => p.day === di)
                  .map((p) => (
                    <button key={p.id} type="button" onClick={() => setSel(p.id)} aria-pressed={p.id === sel} style={{ ["--day" as string]: DAY_COLORS[di] }}>
                      {p.name}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
