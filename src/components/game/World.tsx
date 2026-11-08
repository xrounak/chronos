"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShowDay, ShowEvent } from "@/lib/events";
import { ALL_EVENTS_URL } from "@/lib/events";
import { FESTIVAL, FINAL_FRAME } from "@/lib/festival";
import { CutLetters } from "@/components/Cutouts";
import { RegisterDialog, SoundToggle } from "@/components/Controls";
import { armSound, cue, getVolumes, setVolume, type VolumeKey } from "@/components/sound";
import { trackRegister } from "@/components/Tracked";
import { Credit } from "@/components/Credit";
import { festivalStatus, liveEventIds } from "@/lib/live";
import { formatTime, submitRun, topRuns, type Run } from "@/lib/leaderboard";
import type { WorldHandle, ZoneDef } from "./engine";
import { startGameAudio } from "./audio";
import { DPad, Guide, type ControlStyle } from "./Guide";
import { Icon } from "./Icons";
import { flyNitro } from "./nitroFx";
import { LoadingStage } from "./Loader";
import { Customise, DEFAULT_LOOK } from "./Customise";
import type { Look } from "./engine";
import { InstallNudge } from "./InstallNudge";
import { useInstall } from "@/components/install";
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
  const [left, setLeft] = useState<{ phase: string; text: string; short: string } | null>(null);
  useEffect(() => {
    const tick = () => {
      const st = festivalStatus(days);
      setLeft({ phase: st.phase, text: st.text, short: st.phase === "soon" ? st.text.replace(" to gates", "") : st.phase === "live" && "day" in st && st.day !== undefined ? `Day ${st.day + 1} is on` : "See you soon" });
    };
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
  { id: "cycle", label: "Cycle", hour: null },
];

/** Day-cycle lengths for the "Cycle" time mode. */
const CYCLES = [
  { sec: 120, label: "2 min" },
  { sec: 300, label: "5 min" },
  { sec: 600, label: "10 min" },
  { sec: 1440, label: "24 min" },
];

type Quality = "auto" | "high" | "medium" | "low";
const VOLUMES: Array<{ key: VolumeKey; label: string; hint?: string }> = [
  { key: "master", label: "Volume" },
  { key: "music", label: "Music", hint: "Driving track in a car, a calm tune on foot" },
  { key: "sfx", label: "Effects" },
  { key: "engine", label: "Engine" },
];
const QUALITY: Array<{ id: Quality; label: string; hint: string }> = [
  { id: "auto", label: "Auto", hint: "Adapts to your device" },
  { id: "high", label: "High", hint: "Sharpest" },
  { id: "medium", label: "Medium", hint: "Balanced" },
  { id: "low", label: "Low", hint: "Fastest" },
];

/** 13.5 → "1:30 PM" */
const clock = (h: number) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
};

