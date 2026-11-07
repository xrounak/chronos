"use client";

import { useState } from "react";
import type { ShowDay } from "@/lib/events";
import { ALL_EVENTS_URL } from "@/lib/events";
import { trackRegister } from "@/components/Tracked";

const DAY_COLORS = ["#f4b536", "#2453b3", "#e2452b"];
const KIND: Record<string, string> = { talk: "Talk", exhibition: "Exhibition", competition: "Competition", hackathon: "Hackathon", experience: "Experience" };
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;

/** The programme: one tab per day, that day's events as cards. */
export function DayTabs({ days }: { days: ShowDay[] }) {
  const [active, setActive] = useState(0);
  const d = days[active];
  if (!d) return null;
  return (
    <div className="programme" style={{ ["--day" as string]: DAY_COLORS[active] }}>
      <div className="day-tabs" role="tablist" aria-label="Festival days">
        {days.map((day, i) => (
          <button
            key={day.number}
            type="button"
            role="tab"
            id={`tab-${day.number}`}
            aria-selected={i === active}
            aria-controls="day-panel"
            className="day-tab"
            style={{ ["--day" as string]: DAY_COLORS[i] }}
            onClick={() => setActive(i)}
          >
            <span className="day-tab-num">{i + 1}</span>
            <span className="flex flex-col items-start">
              <span className="day-tab-title">{day.title}</span>
              <span className="label text-[0.55rem] opacity-70">{day.date.split(" · ")[0]}</span>
            </span>
          </button>
        ))}
      </div>

      <div id="day-panel" role="tabpanel" aria-labelledby={`tab-${d.number}`} className="day-panel-lite" key={d.number}>
        <div className="day-head">
          <p className="day-line">{d.line}</p>
          <p className="day-body">{d.body}</p>
        </div>
        <div className="event-grid">
          {d.events.map((e) => (
            <article key={e.name} className="lite-card event-tile">
              {e.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/photos/${e.photo}`} alt="" className="event-tile-photo" loading="lazy" />
              ) : (
                <div className="event-tile-photo event-tile-blank" aria-hidden="true">
                  {e.name.slice(0, 1)}
                </div>
              )}
              <p className="label text-[0.6rem]">{KIND[e.kind] ?? "Event"}</p>
              <h3 className="event-tile-title">{e.name}</h3>
              <p className="label text-[0.58rem] opacity-70">{[e.venue, time(e.startsAt), e.team].filter(Boolean).join(" · ")}</p>
              {e.registerUrl ? (
                <a href={e.registerUrl} className="sticker event-tile-cta" onClick={() => trackRegister(e.name, "lite-day")}>
                  Register →
                </a>
              ) : (
                <a href={ALL_EVENTS_URL} className="sticker sticker-quiet event-tile-cta">
                  Opens soon
                </a>
              )}
            </article>
          ))}
        </div>
        <p className="day-closer-line">{d.closer}</p>
      </div>
    </div>
  );
}
