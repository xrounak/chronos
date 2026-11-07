"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShowDay, ShowEvent } from "@/lib/events";
import { ALL_EVENTS_URL } from "@/lib/events";
import { FESTIVAL, FINAL_FRAME } from "@/lib/festival";
import { CutLetters } from "@/components/Cutouts";
import { RegisterDialog, SoundToggle } from "@/components/Controls";
import { cue } from "@/components/sound";
import { trackRegister } from "@/components/Tracked";
import { festivalStatus, liveEventIds } from "@/lib/live";
import { formatTime, submitRun, topRuns, type Run } from "@/lib/leaderboard";
import type { WorldHandle, ZoneDef } from "./engine";
import { startGameAudio } from "./audio";
import { canSharePhoto, composePhoto, downloadPhoto, sharePhoto } from "./photo";

const DAY_COLORS = ["#f4b536", "#2453b3", "#e2452b"];
const KIND: Record<string, string> = {
  talk: "Talk",
  exhibition: "Exhibition",
  competition: "Competition",
  hackathon: "Hackathon",
  experience: "Experience",
  workshop: "Workshop",
  seminar: "Seminar",
};
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;

type Flat = ShowEvent & { id: number; day: number; dayTitle: string; dayNumber: string; date: string };

/** Countdown text, then "Day 2 is on" during the festival. */
function useCountdown(days: ShowDay[]) {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLeft(festivalStatus(days).text);
    tick();
    const id = window.setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [days]);
  return left;
}

type GameAudio = ReturnType<typeof startGameAudio>;

const TIMES: Array<{ id: string; label: string; hour: number | null }> = [
  { id: "auto", label: "Live", hour: null },
  { id: "morning", label: "Dawn", hour: 6.6 },
  { id: "day", label: "Day", hour: 13 },
  { id: "sunset", label: "Dusk", hour: 18.2 },
  { id: "night", label: "Night", hour: 22 },
];

/** Touch joystick: drag anywhere in the pad; up is throttle, sideways steers. */
function Joystick({ world }: { world: React.RefObject<WorldHandle | null> }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (pointer.current !== e.pointerId || !pad.current) return;
    const r = pad.current.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - r.left - R) / R;
    let y = (e.clientY - r.top - R) / R;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    setKnob({ x, y });
    if (world.current) {
      world.current.input.x = Math.abs(x) < 0.12 ? 0 : x;
      world.current.input.y = Math.abs(y) < 0.12 ? 0 : -y;
    }
  };
  const end = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    if (world.current) {
      world.current.input.x = 0;
      world.current.input.y = 0;
    }
  };
  return (
    <div
      ref={pad}
      className="joy"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-hidden="true"
    >
      <span style={{ transform: `translate(${knob.x * 70}%, ${knob.y * 70}%)` }} />
    </div>
  );
}

