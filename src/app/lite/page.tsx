import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CHAPTERS, FESTIVAL, FINAL_FRAME } from "@/lib/festival";
import { ALL_EVENTS_URL, getFestival, MAIN_SITE, SITE_URL } from "@/lib/events";
import { CutLetters } from "@/components/Cutouts";
import { IslandMap } from "@/components/lite/IslandMap";
import { LiteCountdown, PopIn, TowerClock } from "@/components/lite/LiteBits";
import { TrackedLink } from "@/components/Tracked";

/** Re-read the programme from sic.gecp.in every five minutes. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Lite version",
  description: "Chronos 2026 in 2D: the island map, the story and all three days of events at GEC Palamu, with registration links.",
  alternates: { canonical: `${SITE_URL}/lite` },
};

const DAY_COLORS = ["#f4b536", "#2453b3", "#e2452b"];
const KIND: Record<string, string> = { talk: "Talk", exhibition: "Exhibition", competition: "Competition", hackathon: "Hackathon", experience: "Experience" };
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;

const STORY = [
  { n: "00", c: CHAPTERS.prologue, color: "#f4b536" },
  { n: "01", c: CHAPTERS.grind, color: "#2453b3" },
  { n: "02", c: CHAPTERS.arrival, color: "#e2452b" },
];

function Hills() {
  return (
    <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="hills" aria-hidden="true">
      <path d="M0 110 C 220 60 380 70 560 105 S 900 55 1080 95 S 1340 70 1440 95 V200 H0 Z" fill="#4f9a45" stroke="#1d1813" strokeWidth="3" />
      <path d="M0 150 C 260 115 460 130 700 148 S 1100 118 1440 140 V200 H0 Z" fill="#7fbf4d" stroke="#1d1813" strokeWidth="3" />
    </svg>
  );
}

export default async function LitePage() {
  const days = await getFestival();
  return (
    <div className="lite">
      <PopIn />
      <header className="lite-header">
        <a href="#top" className="lite-brand" aria-label="CHRONOS 2026, back to the top">
          <span className="display">Chronos</span>
          <span className="label">{FESTIVAL.year}</span>
        </a>
        <nav className="lite-nav" aria-label="Sections">
          <a href="#map" className="chip max-md:hidden">
            Map
          </a>
          <a href="#days" className="chip max-md:hidden">
            Events
          </a>
          <Link href="/" className="chip">
            Play 3D
          </Link>
          <a href="#days" className="chip chip-solid">
            Register
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section id="top" className="lite-hero">
        <div className="hero-copy">
          <p className="label hero-kicker">Science &amp; Innovation Club · GEC Palamu presents</p>
          <h1 className="sr-only">
            CHRONOS {FESTIVAL.year}: {FESTIVAL.tagline}
          </h1>
          <CutLetters text={FESTIVAL.name} className="hero-letters" />
          <p className="display paper-strip hero-tagline">{FESTIVAL.tagline}</p>
          <p className="label hero-date">
            {FESTIVAL.dates} · {FESTIVAL.place}
          </p>
          <LiteCountdown days={days} />
          <div className="hero-actions">
            <a href="#days" className="sticker sticker-big">
              Register now →
            </a>
            <Link href="/" className="chip">
              Explore in 3D
            </Link>
          </div>
        </div>
        <div className="hero-ground" aria-hidden="true">
          <TowerClock />
          <Hills />
        </div>
      </section>

      {/* Story */}
      <section id="story" className="lite-band band-grass">
        <div className="lite-inner">
          <p className="band-kicker">The story</p>
          <div className="story-grid">
            {STORY.map(({ n, c, color }) => (
              <article key={n} className="lite-card story-card" data-pop style={{ ["--day" as string]: color }}>
                <span className="story-num" aria-hidden="true">
                  {n}
                </span>
                <p className="label text-[0.62rem]">{c.label}</p>
                <h2 className="lite-card-title">{c.title}</h2>
                {"lead" in c && c.lead && <p className="font-semibold leading-snug">{c.lead}</p>}
                <p className="text-[0.95rem] leading-relaxed opacity-80">{c.paragraphs[0]}</p>
                <p className="story-closer">{c.closer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Map */}
      <section id="map" className="lite-band band-water">
        <div className="lite-inner">
          <p className="band-kicker band-kicker-light">The island</p>
          <h2 className="band-title band-title-light">One track. Three days.</h2>
          <p className="band-lead band-lead-light">Tap an event on the map to see it and register.</p>
          <IslandMap days={days} />
        </div>
      </section>

      {/* Days */}
      <div id="days">
        {days.map((d, di) => (
          <section key={d.number} className={`lite-band band-day band-day-${di + 1}`} aria-labelledby={`day-${d.number}`}>
            <div className="lite-inner day-grid">
              <div className="day-intro" data-pop>
                <p className="band-kicker">
                  Day {d.number} · {d.date}
                </p>
                <h2 id={`day-${d.number}`} className="band-title">
                  <span className="day-big" aria-hidden="true">
                    {di + 1}
                  </span>
                  {d.title}
                </h2>
                <p className="band-lead font-semibold">{d.line}</p>
                <p className="band-lead">{d.body}</p>
              </div>
              <div className="day-events">
                {d.events.map((e) => (
                  <article key={e.name} className="lite-card event-card" data-pop style={{ ["--day" as string]: DAY_COLORS[di] }}>
                    {e.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/photos/${e.photo}`} alt="" className="lite-photo event-photo" loading="lazy" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="label text-[0.6rem]">{KIND[e.kind] ?? "Event"}</p>
                      <h3 className="lite-card-title event-title">{e.name}</h3>
                      <p className="label mt-1 text-[0.58rem] opacity-70">{[e.venue, time(e.startsAt), e.team].filter(Boolean).join(" · ")}</p>
                    </div>
                    {e.registerUrl ? (
                      <TrackedLink href={e.registerUrl} event={e.name} from="lite-day" className="sticker">
                        Register
                      </TrackedLink>
                    ) : (
                      <a href={ALL_EVENTS_URL} className="sticker sticker-quiet">
                        Soon
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Epilogue */}
      <section id="epilogue" className="lite-band band-paper">
        <div className="lite-inner epilogue">
          <p className="band-kicker">{CHAPTERS.epilogue.label}</p>
          <h2 className="band-title">{CHAPTERS.epilogue.title}</h2>
          <p className="band-lead">{CHAPTERS.epilogue.paragraphs[1]}</p>
          <a href={ALL_EVENTS_URL} className="ticket" data-pop aria-label="Register: see all Chronos events on sic.gecp.in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/collage/ticket.svg" alt="" draggable={false} />
          </a>
        </div>
      </section>

      {/* Final frame */}
      <section id="final" className="lite-final">
        <div className="flex flex-col gap-1">
          {FINAL_FRAME.map((line, i) => (
            <p key={line} className={`display final-line ${i === 1 ? "gold-text" : ""}`}>
              {line}
            </p>
          ))}
        </div>
        <p className="display final-tag">{FESTIVAL.tagline}</p>
        <div className="hero-actions">
          <TrackedLink href={ALL_EVENTS_URL} event="all" from="lite-final" className="sticker sticker-big">
            Register now →
          </TrackedLink>
          <Link href="/" className="chip">
            Play the 3D island
          </Link>
        </div>
        <footer className="lite-footer">
          <a href={MAIN_SITE} className="flex items-center gap-3 text-left">
            <Image src="/logo.png" alt="" width={36} height={36} className="rounded-full" />
            <span className="flex flex-col">
              <span className="label text-[0.58rem] opacity-60">Organised by</span>
              <span className="text-sm">{FESTIVAL.organiser}</span>
            </span>
          </a>
          <a href={ALL_EVENTS_URL} className="label text-[0.62rem] opacity-70 hover:opacity-100">
            All events on sic.gecp.in →
          </a>
        </footer>
      </section>
    </div>
  );
}
