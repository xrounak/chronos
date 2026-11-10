import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CHAPTERS, FESTIVAL, FINAL_FRAME } from "@/lib/festival";
import { ALL_EVENTS_URL, getFestival, MAIN_SITE, SITE_URL } from "@/lib/events";
import { CutLetters } from "@/components/Cutouts";
import { IslandMap } from "@/components/lite/IslandMap";
import { DayTabs } from "@/components/lite/DayTabs";
import { DriftCar } from "@/components/lite/DriftCar";
import { LiteCountdown, PopIn, TowerClock } from "@/components/lite/LiteBits";
import { TrackedLink } from "@/components/Tracked";
import { Credit } from "@/components/Credit";

/** Re-read the programme from sic.gecp.in every five minutes. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Lite version",
  description: "Chronos 2026 in 2D: the programme for all three days, the island map and registration links. GEC Palamu, 11 to 13 December.",
  alternates: { canonical: `${SITE_URL}/lite` },
};

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
  const eventCount = days.reduce((n, d) => n + d.events.length, 0);

  return (
    <div className="lite">
      <PopIn />
      <DriftCar />

      <header className="lite-header">
        <a href="#top" className="lite-brand" aria-label="CHRONOS 2026, back to the top">
          <span className="display">Chronos</span>
          <span className="label">{FESTIVAL.year}</span>
        </a>
        <nav className="lite-nav" aria-label="Sections">
          <a href="#programme" className="chip max-md:hidden">
            Programme
          </a>
          <a href="#map" className="chip max-md:hidden">
            Map
          </a>
          <Link href="/" className="chip">
            Play 3D
          </Link>
          <a href="#programme" className="chip chip-solid">
            Events
          </a>
        </nav>
      </header>

      {/* ---------------------------------------------------------------- Hero */}
      <section id="top" className="lite-hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="label hero-kicker">Science &amp; Innovation Club · GEC Palamu presents</p>
            <h1 className="sr-only">
              CHRONOS {FESTIVAL.year}: {FESTIVAL.tagline}
            </h1>
            <CutLetters text={FESTIVAL.name} className="hero-letters" />
            <p className="display paper-strip hero-tagline">{FESTIVAL.tagline}</p>
            <p className="hero-lead">Three days of talks, builds, races and robot fights. Pick your events and register on the SIC website.</p>
            <div className="hero-actions">
              <a href="#programme" className="sticker sticker-big">
                See the programme →
              </a>
              <Link href="/" className="chip">
                Explore in 3D
              </Link>
            </div>
          </div>
          <aside className="hero-ticket" aria-label="When and where">
            <p className="label">Gates open in</p>
            <LiteCountdown days={days} />
            <dl className="hero-facts">
              <div>
                <dt className="label">When</dt>
                <dd>{FESTIVAL.dates}</dd>
              </div>
              <div>
                <dt className="label">Where</dt>
                <dd>{FESTIVAL.place}</dd>
              </div>
              <div>
                <dt className="label">What</dt>
                <dd>
                  {eventCount} events · 3 days
                </dd>
              </div>
            </dl>
          </aside>
        </div>
        <div className="hero-ground" aria-hidden="true">
          <TowerClock />
          <Hills />
        </div>
      </section>

      {/* --------------------------------------------------------------- Story */}
      <section id="story" className="lite-band band-grass">
        <div className="lite-inner">
          <div className="section-head">
            <p className="band-kicker">Why Chronos</p>
            <h2 className="band-title">Earned, never given.</h2>
          </div>
          <ol className="story-line">
            {STORY.map(({ n, c, color }) => (
              <li key={n} className="lite-card story-card" data-pop style={{ ["--day" as string]: color }}>
                <span className="story-num" aria-hidden="true">
                  {n}
                </span>
                <p className="label text-[0.62rem]">{c.label}</p>
                <h3 className="lite-card-title">{c.title}</h3>
                {"lead" in c && c.lead && <p className="font-semibold leading-snug">{c.lead}</p>}
                <p className="text-[0.95rem] leading-relaxed opacity-80">{c.paragraphs[0]}</p>
                <p className="story-closer">{c.closer}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- Programme */}
      <section id="programme" className="lite-band band-paper">
        <div className="lite-inner">
          <div className="section-head">
            <p className="band-kicker">The programme</p>
            <h2 className="band-title">Three days. {eventCount} events.</h2>
            <p className="band-lead">Pick a day. Every event registers on sic.gecp.in, where you sign in with Google.</p>
          </div>
          <DayTabs days={days} />
        </div>
      </section>

      {/* ----------------------------------------------------------------- Map */}
      <section id="map" className="lite-band band-water">
        <div className="lite-inner">
          <div className="section-head">
            <p className="band-kicker band-kicker-light">The island</p>
            <h2 className="band-title band-title-light">One track. Three days.</h2>
            <p className="band-lead band-lead-light">The same island as the 3D version. Tap an event on the map.</p>
          </div>
          <IslandMap days={days} />
        </div>
      </section>

      {/* --------------------------------------------------------- Final frame */}
      <section id="final" className="lite-final">
        <p className="label text-[0.65rem] text-gold">{CHAPTERS.epilogue.title}</p>
        <div className="flex flex-col gap-1">
          {FINAL_FRAME.map((line, i) => (
            <p key={line} className={`display final-line ${i === 1 ? "gold-text" : ""}`}>
              {line}
            </p>
          ))}
        </div>
        <TrackedLink href={ALL_EVENTS_URL} event="all" from="lite-ticket" className="ticket">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/collage/ticket.svg" alt="See all Chronos events on sic.gecp.in" draggable={false} />
        </TrackedLink>
        <div className="hero-actions">
          <TrackedLink href={ALL_EVENTS_URL} event="all" from="lite-final" className="sticker sticker-big">
            See all events →
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
          <Credit />
          <a href={ALL_EVENTS_URL} className="label text-[0.62rem] opacity-70 hover:opacity-100">
            All events on sic.gecp.in →
          </a>
        </footer>
      </section>
    </div>
  );
}
