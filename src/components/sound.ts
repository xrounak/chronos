/**
 * Cinematic sound: a slow clock tick under everything, a whoosh between chapters,
 * a drum on "Welcome to CHRONOS" and a boom on the final frame. Off until the
 * visitor turns it on (browsers block sound before a click anyway). From SFX Kit by
 * Wyzowl (CC0), in public/sfx.
 */
export type Cue = "whoosh" | "drum" | "boom" | "riser" | "click" | "shimmer";

const FILES: Record<Cue | "tick", string> = {
  tick: "time-clock",
  whoosh: "whoosh-slow-medium",
  drum: "cinematic-drum-big",
  boom: "boom-hit-medium",
  riser: "riser-2s-soft",
  click: "click-button-soft",
  shimmer: "shimmer-long-soft",
};
const GAIN: Record<Cue, number> = { whoosh: 0.45, drum: 0.5, boom: 0.6, riser: 0.4, click: 0.5, shimmer: 0.35 };
const KEY = "chronos-sound";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let tickSource: AudioBufferSourceNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let on = false;
const listeners = new Set<(v: boolean) => void>();

async function load(name: string) {
  if (!ctx || buffers.has(name)) return;
  const res = await fetch(`/sfx/${name}.mp3`);
  buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
}

let tickWanted = true;

/** Sound only plays while this tab is the one in front: visible and focused. */
const pageActive = () => document.visibilityState === "visible" && document.hasFocus();

let watching = false;
/** Pause all site audio when the tab is hidden or the window loses focus; resume on return. */
function watchFocus() {
  if (watching) return;
  watching = true;
  const sync = () => {
    if (!ctx) return;
    if (on && pageActive()) void ctx.resume().catch(() => {});
    else void ctx.suspend().catch(() => {});
  };
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("blur", sync);
  window.addEventListener("focus", sync);
  window.addEventListener("pagehide", sync);
}

/** The clock tick under the scroll story; the 3D game turns it off and plays music instead. */
export function setTick(wanted: boolean) {
  tickWanted = wanted;
  if (!wanted) {
    tickSource?.stop();
    tickSource = null;
  } else if (on) startTick();
}

/** The audio graph while sound is on, for the game's own music and engine hum. */
export function audioGraph() {
  return on && ctx && master ? { ctx, master } : null;
}

function startTick() {
  if (!tickWanted || !ctx || !master || tickSource) return;
  const buf = buffers.get(FILES.tick);
  if (!buf) return;
  const g = ctx.createGain();
  g.gain.value = 0.16;
  tickSource = ctx.createBufferSource();
  tickSource.buffer = buf;
  tickSource.loop = true;
  tickSource.connect(g).connect(master);
  tickSource.start();
}

export function isSoundOn() {
  return on;
}

export function onSoundChange(l: (v: boolean) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export async function setSound(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l(next));
  if (!next) {
    tickSource?.stop();
    tickSource = null;
    await ctx?.suspend().catch(() => {});
    return;
  }
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    watchFocus();
  }
  if (pageActive()) await ctx.resume().catch(() => {});
  await Promise.all(Object.values(FILES).map(load)).catch(() => {});
  startTick();
}

/** Sound is on unless the visitor turned it off before (it still needs a click or key to start). */
export function wantedSound() {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Turns sound on at the visitor's first click, tap or key press (browsers block audio
 * before that), unless they switched it off last time. Returns a cleanup.
 */
export function armSound() {
  if (!wantedSound() || on) return () => {};
  const start = () => {
    remove();
    if (!on) void setSound(true);
  };
  const remove = () => {
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
  };
  window.addEventListener("pointerdown", start);
  window.addEventListener("keydown", start);
  return remove;
}

export function cue(name: Cue) {
  if (!on || !ctx || !master || ctx.state !== "running") return;
  const buf = buffers.get(FILES[name]);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = GAIN[name];
  src.connect(g).connect(master);
  src.start();
}