/** Touch joystick: drag anywhere in the pad; up is throttle, sideways steers. */
function Joystick({ world }: { world: React.RefObject<WorldHandle | null> }) {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
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
    setActive(false);
    if (world.current) world.current.input.held = false;
    setKnob({ x: 0, y: 0 });
    if (world.current) {
      world.current.input.x = 0;
      world.current.input.y = 0;
    }
  };
  return (
    <div
      ref={pad}
      className={`joy ${active ? "is-active" : ""}`}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        setActive(true);
        if (world.current) world.current.input.held = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // capture is a nicety: dragging still works without it
        }
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
  const customDialog = useRef<HTMLDialogElement>(null);
  const lastMode = useRef<"drive" | "walk">("drive");
  /** Driving or on foot, and whether a car is close enough to get into. */
  const [drive, setDrive] = useState<{ mode: "drive" | "walk"; vehicle: "rover" | "supercar"; near: "rover" | "supercar" | null }>({ mode: "drive", vehicle: "rover", near: null });
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [joyHeld, setJoyHeld] = useState(false);
  const [canToggle, setCanToggle] = useState(true);
  const boardDialog = useRef<HTMLDialogElement>(null);
  const [lb, setLb] = useState<{ state: "loading" | "ready" | "off"; runs: Run[] }>({ state: "loading", runs: [] });

  const events = useMemo<Flat[]>(() => {
    let id = 0;
    return days.flatMap((d, day) => d.events.map((e) => ({ ...e, id: id++, day, dayTitle: d.title, dayNumber: d.number, date: d.date })));
  }, [days]);

  const [status, setStatus] = useState<"loading" | "ready" | "playing" | "nogl">("loading");
  /** Loading steps for the progress bar: 0 code, 1 code ready, 2 fonts ready, 3 building, 4 done. */
  const [loadStep, setLoadStep] = useState(0);
  const [zone, setZone] = useState<number | null>(null);
  const [visited, setVisited] = useState<Set<number>>(() => new Set());
  const [gears, setGears] = useState({ n: 0, total: 0 });
  const [nitro, setNitro] = useState(1);
  const [touch, setTouch] = useState(false);
  const [controls, setControls] = useState<ControlStyle>("joystick");
  const [guideOpen, setGuideOpen] = useState(false);
  const install = useInstall();
  const [installAsk, setInstallAsk] = useState(0);
  const [finale, setFinale] = useState<"hidden" | "shown" | "done">("hidden");
  const [, setGuide] = useState<{ day: number; text: string } | null>(null);
  const [live, setLive] = useState<number[]>([]);
  const [slow, setSlow] = useState<"no" | "yes" | "dismissed">("no");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photo, setPhoto] = useState<{ blob?: Blob; url?: string; share: boolean } | null>(null);
  const [flash, setFlash] = useState(0);
  /** Which panel is open: the menu (things to do) or the settings. */
  const [panel, setPanel] = useState<"menu" | "settings" | null>(null);
  const menuOpen = panel !== null;
  const togglePanel = (p: "menu" | "settings") => {
    cue("click");
    setPanel((v) => (v === p ? null : p));
  };
  const [quality, setQuality] = useState<Quality>("auto");
  const [cycleLen, setCycleLen] = useState(300);
  const [gameHour, setGameHour] = useState(12);
  const [vols, setVols] = useState<Record<VolumeKey, number>>({ master: 0.8, music: 0.7, sfx: 0.9, engine: 0.6 });
  useEffect(() => setVols(getVolumes()), []);
  const [view, setView] = useState(0.35);
  const [timeMode, setTimeMode] = useState<string>("auto");
  const [arrowOn, setArrowOn] = useState(true);
  const [speedLevel, setSpeedLevel] = useState(1);
  /** Look-around sensitivity, 0 (low) to 1 (high); gentle by default. */
  const [lookSens, setLookSens] = useState(0.3);
  const lookDrag = useRef<{ id: number; x: number; y: number } | null>(null);
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
    const engineCode = import("./engine").then((m) => (setLoadStep((s) => Math.max(s, 1)), m));
    const fonts = (document.fonts?.ready ?? Promise.resolve()).catch(() => undefined).then(() => setLoadStep((s) => Math.max(s, 2)));
    Promise.all([engineCode, fonts])
      // Show "building" for a frame before the (blocking) build starts
      .then(([m]) => (setLoadStep(3), new Promise<typeof m>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(m))))))
      .then(({ startWorld }) => {
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
            if (n > 0) cue("shimmer");
            setGears({ n, total });
          },
          onReady: () => {
            setLoadStep(4);
            setStatus("ready");
          },
          onGuide: setGuide,
          onSlow: () => setSlow((v) => (v === "no" ? "yes" : v)),
          onNitroPickup: flyNitro,
          onMode: (m) => {
            if (m.mode !== lastMode.current) cue("click");
            lastMode.current = m.mode;
            audio.current?.setMode(m.mode);
            setDrive(m);
          },
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

  // Sound is on by default: it starts at the first click, tap or key press.
  useEffect(() => armSound(), []);

  // Music and engine hum; the hum follows the rover's speed.
  useEffect(() => {
    const a = startGameAudio();
    audio.current = a;
    a.setMode(lastMode.current);
    let audioTicks = 0;
    const id = window.setInterval(() => {
      // Nothing to update while the tab is in the background
      if (document.hidden) return;
      // the on-foot tune follows the island's time of day (checked about every 2 s)
      if (++audioTicks % 16 === 0) a.setHour(world.current?.getHour() ?? 12);
      a.setSpeed(world.current?.getSpeed() ?? 0);
      // touch HUD: dim Get out while the stick is held or it can't be used; sprint-lock chip
      const w = world.current;
      if (w) {
        const held = w.input.held;
        setJoyHeld((p) => (p === held ? p : held));
        const ok = w.canToggle();
        setCanToggle((p) => (p === ok ? p : ok));
      }
      // Nitro meter for the HUD (only re-render when it visibly changes)
      const n = world.current?.getNitro() ?? 1;
      setNitro((prev) => (Math.abs(prev - n) > 0.01 || (n === 1 && prev !== 1) || (n === 0 && prev !== 0) ? n : prev));
    }, 120);
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
    // Babu's tutorial opens every time the game starts.
    setGuideOpen(true);
  }, []);

  // Joystick or arrow buttons, remembered on this device
  useEffect(() => {
    try {
      const c = localStorage.getItem("chronos-controls");
      if (c === "joystick" || c === "dpad") setControls(c);
    } catch {}
  }, []);
  const pickControls = (c: ControlStyle) => {
    cue("click");
    setControls(c);
    try {
      localStorage.setItem("chronos-controls", c);
    } catch {}
  };

  const takePhoto = async () => {
    if (!world.current || photoBusy) return;
    setPhotoBusy(true);
    setPanel(null);
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
  const openBoard = () => {
    cue("click");
    setPanel(null);
    setLb((v) => ({ ...v, state: "loading" }));
    boardDialog.current?.showModal();
    void topRuns(20).then((runs) => setLb(runs ? { state: "ready", runs } : { state: "off", runs: [] }));
  };

  const closePhoto = () => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  };

  // Your character and car colours, remembered on this device
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chronos-look");
      if (raw) setLook({ ...DEFAULT_LOOK, ...(JSON.parse(raw) as Partial<Look>) });
    } catch {}
  }, []);
  useEffect(() => {
    if (status === "loading" || status === "nogl") return;
    world.current?.setLook(look);
    try {
      localStorage.setItem("chronos-look", JSON.stringify(look));
    } catch {}
  }, [look, status]);

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
    if (timeMode === "cycle") world.current?.setDayCycle(cycleLen);
    else {
      world.current?.setDayCycle(null);
      // ?hour=21 in the address still previews a time while the menu says Live
      if (timeMode !== "auto" || !new URLSearchParams(window.location.search).has("hour")) world.current?.setTime(t?.hour ?? null);
    }
    try {
      localStorage.setItem("chronos-time", timeMode);
      localStorage.setItem("chronos-cycle", String(cycleLen));
    } catch {}
  }, [timeMode, cycleLen, status]);

  // Day-cycle length and resolution, remembered on this device
  useEffect(() => {
    try {
      const c = Number(localStorage.getItem("chronos-cycle"));
      if (CYCLES.some((x) => x.sec === c)) setCycleLen(c);
      const q = localStorage.getItem("chronos-res") as Quality | null;
      if (q && QUALITY.some((x) => x.id === q)) setQuality(q);
    } catch {}
  }, []);
  useEffect(() => {
    if (status === "loading" || status === "nogl") return;
    world.current?.setQuality(quality);
    try {
      localStorage.setItem("chronos-res", quality);
    } catch {}
  }, [quality, status]);
  // The in-game clock shown in Settings
  useEffect(() => {
    if (panel !== "settings") return;
    const tick = () => setGameHour(world.current?.getHour() ?? 12);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [panel]);

  // Look sensitivity, remembered on this device
  useEffect(() => {
    try {
      const raw = localStorage.getItem("chronos-look");
      const v = Number(raw);
      if (raw !== null && Number.isFinite(v)) setLookSens(Math.min(1, Math.max(0, v)));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("chronos-look", String(lookSens));
    } catch {}
  }, [lookSens]);

  // Drag on the 3D view (mouse or finger) to look around. Off while the joystick is held.
  const onLookDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // On foot the view can be turned while the joystick is in use; in a car it can't
    if (status !== "playing" || lookDrag.current || (world.current?.input.held && drive.mode !== "walk")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    lookDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };
  const onLookMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = lookDrag.current;
    if (!d || d.id !== e.pointerId) return;
    if (world.current?.input.held && drive.mode !== "walk") {
      lookDrag.current = null;
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    // radians per pixel: low ≈ 0.0015, high ≈ 0.0075 (about twice that on foot)
    const k = (0.0015 + lookSens * 0.006) * (drive.mode === "walk" ? 1.9 : 1);
    world.current?.look(-dx * k, dy * k * 0.6);
  };
  const onLookUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (lookDrag.current?.id === e.pointerId) lookDrag.current = null;
  };

  // Rover speed (Chill / Normal / Fast), remembered on this device
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("chronos-speed"));
      if (localStorage.getItem("chronos-speed") !== null && [0, 1, 2].includes(v)) setSpeedLevel(v);
    } catch {}
  }, []);
  useEffect(() => {
    world.current?.setSpeedLevel(speedLevel);
    try {
      localStorage.setItem("chronos-speed", String(speedLevel));
    } catch {}
  }, [speedLevel, status]);

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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
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
      <canvas
        ref={canvas}
        className={`game-canvas ${status === "playing" ? "can-look" : ""}`}
        tabIndex={-1}
        aria-label="3D map of the Chronos festival. Drag to look around. Use the event list for the same information."
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* --------------------------------------------------------------- HUD */}
      <div className={`hud ${status === "playing" ? "is-on" : ""}`}>
        <button
          type="button"
          className={`burger hud-burger ${panel === "menu" ? "is-open" : ""}`}
          aria-label={panel === "menu" ? "Close menu" : "Open menu"}
          aria-expanded={panel === "menu"}
          aria-controls="game-menu"
          onClick={() => togglePanel("menu")}
        >
          <i />
          <i />
          <i />
        </button>
        <button
          type="button"
          className={`hud-gear ${panel === "settings" ? "is-open" : ""}`}
          aria-label={panel === "settings" ? "Close settings" : "Open settings"}
          aria-expanded={panel === "settings"}
          aria-controls="game-settings"
          onClick={() => togglePanel("settings")}
        >
          <Icon name={panel === "settings" ? "close" : "gear"} />
        </button>

        {panel === "menu" && (
          <div id="game-menu" className="game-menu hud-menu" role="menu" aria-label="Menu">
            <p className="menu-head">Play</p>
            <button type="button" role="menuitem" className="menu-item" onClick={() => (cue("click"), setPanel(null), mapDialog.current?.showModal())}>
              <span>All events · fast travel</span>
              <span className="menu-ico">
                <Icon name="list" />
                <kbd>M</kbd>
              </span>
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={openBoard}>
              <span>Leaderboard</span>
              <Icon name="trophy" className="menu-ico" />
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                cue("click");
                setPanel(null);
                customDialog.current?.showModal();
              }}
            >
              <span>Customise you &amp; your cars</span>
              <Icon name="bolt" className="menu-ico" />
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={takePhoto} disabled={photoBusy}>
              <span>Capture a photo</span>
              <Icon name="camera" className="menu-ico" />
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                cue("click");
                world.current?.respawn();
                setPanel(null);
              }}
            >
              <span>Back to the start</span>
              <span className="menu-ico">
                <Icon name="home" />
                <kbd>R</kbd>
              </span>
            </button>

            <p className="menu-head">Help &amp; more</p>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                cue("click");
                setPanel(null);
                setGuideOpen(true);
              }}
            >
              <span>How to play</span>
              <Icon name="help" className="menu-ico" />
            </button>
            {/* Always offered: the browser's own install prompt when it has one, otherwise
                Babu shows the steps for this browser (or says it's already installed) */}
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={install.installed}
              onClick={async () => {
                cue("click");
                setPanel(null);
                if (install.canPrompt) await install.prompt();
                else setInstallAsk((n) => n + 1);
              }}
            >
              <span>{install.installed ? "Installed on this device" : "Install on this device"}</span>
              <Icon name={install.installed ? "check" : "download"} className="menu-ico" />
            </button>
            <Link href="/lite" role="menuitem" className="menu-item">
              <span>Lite version</span>
              <Icon name="page" className="menu-ico" />
            </Link>
            <div className="menu-item menu-credit">
              <Credit />
            </div>
          </div>
        )}

        {panel === "settings" && (
          <div id="game-settings" className="game-menu hud-menu" role="dialog" aria-label="Settings">
            <p className="menu-head">Driving</p>
            <div className="menu-item menu-slider">
              <span>Speed</span>
              <span className="time-pick speed-pick" role="radiogroup" aria-label="Rover speed">
                {["Chill", "Normal", "Fast"].map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={speedLevel === i}
                    className={speedLevel === i ? "is-on" : ""}
                    onClick={() => {
                      cue("click");
                      setSpeedLevel(i);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            {touch && (
              <div className="menu-item menu-slider">
                <span>Touch controls</span>
                <span className="time-pick speed-pick ctrl-pick" role="radiogroup" aria-label="Touch controls">
                  {(["joystick", "dpad"] as const).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={controls === c} className={controls === c ? "is-on" : ""} onClick={() => pickControls(c)}>
                      {c === "joystick" ? "Joystick" : "Arrows"}
                    </button>
                  ))}
                </span>
              </div>
            )}
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

            <p className="menu-head">Camera</p>
            <label className="menu-item menu-slider">
              <span className="flex w-full justify-between">
                <span>Distance</span>
                <span className="opacity-60">{view < 0.25 ? "Close" : view > 0.7 ? "Far" : "Normal"}</span>
              </span>
              <input type="range" min={0} max={1} step={0.01} value={view} onChange={(e) => setView(Number(e.target.value))} aria-label="Camera distance" />
            </label>
            <label className="menu-item menu-slider">
              <span className="flex w-full justify-between">
                <span>Look sensitivity</span>
                <span className="opacity-60">{lookSens < 0.34 ? "Low" : lookSens > 0.66 ? "High" : "Medium"}</span>
              </span>
              <input type="range" min={0} max={1} step={0.01} value={lookSens} onChange={(e) => setLookSens(Number(e.target.value))} aria-label="Look sensitivity" />
              <span className="menu-hint">Drag the view to look around · drive to snap back</span>
            </label>

            <p className="menu-head">World</p>
            <div className="menu-item menu-slider">
              <span className="flex w-full justify-between">
                <span>Time of day</span>
                <span className="opacity-60 tabular">{clock(gameHour)}</span>
              </span>
              <span className="time-pick time-pick-6" role="radiogroup" aria-label="Time of day">
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
                    title={t.id === "auto" ? "Follows the real time in India" : t.id === "cycle" ? "Plays a whole day while you drive" : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </span>
              {timeMode === "cycle" && (
                <>
                  <span className="menu-hint">A whole day, sunrise to night, every:</span>
                  <span className="time-pick pick-4" role="radiogroup" aria-label="Day length">
                    {CYCLES.map((c) => (
                      <button
                        key={c.sec}
                        type="button"
                        role="radio"
                        aria-checked={cycleLen === c.sec}
                        className={cycleLen === c.sec ? "is-on" : ""}
                        onClick={() => {
                          cue("click");
                          setCycleLen(c.sec);
                        }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </span>
                </>
              )}
            </div>

            <p className="menu-head">Display &amp; sound</p>
            <div className="menu-item menu-slider">
              <span className="flex w-full justify-between">
                <span>Resolution</span>
                <span className="opacity-60">{QUALITY.find((q) => q.id === quality)?.hint}</span>
              </span>
              <span className="time-pick pick-4" role="radiogroup" aria-label="Resolution">
                {QUALITY.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    role="radio"
                    aria-checked={quality === q.id}
                    className={quality === q.id ? "is-on" : ""}
                    onClick={() => {
                      cue("click");
                      setQuality(q.id);
                    }}
                  >
                    {q.label}
                  </button>
                ))}
              </span>
            </div>
            <div className="menu-item">
              <span>Sound</span>
              <SoundToggle className="chip" />
            </div>
            {VOLUMES.map((v) => (
              <label key={v.key} className="menu-item menu-slider">
                <span className="flex w-full justify-between">
                  <span>{v.label}</span>
                  <span className="opacity-60 tabular">{Math.round(vols[v.key] * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={vols[v.key]}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(v.key, val);
                    setVols((p) => ({ ...p, [v.key]: val }));
                  }}
                  aria-label={`${v.label} volume`}
                />
                {v.hint && <span className="menu-hint">{v.hint}</span>}
              </label>
            ))}
          </div>
        )}
        <header className="hud-header">
          <p className="hud-logo" aria-label={`Chronos ${FESTIVAL.year}`}>
            {"CHRONOS".split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${i * -0.7}s` }} aria-hidden="true">
                {ch}
              </span>
            ))}
          </p>
          <div className="hud-stats">
            {countdown && (
              <span className="stat">
                <small>{countdown.phase === "soon" ? "Gates in" : "Chronos"}</small>
                <b>{countdown.short}</b>
              </span>
            )}
            <span className="stat" aria-label={`${visited.size} of ${events.length} events visited`}>
              <small>Events</small>
              <b>
                <span className="flex gap-[3px]" aria-hidden="true">
                  {[0, 1, 2].map((d) => {
                    const all = events.filter((e) => e.day === d);
                    const done = all.length > 0 && all.every((e) => visited.has(e.id));
                    return <i key={d} className="day-pip" style={{ background: done ? DAY_COLORS[d] : "transparent", borderColor: DAY_COLORS[d] }} />;
                  })}
                </span>
                {visited.size}/{events.length}
              </b>
            </span>
            <span className="stat stat-nitro" aria-label={`Nitro ${Math.round(nitro * 100)} percent, ${gears.n} cans collected`}>
              <small>Nitro</small>
              <b>
                <Icon name="nitro" className="stat-ico" />
                <span className={`nitro-bar ${nitro < 0.02 ? "is-empty" : ""}`} aria-hidden="true">
                  <i style={{ width: `${Math.round(nitro * 100)}%` }} />
                </span>
              </b>
            </span>
          </div>
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
            {current.detailsUrl && (
              <a className="chip zone-details" href={current.detailsUrl} target="_blank" rel="noopener noreferrer">
                Rule book
              </a>
            )}
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

        {!touch && drive.mode === "drive" && (
          <div
            className={`nitro-dial ${nitro < 0.02 ? "is-empty" : nitro > 0.99 ? "is-full" : ""}`}
            style={{ ["--nitro" as string]: nitro }}
            role="meter"
            aria-label="Nitro"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(nitro * 100)}
          >
            <span className="nitro-dial-gauge" aria-hidden="true">
              <span className="nitro-dial-face">
                <Icon name="nitro" className="nitro-dock-ico" />
                <span className="nitro-dial-pct">
                  {Math.round(nitro * 100)}
                  <small>%</small>
                </span>
                <span className="nitro-dial-label">{nitro < 0.02 ? "Empty" : nitro > 0.99 ? "Full" : "Nitro"}</span>
              </span>
            </span>
            <span className="nitro-dial-hint">
              Hold <kbd>Shift</kbd>
            </span>
          </div>
        )}
        {/* desktop only: phones already show the DRIVE button */}
        {status === "playing" && !touch && drive.mode === "walk" && drive.near && (
          <div className="mode-prompt" role="status">
            Press <kbd>F</kbd> to drive the {drive.near === "rover" ? "rover" : "supercar"}
          </div>
        )}
        {!touch && !current && (
          <p className="hud-help label">
            {drive.mode === "drive" ? (
              <>
                <kbd>W A S D</kbd> drive · <kbd>Shift</kbd> boost · <kbd>Space</kbd> brake · <kbd>F</kbd> get out · <kbd>R</kbd> reset
              </>
            ) : (
              <>
                <kbd>W A S D</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>F</kbd> get in a car · <kbd>R</kbd> back to the rover
              </>
            )}
          </p>
        )}
        {touch && (
          <>
            {controls === "dpad" ? <DPad world={world} /> : <Joystick world={world} />}
            {(drive.mode === "drive" || drive.near) && (
              <button
                type="button"
                className={`door-btn ${drive.mode === "walk" ? "is-in" : ""} ${joyHeld || !canToggle ? "is-dim" : ""}`}
                disabled={!canToggle}
                onClick={() => {
                  cue("click");
                  world.current?.toggleVehicle();
                }}
              >
                {drive.mode === "drive" ? "Get out" : "Drive"}
              </button>
            )}
            {drive.mode === "walk" ? (
              // On foot the big button jumps (running is the sprint lock on the stick)
              <button
                type="button"
                className="boost is-jump"
                aria-label="Jump"
                onPointerDown={() => {
                  if (world.current) world.current.input.jump = true;
                }}
              >
                <span className="boost-ring" aria-hidden="true" />
                <span className="boost-face">
                  <Icon name="arrow" className="boost-ico jump-ico" />
                  <span className="boost-label">Jump</span>
                </span>
              </button>
            ) : (
              <button
                type="button"
                className={`boost ${nitro < 0.02 ? "is-empty" : nitro > 0.99 ? "is-full" : ""}`}
                style={{ ["--nitro" as string]: nitro }}
                aria-label={`Nitro boost, ${Math.round(nitro * 100)} percent`}
                onPointerDown={() => world.current && (world.current.input.boost = true)}
                onPointerUp={() => world.current && (world.current.input.boost = false)}
                onPointerCancel={() => world.current && (world.current.input.boost = false)}
                onPointerLeave={() => world.current && (world.current.input.boost = false)}
              >
                <span className="boost-ring" aria-hidden="true" />
                <span className="boost-face">
                  <Icon name="nitro" className="boost-ico" />
                  <span className="boost-label">{nitro < 0.02 ? "Empty" : "Nitro"}</span>
                  <span className="boost-pct">{Math.round(nitro * 100)}%</span>
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {status === "playing" && (
        <InstallNudge busy={guideOpen || menuOpen || zone !== null || finale === "shown" || photo !== null} request={installAsk} />
      )}

      {guideOpen && status === "playing" && !menuOpen && (
        <Guide
          touch={touch}
          arrowOn={arrowOn}
          controls={controls}
          onControls={pickControls}
          onClose={() => {
            cue("click");
            setGuideOpen(false);
          }}
        />
      )}

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
            Drive the SIC rover around the Chronos island. Every glowing ring is an event: park on it to see the details and register. Grab the glowing nitro cans on the way to refill your boost.
          </p>
          {status === "nogl" ? (
            <Link href="/lite" className="sticker sticker-big">
              Open the story version <Icon name="arrow" className="btn-ico" />
            </Link>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {status === "loading" ? (
                <LoadingStage step={loadStep} />
              ) : (
                <button type="button" className="sticker sticker-big start-go" onClick={start}>
                  Start the engine <Icon name="arrow" className="btn-ico" />
                </button>
              )}
              <Link href="/lite" className="chip">
                Lite version (scroll story)
              </Link>
            </div>
          )}
          <p className="label text-[0.58rem] opacity-70">{touch ? "Joystick to drive · Boost button to go faster" : "W A S D or arrow keys · Shift to boost"}</p>
          <Credit className="start-credit" />
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
                <p className="label flex items-center gap-1 text-[0.6rem]">
                  <Icon name="nitro" className="inline-ico" /> {gears.n} nitro {gears.n === 1 ? "can" : "cans"}
                </p>
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
              Register now <Icon name="arrow" className="btn-ico" />
            </a>
            <button type="button" className="chip" onClick={() => setFinale("done")}>
              Keep driving
            </button>
          </div>
        </div>
      )}

      <Customise ref={customDialog} look={look} onPick={(k, v) => setLook((prev) => ({ ...prev, [k]: v }))} onReset={() => setLook(DEFAULT_LOOK)} />

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
              <Icon name="close" />
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
                        {e.name} {visited.has(e.id) && <Icon name="check" className="inline-ico" title="visited" />}
                      </p>
                      <p className="label text-[0.58rem] opacity-70">{[e.venue, time(e.startsAt), e.team].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {status !== "nogl" && (
                        <button type="button" className="chip" onClick={() => goTo(e.id)}>
                          Drive there
                        </button>
                      )}
                      {e.detailsUrl && (
                        <a className="chip" href={e.detailsUrl} target="_blank" rel="noopener noreferrer">
                          Details
                        </a>
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

      <dialog ref={boardDialog} className="map-dialog" aria-labelledby="board-title" onClick={(e) => e.target === boardDialog.current && boardDialog.current?.close()}>
        <div className="flex flex-col gap-5 p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label text-[0.62rem]">Time trial</p>
              <h2 id="board-title" className="display mt-2 text-4xl">
                Leaderboard
              </h2>
            </div>
            <button type="button" className="chip" onClick={() => boardDialog.current?.close()} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <p className="text-sm leading-relaxed">
            Visit all {events.length} events as fast as you can, driving the whole way (no fast travel), then post your time on the finish screen.
          </p>
          {lb.state === "loading" && <p className="label text-[0.65rem]">Loading…</p>}
          {lb.state === "off" && <p className="text-sm">The leaderboard isn&apos;t live yet. Check back soon.</p>}
          {lb.state === "ready" && lb.runs.length === 0 && <p className="text-sm">No times yet. Be the first on the board!</p>}
          {lb.state === "ready" && lb.runs.length > 0 && (
            <ol className="board-list">
              {lb.runs.map((r) => (
                <li key={`${r.place}-${r.name}`} className={r.place <= 3 ? `top-${r.place}` : ""}>
                  <span className="board-place">#{r.place}</span>
                  <span className="truncate">{r.name}</span>
                  <span className="board-time">{formatTime(r.seconds)}</span>
                  <span className="label flex items-center gap-1 text-[0.55rem] opacity-60">
                    <Icon name="nitro" className="inline-ico" /> {r.gears}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </dialog>

      <RegisterDialog days={days} />
    </div>
  );
}
