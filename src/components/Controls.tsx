"use client";

import { useEffect, useRef, useState } from "react";
import type { ShowDay } from "@/lib/events";
import { ALL_EVENTS_URL } from "@/lib/events";
import { CHAPTER_IDS, CHAPTER_LABELS, story } from "@/lib/story";
import { armSound, cue, isSoundOn, onSoundChange, setSound } from "./sound";

const OPEN = "chronos:register";

/** Any "Register" button: opens the event picker. */
export function RegisterButton({ className = "cta", children = "Register now" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        cue("click");
        window.dispatchEvent(new Event(OPEN));
      }}
    >
      {children}
      <span aria-hidden="true">→</span>
    </button>
  );
}

/** The entry pass from the scrapbook, as the big call to action. */
export function RegisterTicket() {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label="Register: choose your events"
        className="group w-[min(34rem,88vw)] -rotate-2 transition-transform duration-300 hover:-translate-y-1.5 hover:rotate-0 focus-visible:rotate-0"
        onClick={() => {
          cue("click");
          window.dispatchEvent(new Event(OPEN));
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/collage/ticket.svg" alt="" className="w-full drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]" draggable={false} />
      </button>
      <span className="label text-[0.62rem] text-muted">Tap the pass to register</span>
    </div>
  );
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;

/** The event picker: every event, by day, each linking to its form on sic.gecp.in. */
export function RegisterDialog({ days }: { days: ShowDay[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = () => dialog.current?.showModal();
    window.addEventListener(OPEN, open);
    return () => window.removeEventListener(OPEN, open);
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="register-title"
      className="m-auto max-h-[88dvh] w-[min(46rem,94vw)] overflow-y-auto border border-paper/15 bg-ink-2/95 p-0 text-paper backdrop:bg-black/75 backdrop:backdrop-blur-sm"
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <div className="flex flex-col gap-8 p-6 sm:p-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="label text-gold">Choose your chapter</p>
            <h2 id="register-title" className="display mt-3 text-3xl sm:text-4xl">
              Register
            </h2>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="ghost" aria-label="Close">
            ✕
          </button>
        </div>
        {days.map((d) => (
          <section key={d.number} className="flex flex-col">
            <p className="label mb-3 text-muted">
              Day {d.number} · {d.title} · {d.date}
            </p>
            {d.events.map((e) => (
              <div key={e.name} className="event-row">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold">{e.name}</p>
                  <p className="label mt-1 text-[0.62rem] text-muted">
                    {[e.venue, time(e.startsAt), e.team].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {e.registerUrl ? (
                  <a className="ghost" href={e.registerUrl}>
                    Register →
                  </a>
                ) : (
                  <span className="label text-[0.62rem] text-subtle">Opens soon</span>
                )}
              </div>
            ))}
          </section>
        ))}
        <p className="text-sm text-muted">
          Registration and team-making happen on the SIC website. You sign in with Google there.{" "}
          <a href={ALL_EVENTS_URL} className="text-gold-hi underline underline-offset-4">
            See all events on sic.gecp.in
          </a>
        </p>
      </div>
    </dialog>
  );
}

/** Sound on/off. Remembers the choice; browsers still need a click before sound plays. */
export function SoundToggle({ className = "ghost" }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isSoundOn());
    const off = onSoundChange(setOn);
    const disarm = armSound();
    return () => {
      off();
      disarm();
    };
  }, []);
  return (
    <button type="button" className={className} aria-pressed={on} onClick={() => void setSound(!on)}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i
            key={i}
            className="w-[2px] bg-current"
            style={{ height: on ? undefined : 3, animation: on ? `eq 0.9s ${i * 0.12}s ease-in-out infinite alternate` : undefined }}
          />
        ))}
      </span>
      <span className="sound-label">Sound {on ? "on" : "off"}</span>
    </button>
  );
}

/** Chapter list on the right edge: shows where you are, jumps on click. */
export function ChapterRail() {
  const [active, setActive] = useState(0);
  useEffect(() => story.onChapter(setActive), []);
  return (
    <nav aria-label="Chapters" className="rail fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
      {CHAPTER_IDS.map((id, i) => (
        <a
          key={id}
          href={`#${id}`}
          aria-current={active === i}
          onClick={(e) => {
            if (!story.scrollTo) return;
            e.preventDefault();
            story.scrollTo(`#${id}`);
          }}
        >
          <span>{CHAPTER_LABELS[i]}</span>
        </a>
      ))}
    </nav>
  );
}