export function World({ days }: { days: ShowDay[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const world = useRef<WorldHandle | null>(null);
  const mapDialog = useRef<HTMLDialogElement>(null);

  const events = useMemo<Flat[]>(() => {
    let id = 0;
    return days.flatMap((d, day) => d.events.map((e) => ({ ...e, id: id++, day, dayTitle: d.title, dayNumber: d.number, date: d.date })));
  }, [days]);

  const [status, setStatus] = useState<"loading" | "ready" | "playing" | "nogl">("loading");
  const [zone, setZone] = useState<number | null>(null);
  const [visited, setVisited] = useState<Set<number>>(() => new Set());
  const [gears, setGears] = useState({ n: 0, total: 0 });
  const [touch, setTouch] = useState(false);
  const [finale, setFinale] = useState<"hidden" | "shown" | "done">("hidden");
  const [, setGuide] = useState<{ day: number; text: string } | null>(null);
  const [live, setLive] = useState<number[]>([]);
  const [slow, setSlow] = useState<"no" | "yes" | "dismissed">("no");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photo, setPhoto] = useState<{ blob?: Blob; url?: string; share: boolean } | null>(null);
  const [flash, setFlash] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState(0.35);
  const [timeMode, setTimeMode] = useState<string>("auto");
  const [arrowOn, setArrowOn] = useState(true);
  const [finishSec, setFinishSec] = useState<number | null>(null);
  const [board, setBoard] = useState<Run[] | null>(null);
  const [runName, setRunName] = useState("");
  const [runState, setRunState] = useState<{ place?: number; error?: string; busy?: boolean }>({});
  const startedAt = useRef<number | null>(null);
  const [assisted, setAssisted] = useState(false);
  const audio = useRef<GameAudio | null>(null);
  const countdown = useCountdown(days);

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    let handle: WorldHandle | null = null;
    let cancelled = false;
    const test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) {
      setStatus("nogl");
      return;
    }
    // Wait for the web fonts: the 3D signs are drawn with them once.
    Promise.all([import("./engine"), document.fonts?.ready.catch(() => undefined)])
      .then(([{ startWorld }]) => {
        if (cancelled || !canvas.current) return;
        const zones: ZoneDef[] = events.map((e) => ({
          id: e.id,
          day: e.day,
          name: e.name,
          kind: String(e.kind),
          tag: `Day ${e.dayNumber} · ${KIND[e.kind] ?? "Event"}`,
        }));
        handle = startWorld(canvas.current, minimap.current, zones, {
          onZone: (id) => {
            setZone(id);
            if (id !== null) {
              cue("whoosh");
              setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
            }
          },
          onCollect: (n, total) => {
            cue("shimmer");
            setGears({ n, total });
          },
          onReady: () => setStatus("ready"),
          onGuide: setGuide,
          onSlow: () => setSlow((v) => (v === "no" ? "yes" : v)),
        });
        world.current = handle;
      })
      .catch(() => setStatus("nogl"));
    return () => {
      cancelled = true;
      handle?.dispose();
      world.current = null;
    };
  }, [events]);

  // Every event visited: the final frame, with the time trial result.
  useEffect(() => {
    if (finale === "hidden" && events.length > 0 && visited.size === events.length) {
      setFinale("shown");
      cue("boom");
      if (startedAt.current !== null) setFinishSec((performance.now() - startedAt.current) / 1000);
      void topRuns(10).then(setBoard);
    }
  }, [visited, events.length, finale]);

  // Events happening right now (checked every 30 s).
  useEffect(() => {
    if (status === "loading" || status === "nogl") return;
    const tick = () => {
      const ids = liveEventIds(days);
      setLive((prev) => (prev.join() === ids.join() ? prev : ids));
      world.current?.setLive(ids);
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [days, status]);

  // Music and engine hum; the hum follows the rover's speed.
  useEffect(() => {
    const a = startGameAudio();
    audio.current = a;
    const id = window.setInterval(() => a.setSpeed(world.current?.getSpeed() ?? 0), 120);
    return () => {
      clearInterval(id);
      a.stop();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    audio.current?.setDuck(zone !== null || finale === "shown");
  }, [zone, finale]);

  const current = zone === null ? null : events[zone];

  const start = useCallback(() => {
    cue("click");
    world.current?.start();
    startedAt.current ??= performance.now();
    setStatus("playing");
  }, []);

  const takePhoto = async () => {
    if (!world.current || photoBusy) return;
    setPhotoBusy(true);
    setMenuOpen(false);
    cue("click");
    try {
      const shot = world.current.snapshot();
      setFlash((n) => n + 1);
      setPhoto({ share: false });
      const blob = await composePhoto(shot, { events: visited.size, total: events.length, gears: gears.n });
      setPhoto({ blob, url: URL.createObjectURL(blob), share: canSharePhoto(blob) });
      cue("shimmer");
    } catch (err) {
      console.warn("Chronos photo failed", err);
      setPhoto(null);
    } finally {
      setPhotoBusy(false);
    }
  };
  const closePhoto = () => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  };

  // Camera distance, remembered on this device
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("chronos-view"));
      if (localStorage.getItem("chronos-view") !== null && Number.isFinite(v)) setView(v);
    } catch {}
  }, []);
  useEffect(() => {
    world.current?.setView(view);
    try {
      localStorage.setItem("chronos-view", String(view));
    } catch {}
  }, [view, status]);

  // Time of day: real time in India, or a fixed time picked in the menu
  useEffect(() => {
    try {
      const t = localStorage.getItem("chronos-time");
      if (t && TIMES.some((x) => x.id === t)) setTimeMode(t);
    } catch {}
  }, []);
  useEffect(() => {
    if (status === "loading" || status === "nogl") return;
    const t = TIMES.find((x) => x.id === timeMode);
    // ?hour=21 in the address still previews a time while the menu says Auto
    if (timeMode !== "auto" || !new URLSearchParams(window.location.search).has("hour")) world.current?.setTime(t?.hour ?? null);
    try {
      localStorage.setItem("chronos-time", timeMode);
    } catch {}
  }, [timeMode, status]);

  // Guide arrow on or off, remembered on this device
  useEffect(() => {
    try {
      if (localStorage.getItem("chronos-arrow") === "0") setArrowOn(false);
    } catch {}
  }, []);
  useEffect(() => {
    world.current?.setArrow(arrowOn);
    try {
      localStorage.setItem("chronos-arrow", arrowOn ? "1" : "0");
    } catch {}
  }, [arrowOn, status]);

  // Close the menu with Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

    const postRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (finishSec === null || runState.busy || runState.place) return;
    setRunState({ busy: true });
    const res = await submitRun(runName, finishSec, gears.n);
    if ("error" in res) setRunState({ error: res.error });
    else {
      setRunState({ place: res.place });
      void topRuns(10).then(setBoard);
    }
  };

  // Keyboard: Enter / E registers at the event you are parked at, M opens the map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (status !== "playing" || mapDialog.current?.open || photo) return;
      if ((e.code === "KeyE" || e.code === "Enter") && current?.registerUrl) {
        trackRegister(current.name, "3d-key");
        window.location.href = current.registerUrl;
      }
      if (e.code === "KeyM") mapDialog.current?.showModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, current, photo]);

  const goTo = (id: number) => {
    cue("click");
    // Fast travel is handy, but such a run can't go on the time-trial board.
    if (status === "playing") setAssisted(true);
    world.current?.teleport(id);
    mapDialog.current?.close();
    if (status !== "playing") start();
  };

  return (
    <div className={`game ${touch ? "has-touch" : ""}`}>
      <canvas ref={canvas} className="game-canvas" tabIndex={-1} aria-label="3D map of the Chronos festival. Use the event list for the same information." />

      {/* --------------------------------------------------------------- HUD */}
      <div className={`hud ${status === "playing" ? "is-on" : ""}`}>
        <header className="hud-header">
          <div className="hud-head-row">
            <p className="hud-logo" aria-label={`Chronos ${FESTIVAL.year}`}>
              {"CHRONOS".split("").map((ch, i) => (
                <span key={i} style={{ animationDelay: `${i * -0.7}s` }} aria-hidden="true">
                  {ch}
                </span>
              ))}
            </p>
            <button
              type="button"
              className={`burger ${menuOpen ? "is-open" : ""}`}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="game-menu"
              onClick={() => {
                cue("click");
                setMenuOpen((v) => !v);
              }}
            >
              <i />
              <i />
              <i />
            </button>
          </div>
          <p className="hud-sub label">
            {countdown && <span className="hud-count">{countdown}</span>}
            <span className="flex items-center gap-1" aria-label={`${visited.size} of ${events.length} events visited`}>
              {[0, 1, 2].map((d) => {
                const all = events.filter((e) => e.day === d);
                const done = all.length > 0 && all.every((e) => visited.has(e.id));
                return (
                  <i key={d} className="stamp-dot" aria-hidden="true" style={{ background: done ? DAY_COLORS[d] : "transparent", borderColor: d === 0 ? "#c98a10" : DAY_COLORS[d] }}>
                    {d + 1}
                  </i>
                );
              })}
              {visited.size}/{events.length}
            </span>
            {gears.total > 0 && (
              <span>
                ⚙ {gears.n}/{gears.total}
              </span>
            )}
          </p>

          {menuOpen && (
            <div id="game-menu" className="game-menu" role="menu">
              <button type="button" role="menuitem" className="menu-item" onClick={() => (cue("click"), setMenuOpen(false), mapDialog.current?.showModal())}>
                <span>All events · fast travel</span>
                <kbd>M</kbd>
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={takePhoto} disabled={photoBusy}>
                <span>Capture a photo</span>
                <span aria-hidden="true">📸</span>
              </button>
              <label className="menu-item menu-slider">
                <span className="flex w-full justify-between">
                  <span>Camera</span>
                  <span className="opacity-60">{view < 0.25 ? "Close" : view > 0.7 ? "Far" : "Normal"}</span>
                </span>
                <input type="range" min={0} max={1} step={0.01} value={view} onChange={(e) => setView(Number(e.target.value))} aria-label="Camera distance" />
              </label>
              <div className="menu-item menu-slider">
                <span>Time of day</span>
                <span className="time-pick" role="radiogroup" aria-label="Time of day">
                  {TIMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={timeMode === t.id}
                      className={timeMode === t.id ? "is-on" : ""}
                      onClick={() => {
                        cue("click");
                        setTimeMode(t.id);
                      }}
                      title={t.id === "auto" ? "Follows the real time in India" : undefined}
                    >
                      {t.label}
                    </button>
                  ))}
                </span>
              </div>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={arrowOn}
                className="menu-item"
                onClick={() => {
                  cue("click");
                  setArrowOn((v) => !v);
                }}
              >
                <span>Guide arrow</span>
                <span className={`switch ${arrowOn ? "is-on" : ""}`} aria-hidden="true">
                  <i />
                </span>
              </button>
              <div className="menu-item">
                <span>Sound</span>
                <SoundToggle className="chip" />
              </div>
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  cue("click");
                  world.current?.respawn();
                  setMenuOpen(false);
                }}
              >
                <span>Back to the start</span>
                <kbd>R</kbd>
              </button>
              <Link href="/lite" role="menuitem" className="menu-item">
                <span>Lite version</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </header>

        <canvas ref={minimap} width={220} height={220} className="hud-map" aria-label="Open the event list" role="button" onClick={() => mapDialog.current?.showModal()} />

        {slow === "yes" && (
          <div className="slow-card">
            <p>Running slow on this device?</p>
            <div className="flex gap-2">
              <Link href="/lite" className="chip chip-solid">
                Lite version →
              </Link>
              <button type="button" className="chip" onClick={() => setSlow("dismissed")}>
                Keep playing
              </button>
            </div>
          </div>
        )}

        {current && (
          <article className="zone-card" style={{ ["--day" as string]: DAY_COLORS[current.day] }} aria-live="polite">
            {current.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/photos/${current.photo}`} alt="" className="zone-photo" />
            )}
            <div className="min-w-0 flex-1">
              <p className="label text-[0.6rem]">
                {live.includes(current.id) && <span className="live-badge">Live now</span>}
                Day {current.dayNumber} <span className="max-sm:hidden">· {current.dayTitle}</span> · {KIND[current.kind] ?? "Event"}
              </p>
              <h2 className="zone-name font-display mt-1 font-black uppercase leading-tight">{current.name}</h2>
              <p className="label mt-1 text-[0.6rem] opacity-70">{[current.venue, current.date.split(" · ")[0], time(current.startsAt), current.team].filter(Boolean).join(" · ")}</p>
              {current.summary && <p className="mt-2 line-clamp-2 text-sm leading-snug">{current.summary}</p>}
            </div>
            {current.registerUrl ? (
              <a
                className="sticker"
                href={current.registerUrl}
                onClick={() => {
                  cue("click");
                  trackRegister(current.name, "3d-card");
                }}
              >
                Register <kbd className="max-sm:hidden">E</kbd>
              </a>
            ) : (
              <a className="sticker sticker-quiet" href={ALL_EVENTS_URL}>
                Opens soon
              </a>
            )}
          </article>
        )}

        {!touch && !current && (
          <p className="hud-help label">
            <kbd>W A S D</kbd> drive · <kbd>Shift</kbd> boost · <kbd>Space</kbd> brake · <kbd>R</kbd> reset · drive into a glowing ring
          </p>
        )}
        {touch && (
          <>
            <Joystick world={world} />
            <button
              type="button"
              className="boost"
              onPointerDown={() => world.current && (world.current.input.boost = true)}
              onPointerUp={() => world.current && (world.current.input.boost = false)}
              onPointerCancel={() => world.current && (world.current.input.boost = false)}
              onPointerLeave={() => world.current && (world.current.input.boost = false)}
            >
              Boost
            </button>
          </>
        )}
      </div>

      {/* ---------------------------------------------------------- Start screen */}
      {status !== "playing" && (
        <div className="start-screen">
          <span className="start-ghost" aria-hidden="true">
            2026
          </span>
          <p className="start-note start-note-a" aria-hidden="true">
            built by SIC, for everyone ✦
          </p>
          <p className="start-note start-note-b" aria-hidden="true">
            {events.length} events · 3 days · 1 island
          </p>
          <p className="label text-[0.62rem] sm:text-xs">Science &amp; Innovation Club · GEC Palamu presents</p>
          <h1 className="sr-only">CHRONOS {FESTIVAL.year}</h1>
          <CutLetters text={FESTIVAL.name} className="text-[clamp(2.6rem,11vw,8.5rem)]" />
          <p className="display paper-strip text-sm tracking-[0.26em] sm:text-xl">{FESTIVAL.tagline}</p>
          <p className="label text-[0.65rem] sm:text-xs">
            {FESTIVAL.dates} · {FESTIVAL.place}
          </p>
          <p className="max-w-md text-sm leading-relaxed sm:text-base">
            Drive the SIC rover around the Chronos island. Every glowing ring is an event: park on it to see the details and register. Collect the gears on the way.
          </p>
          {status === "nogl" ? (
            <Link href="/lite" className="sticker sticker-big">
              Open the story version →
            </Link>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" className="sticker sticker-big" onClick={start} disabled={status === "loading"}>
                {status === "loading" ? "Building the island…" : "Start the engine →"}
              </button>
              <Link href="/lite" className="chip">
                Lite version (scroll story)
              </Link>
            </div>
          )}
          <p className="label text-[0.58rem] opacity-70">{touch ? "Joystick to drive · Boost button to go faster" : "W A S D or arrow keys · Shift to boost"}</p>
        </div>
      )}

      {flash > 0 && <div key={flash} className="shutter" aria-hidden="true" />}
      {photo && (
        <div className="photo-modal" role="dialog" aria-modal="true" aria-labelledby="photo-title" onClick={(e) => e.target === e.currentTarget && closePhoto()}>
          <div className="photo-card">
            {photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.url} alt="Your Chronos photo" className="photo-img" />
            ) : (
              <div className="photo-img photo-developing" aria-live="polite">
                Developing…
              </div>
            )}
            <div className="photo-side">
              <p id="photo-title" className="photo-title">
                Snap!
              </p>
              <p className="photo-tag">
                Post it and tag <strong>@sic_gecp</strong> on Instagram
                <br />
                <span>#Chronos2026 #EarnedNeverGiven</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {photo.blob && photo.share && (
                  <button type="button" className="sticker" onClick={() => photo.blob && void sharePhoto(photo.blob)}>
                    Share
                  </button>
                )}
                {photo.blob && (
                  <button type="button" className={photo.share ? "chip" : "sticker"} onClick={() => photo.blob && downloadPhoto(photo.blob)}>
                    Download
                  </button>
                )}
                <button type="button" className="chip" onClick={closePhoto}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ Finale */}
      {finale === "shown" && (
        <div className="finale" role="dialog" aria-modal="true" aria-labelledby="finale-title">
          <p className="label text-[0.65rem] text-gold">You visited every event</p>
          <div id="finale-title" className="flex flex-col gap-1">
            {FINAL_FRAME.map((line, i) => (
              <p key={line} className={`display text-[clamp(2rem,6vw,5rem)] ${i === 1 ? "gold-text" : ""}`}>
                {line}
              </p>
            ))}
          </div>
          <p className="display text-lg tracking-[0.3em] text-gold sm:text-2xl">{FESTIVAL.tagline}</p>
          {finishSec !== null && (
            <div className="trial">
              <div className="trial-score">
                <p className="label text-[0.6rem]">Your time</p>
                <p className="trial-time">{formatTime(finishSec)}</p>
                <p className="label text-[0.6rem]">⚙ {gears.n} {gears.n === 1 ? "gear" : "gears"}</p>
              </div>
              <div className="trial-side">
                {assisted ? (
                  <p className="text-sm">You used fast travel, so this run can&apos;t go on the board. Reload and drive the whole way to post a time.</p>
                ) : runState.place ? (
                  <p className="trial-place">You&apos;re #{runState.place} on the board!</p>
                ) : (
                  <form onSubmit={postRun} className="trial-form">
                    <label htmlFor="run-name" className="label text-[0.6rem]">
                      Put your name on the board
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="run-name"
                        value={runName}
                        onChange={(e) => setRunName(e.target.value)}
                        maxLength={24}
                        minLength={2}
                        required
                        placeholder="Your name"
                        autoComplete="nickname"
                      />
                      <button type="submit" className="chip chip-solid" disabled={runState.busy}>
                        {runState.busy ? "…" : "Post"}
                      </button>
                    </div>
                    {runState.error && <p className="text-xs text-[#c2361d]">{runState.error}</p>}
                  </form>
                )}
                {board && board.length > 0 && (
                  <ol className="trial-board">
                    {board.map((r) => (
                      <li key={`${r.place}-${r.name}`}>
                        <span>#{r.place}</span>
                        <span className="truncate">{r.name}</span>
                        <span>{formatTime(r.seconds)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <a href={ALL_EVENTS_URL} className="sticker sticker-big" onClick={() => trackRegister("all", "3d-finale")}>
              Register now →
            </a>
            <button type="button" className="chip" onClick={() => setFinale("done")}>
              Keep driving
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- Event list */}
      <dialog ref={mapDialog} className="map-dialog" aria-labelledby="map-title" onClick={(e) => e.target === mapDialog.current && mapDialog.current?.close()}>
        <div className="flex flex-col gap-6 p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label text-[0.62rem]">Fast travel</p>
              <h2 id="map-title" className="display mt-2 text-3xl">
                All events
              </h2>
            </div>
            <button type="button" className="chip" onClick={() => mapDialog.current?.close()} aria-label="Close">
              ✕
            </button>
          </div>
          {days.map((d, di) => (
            <section key={d.number} className="flex flex-col gap-2">
              <p className="label text-[0.62rem]" style={{ color: DAY_COLORS[di] === "#f4b536" ? "#a26d00" : DAY_COLORS[di] }}>
                Day {d.number} · {d.title} · {d.date}
              </p>
              {events
                .filter((e) => e.day === di)
                .map((e) => (
                  <div key={e.id} className="map-row" style={{ ["--day" as string]: DAY_COLORS[di] }}>
                    <div className="min-w-0">
                      <p className="font-display text-base font-extrabold uppercase sm:text-lg">
                        {live.includes(e.id) && <span className="live-badge">Live</span>}
                        {e.name} {visited.has(e.id) && <span aria-label="visited">✓</span>}
                      </p>
                      <p className="label text-[0.58rem] opacity-70">{[e.venue, time(e.startsAt), e.team].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {status !== "nogl" && (
                        <button type="button" className="chip" onClick={() => goTo(e.id)}>
                          Drive there
                        </button>
                      )}
                      {e.registerUrl ? (
                        <a className="chip chip-solid" href={e.registerUrl} onClick={() => trackRegister(e.name, "3d-list")}>
                          Register
                        </a>
                      ) : (
                        <span className="label self-center text-[0.58rem] opacity-60">Opens soon</span>
                      )}
                    </div>
                  </div>
                ))}
            </section>
          ))}
        </div>
      </dialog>

      <RegisterDialog days={days} />
    </div>
  );
}
