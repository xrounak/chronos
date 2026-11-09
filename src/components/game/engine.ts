import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ISLAND_A, ISLAND_B, shore, shorePoints, wobble } from "@/lib/island";

/**
 * The Chronos island: a long island with one straight track from the start gate to
 * the clock tower, and three branches off it to the day-districts (mustard, cobalt,
 * tomato), one landmark per event. Statues and people stand along the way; off the
 * track there are hills, ramps, gears to collect and cones to knock over. No physics
 * library: an arcade model (speed, heading, gravity, circle colliders) is plenty.
 */

export type ZoneDef = {
  /** Index into the flat event list the HUD keeps. */
  id: number;
  day: number;
  name: string;
  kind: string;
  /** Short label drawn above the landmark. */
  tag: string;
};

export type WorldCallbacks = {
  onZone: (id: number | null) => void;
  onCollect: (count: number, total: number) => void;
  onReady: () => void;
  /** Where the guide arrow points: the next day to explore, then the next event in it. */
  onGuide: (guide: { day: number; text: string } | null) => void;
  /** Called once if the game keeps running slowly on this device. */
  onSlow?: () => void;
  /** The time trial starts: the first move after starting or going back to the start. */
  onRunStart?: () => void;
  /** Back to the start: the run, events visited and cans collected all go back to zero. */
  onRunReset?: () => void;
  /** Driving or on foot, which vehicle, and whether a car is close enough to get in. */
  onMode?: (s: { mode: "drive" | "walk"; vehicle: "rover" | "supercar"; near: "rover" | "supercar" | null }) => void;
  /** The intro film cut to a new shot (null once the game starts). */
  onShot?: (shot: { n: number; cut: number; title: string; seconds: number } | null) => void;
  /** A nitro can was picked up at this point on screen (CSS pixels, viewport); `tank` is the new level. */
  onNitroPickup?: (x: number, y: number, tank: number) => void;
};

export type WorldHandle = {
  /** Analogue input from the touch joystick, -1..1; `held` while a thumb is on it. */
  input: { x: number; y: number; boost: boolean; held: boolean; jump: boolean };
  /** Turn the camera by a drag: yaw left/right and a little pitch, in radians. */
  look: (yaw: number, pitch: number) => void;
  start: () => void;
  teleport: (id: number) => void;
  respawn: () => void;
  /** Rover speed from 0 (still) to 1 (full boost). */
  getSpeed: () => number;
  /** On foot with the stick pushed all the way up for a moment: running on by itself. */
  getSprintLock: () => boolean;
  /** Whether Get out / Drive would work right now (not mid-air; a car close enough). */
  canToggle: () => boolean;
  /** Nitro left in the tank, 0 (empty) to 1 (full). */
  getNitro: () => number;
  /** Driving on the coast loop, where nitro never runs out. */
  onLoop: () => boolean;
  /** 0 = Chill, 1 = Normal, 2 = Fast. */
  setSpeedLevel: (level: number) => void;
  /** Events happening right now get a pulsing beam and a LIVE tag. */
  setLive: (ids: number[]) => void;
  /** Time of day: an hour 0–24, or null to follow the real time in India. */
  setTime: (hour: number | null) => void;
  /** Run a whole day in this many seconds while playing (null stops the cycle). */
  setDayCycle: (seconds: number | null) => void;
  /** The hour the world is showing right now, 0–24. */
  getHour: () => number;
  /** Get out of the car, or into the nearest one (the F key). */
  toggleVehicle: () => void;
  /** Character colours and car paint ("" for a supercar's own colour). */
  setLook: (look: Partial<Look>) => void;
  /** Render resolution: "auto" adapts to the device, the others are fixed. */
  setQuality: (q: "auto" | "high" | "medium" | "low") => void;
  /** Show or hide the guide arrow over the rover. */
  setArrow: (on: boolean) => void;
  /** Camera distance: 0 close behind the rover, 1 high and far. */
  setView: (v: number) => void;
  /** The current view as a PNG data URL (for photo mode). */
  snapshot: () => string;
  dispose: () => void;
};

export type Look = { skin: string; hair: string; shirt: string; pants: string; rover: string; supercar: string };

export const DAY_COLORS = ["#f4b536", "#2453b3", "#e2452b"];
const INK = "#1d1813";
const CREAM = "#fff3dc";

// ---- layout (shared with the flat map in the lite version: keep in step)
/** The main track runs north from the start gate to the clock tower. */
const START_Z = 155;
const TOWER_Z = -150;
const TRACK_W = 3.8;
const BRANCH_W = 3.2;
/** Where each day's branch leaves the track, and which side it goes. */
const JUNCTION_Z = [90, 0, -90];
const SIDE = [-1, 1, -1];
const BRANCH_LEN = 70;
const DISTRICT_ANGLES = SIDE.map((s) => (s < 0 ? Math.PI : 0));
const PLAZA = 27;
/** Chill, Normal (the default) and Fast: top speed and pick-up, as a share of the old full speed. */
const SPEED_LEVELS = [0.55, 0.75, 1];
const ZONE_RING = 17;

const CENTERS = [0, 1, 2].map((d) => new THREE.Vector2(SIDE[d] * BRANCH_LEN, JUNCTION_Z[d]));

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}


const onTrack = (x: number, z: number) => segDist(x, z, 0, START_Z, 0, TOWER_Z) < TRACK_W;
const onBranch = (x: number, z: number) => CENTERS.some((c, d) => segDist(x, z, 0, JUNCTION_Z[d], c.x, c.y) < BRANCH_W);

// ---- the coast loop: a racing road right round the island, just inside the beach.
// Nitro never runs out while you're on it.
/** Where the loop runs, as a share of the way out to the waterline (1). */
const RING_K = 0.84;
/** Half the loop's width: wider than the track, for racing side by side. */
const RING_HALF = 5;
const RING_N = 360;
const RING_PTS = shorePoints(RING_K, RING_N);
/** The chequered start line: due south, just behind the start gate. */
const RING_START = RING_N / 4;

/** How far a point is from the edge of the coast loop (negative on it). */
function ringGap(x: number, z: number) {
  // The loop's points go round by angle, so only the few near this point's angle can be closest
  const t = Math.atan2(z / ISLAND_B, x / ISLAND_A);
  const c = Math.round(((t < 0 ? t + Math.PI * 2 : t) / (Math.PI * 2)) * RING_N);
  let d = Infinity;
  for (let k = -5; k < 5; k++) {
    const a = RING_PTS[(c + k + RING_N) % RING_N];
    const b = RING_PTS[(c + k + 1 + RING_N) % RING_N];
    d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1]));
  }
  return d - RING_HALF;
}

/** How far a point is from the roads and plazas (negative inside them). */
function openness(x: number, z: number, ring = ringGap(x, z)) {
  let d = Math.min(segDist(x, z, 0, START_Z, 0, TOWER_Z) - TRACK_W, Math.hypot(x, z - START_Z) - 16, Math.hypot(x, z - TOWER_Z) - 20, ring);
  CENTERS.forEach((c, i) => {
    d = Math.min(d, segDist(x, z, 0, JUNCTION_Z[i], c.x, c.y) - BRANCH_W, Math.hypot(x - c.x, z - c.y) - PLAZA);
  });
  return d;
}

/** Terrain height without ramps (what the ground mesh shows). */
function terrain(x: number, z: number) {
  const hills = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 2.6 + Math.sin(x * 0.13 + z * 0.09) * 1.1 + Math.cos(z * 0.17 - x * 0.05) * 0.7 + 2.2;
  const ring = ringGap(x, z);
  // flat under the roads, and a little past the edges of the coast loop so no ground pokes through it
  let h = hills * smooth(0, 14, openness(x, z, ring)) * smooth(1.5, 9, ring);
  const e = shore(x, z);
  if (e > 0.9) h -= (e - 0.9) * 150;
  return h;
}

type Ramp = { x: number; z: number; a: number; len: number; w: number; top: number };
const RAMPS: Ramp[] = [
  { x: 0, z: 130, a: -Math.PI / 2, len: 8, w: 5, top: 2.2 },
  { x: 0, z: 45, a: -Math.PI / 2, len: 8, w: 5, top: 2.2 },
  { x: 0, z: -45, a: -Math.PI / 2, len: 8, w: 5, top: 2.4 },
  { x: 18, z: 0, a: 0, len: 7, w: 4.5, top: 1.8 },
];

function rampHeight(x: number, z: number) {
  let h = 0;
  for (const r of RAMPS) {
    const dx = x - r.x;
    const dz = z - r.z;
    const u = dx * Math.cos(r.a) + dz * Math.sin(r.a);
    const v = -dx * Math.sin(r.a) + dz * Math.cos(r.a);
    if (Math.abs(v) < r.w / 2 && u > 0 && u < r.len) h = Math.max(h, (u / r.len) * r.top);
  }
  return h;
}

const ground = (x: number, z: number) => terrain(x, z) + rampHeight(x, z);

/** Deterministic random so the island is the same for everyone. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Font family next/font gave a CSS variable (canvas needs the real name). */
const fontOf = (v: string, fallback: string) => {
  const f = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return f ? `${f}, ${fallback}` : fallback;
};

/** Paper grain, drawn once and reused on every tag. */
let grain: HTMLCanvasElement | null = null;
function paperGrain() {
  if (grain) return grain;
  grain = document.createElement("canvas");
  grain.width = grain.height = 128;
  const g = grain.getContext("2d")!;
  const r = rng(3);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(60,40,20,0.10)" : "rgba(255,255,255,0.35)";
    g.fillRect(r() * 128, r() * 128, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  return grain;
}

const canvasTex = (c: HTMLCanvasElement, aniso = 4) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
};

/**
 * A paper tag: day-colour banner with a small spaced label, the name in heavy display
 * type, an ink outline, a hard offset shadow and a tail pointing down at the landmark.
 */
function labelTexture(top: string, main: string, color: string, big = false) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const display = fontOf("--font-pixel-display", "Georgia, serif");
  const label = fontOf("--font-pixel-label", "system-ui, sans-serif");
  const mainSize = big ? 104 : 84;
  const mainFont = `400 ${Math.round(mainSize * 1.25)}px ${display}`;
  const topFont = `400 38px ${label}`;
  const name = main.toUpperCase();
  const spaced = top.toUpperCase();
  ctx.font = mainFont;
  const mainW = ctx.measureText(name).width;
  ctx.font = topFont;
  const topW = ctx.measureText(spaced).width;
  const pad = 46;
  const W = Math.ceil(Math.max(mainW, topW, 360) + pad * 2);
  const band = 66;
  const bodyH = band + mainSize + 64;
  const tail = 34;
  const sh = 14;
  c.width = W + sh + 8;
  c.height = bodyH + tail + sh + 8;
  const x0 = 4;
  const y0 = 4;
  // A block-pixel outline: notched corners and a stepped tail, like a game sign.
  const shape = (dx: number, dy: number) => {
    const x = x0 + dx;
    const y = y0 + dy;
    const n = 14;
    const cx = x + W / 2;
    const b = y + bodyH;
    const pts: Array<[number, number]> = [
      [x + n, y], [x + W - n, y], [x + W - n, y + n], [x + W, y + n], [x + W, b - n], [x + W - n, b - n], [x + W - n, b],
      [cx + 28, b], [cx + 28, b + 14], [cx + 14, b + 14], [cx + 14, b + 28], [cx - 14, b + 28], [cx - 14, b + 14], [cx - 28, b + 14], [cx - 28, b],
      [x + n, b], [x + n, b - n], [x, b - n], [x, y + n], [x + n, y + n],
    ];
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
  };
  ctx.fillStyle = INK;
  shape(sh, sh);
  ctx.fill();
  ctx.fillStyle = CREAM;
  shape(0, 0);
  ctx.fill();
  ctx.save();
  shape(0, 0);
  ctx.clip();
  ctx.fillStyle = ctx.createPattern(paperGrain(), "repeat")!;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, W, band);
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y0 + band, W, 7);
  ctx.restore();
  ctx.lineWidth = 8;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = INK;
  shape(0, 0);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color === "#f4b536" ? INK : CREAM;
  ctx.font = topFont;
  ctx.fillText(spaced, x0 + W / 2, y0 + band / 2 + 3);
  ctx.font = mainFont;
  ctx.fillStyle = color;
  ctx.fillText(name, x0 + W / 2 + 4, y0 + band + 7 + (bodyH - band) / 2 + 6);
  ctx.fillStyle = INK;
  ctx.fillText(name, x0 + W / 2, y0 + band + 7 + (bodyH - band) / 2 + 2);
  return { tex: canvasTex(c, 8), aspect: c.width / c.height };
}

/** A big round day number that floats above each district. */
function numberTexture(n: number, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  // A notched pixel block
  const block = (o: number) => {
    const a = 14 + o;
    const z = 234 + o;
    const n = 26;
    g.beginPath();
    [[a + n, a], [z - n, a], [z - n, a + n], [z, a + n], [z, z - n], [z - n, z - n], [z - n, z], [a + n, z], [a + n, z - n], [a, z - n], [a, a + n], [a + n, a + n]].forEach(([x, y], i) =>
      i ? g.lineTo(x, y) : g.moveTo(x, y),
    );
    g.closePath();
  };
  g.fillStyle = INK;
  block(14);
  g.fill();
  g.fillStyle = color;
  block(0);
  g.fill();
  g.lineWidth = 10;
  g.lineJoin = "miter";
  g.strokeStyle = INK;
  g.stroke();
  g.font = `400 110px ${fontOf("--font-pixel-digits", "Georgia, serif")}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = INK;
  g.fillText(String(n), 130, 140);
  g.fillStyle = CREAM;
  g.fillText(String(n), 124, 134);
  return canvasTex(c);
}

/** Text for a signpost board. */
function boardTexture(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 128);
  g.font = `400 80px ${fontOf("--font-pixel-display", "Georgia, serif")}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color === "#f4b536" ? INK : CREAM;
  g.fillText(text, 256, 70);
  return canvasTex(c);
}

function gearShape(r: number, teeth: number, depth: number, hole: number) {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts: Array<[number, number]> = [
      [r - depth, a],
      [r, a + step * 0.12],
      [r, a + step * 0.42],
      [r - depth, a + step * 0.55],
    ];
    pts.forEach(([rad, ang], j) => {
      const x = rad * Math.cos(ang);
      const y = rad * Math.sin(ang);
      if (i === 0 && j === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}

const GLYPHS: Record<string, string[]> = {
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  G: [" ####", "#    ", "#    ", "#  ##", "#   #", "#   #", " ####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["###", " # ", " # ", " # ", " # ", " # ", "###"],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  ",": ["  ", "  ", "  ", "  ", "  ", " #", "# "],
  ".": [" ", " ", " ", " ", " ", " ", "#"],
  "!": ["#", "#", "#", "#", "#", " ", "#"],
  " ": ["  ", "  ", "  ", "  ", "  ", "  ", "  "],
};

export function startWorld(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement | null, zones: ZoneDef[], cb: WorldCallbacks): WorldHandle {
  const lowPower = window.matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 1.75));
  renderer.shadowMap.enabled = !lowPower;
  // (PCFSoftShadowMap is gone in this three.js; softness comes from shadow.radius)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Shadows are the single biggest render cost, so they're redrawn on our schedule
  // (every frame or every other frame, by quality) instead of automatically.
  renderer.shadowMap.autoUpdate = false;
  let shadowEvery = 2;

  const scene = new THREE.Scene();
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 2;
  skyCanvas.height = 256;
  const skyTex = canvasTex(skyCanvas, 1);
  scene.background = skyTex;
  const fog = new THREE.Fog("#ffe3b8", 95, 270);
  scene.fog = fog;
  /** Beams and lamps shine brighter after dark. */
  let nightBoost = 1;
  /** 0 in full day, 1 at night. */
  let nightAmt = 0;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 800);
  let baseFov = 50;

  const hemi = new THREE.HemisphereLight("#fff6e0", "#5a7a3a", 1.5);
  scene.add(hemi);
  // A soft cool fill from the side away from the sun, so shaded faces keep some shape.
  const fill = new THREE.DirectionalLight("#bcd6ff", 0.45);
  scene.add(fill, fill.target);
  const sun = new THREE.DirectionalLight("#fff1d6", 2.2);
  sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -40;
  sc.right = sc.top = 40;
  sc.near = 10;
  sc.far = 200;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // ---- materials and geometry bookkeeping
  const mats = new Map<string, THREE.MeshLambertMaterial>();
  const mat = (color: string) => {
    let m = mats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      mats.set(color, m);
    }
    return m;
  };
  const geos: THREE.BufferGeometry[] = [];
  const track = <G extends THREE.BufferGeometry>(g: G) => (geos.push(g), g);
  const extraMats: THREE.Material[] = [];
  const keepMat = <M extends THREE.Material>(m: M) => (extraMats.push(m), m);
  const mesh = (g: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(track(g), mat(color));
    m.position.set(x, y, z);
    m.castShadow = !lowPower;
    m.receiveShadow = !lowPower;
    parent.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) =>
    mesh(new THREE.BoxGeometry(w, h, d), color, parent, x, y + h / 2, z);
  const gearGeo = track(new THREE.ExtrudeGeometry(gearShape(0.9, 8, 0.25, 0.32), { depth: 0.3, bevelEnabled: false }));
  gearGeo.center();
  /** Things that turn slowly every frame (the gear held by a statue). */
  const spinning: THREE.Object3D[] = [];

  // ---- ground
  const SX = ISLAND_A * 2.3;
  const SZ = ISLAND_B * 2.3;
  const groundGeo = track(new THREE.PlaneGeometry(SX, SZ, lowPower ? 100 : 150, lowPower ? 136 : 205));
  groundGeo.rotateX(-Math.PI / 2);
  {
    const pos = groundGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    const grassA = new THREE.Color("#7fbf4d");
    const grassB = new THREE.Color("#4f9a45");
    const road = new THREE.Color("#3b3430");
    const plaza = new THREE.Color("#efe1c4");
    const sand = new THREE.Color("#f0d29a");
    const day = DAY_COLORS.map((c) => new THREE.Color(c));
    // Painted-in detail, baked once into the vertex colours (costs nothing per frame):
    // light and dark meadow patches, dry yellow streaks, a dirt edge along every road.
    const meadow = new THREE.Color("#9fd25c");
    const deep = new THREE.Color("#3e8840");
    const dry = new THREE.Color("#c3c56a");
    const dirt = new THREE.Color("#c4a676");
    const hash = (x: number, z: number) => {
      const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrain(x, z);
      pos.setY(i, h);
      const e = shore(x, z);
      col.copy(grassA).lerp(grassB, Math.min(1, Math.max(0, h / 4.5)));
      const patch = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 - 0.7) + 0.5 * Math.sin(x * 0.11 - z * 0.09 + 2);
      if (patch > 0.45) col.lerp(meadow, smooth(0.45, 1.2, patch) * 0.7);
      else if (patch < -0.5) col.lerp(deep, smooth(-0.5, -1.2, patch) * 0.6);
      const streak = Math.sin(x * 0.021 - z * 0.033 + 4) * Math.sin(z * 0.07 + 1);
      if (streak > 0.6) col.lerp(dry, (streak - 0.6) * 0.9);
      const o = openness(x, z);
      if (o >= 0 && o < 2.4) col.lerp(dirt, (1 - o / 2.4) * 0.75);
      col.multiplyScalar(0.96 + hash(x, z) * 0.08);
      if (e > 0.86) col.lerp(sand, smooth(0.86, 0.91, e));
      if (o < 0) {
        if (onTrack(x, z) || onBranch(x, z)) col.copy(road);
        else if (ringGap(x, z) < 0 && Math.hypot(x, z - START_Z) > 16) col.copy(dirt);
        else {
          col.copy(plaza);
          CENTERS.forEach((c, d) => {
            if (Math.hypot(x - c.x, z - c.y) < PLAZA) col.lerp(day[d], 0.18);
          });
        }
      }
      colors.set([col.r, col.g, col.b], i * 3);
    }
    groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();
  }
  const groundMesh = new THREE.Mesh(groundGeo, keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  groundMesh.receiveShadow = !lowPower;
  scene.add(groundMesh);

  const water = new THREE.Mesh(track(new THREE.CircleGeometry(600, 48)), keepMat(new THREE.MeshLambertMaterial({ color: "#2f8fb3" })));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.2;
  scene.add(water);

  // Shallows and foam: two flat bands that follow the shoreline. Where the land is higher
  // it hides them, so the foam only shows right at the water's edge.
  const shoreBand = (k1: number, k2: number, inner: THREE.Color, outer: THREE.Color, a1: number, a2: number) => {
    const n = 160;
    const p1 = shorePoints(k1, n);
    const p2 = shorePoints(k2, n);
    const pos: number[] = [];
    const colors: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      pos.push(p1[i][0], 0, p1[i][1], p2[i][0], 0, p2[i][1]);
      colors.push(inner.r, inner.g, inner.b, a1, outer.r, outer.g, outer.b, a2);
      const j = (i + 1) % n;
      index.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    g.setIndex(index);
    g.computeVertexNormals();
    return track(g);
  };
  const deepWater = new THREE.Color("#2f8fb3");
  const shallows = new THREE.Mesh(
    shoreBand(0.86, 1.16, new THREE.Color("#63d3d0"), deepWater, 1, 0),
    keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })),
  );
  shallows.position.y = -1.17;
  shallows.renderOrder = 1;
  scene.add(shallows);
  const foamMat = keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0.8, side: THREE.DoubleSide }));
  const white = new THREE.Color("#ffffff");
  const foam = new THREE.Mesh(shoreBand(0.88, 0.965, white, white, 0.95, 0), foamMat);
  foam.position.y = -1.13;
  foam.renderOrder = 1;
  scene.add(foam);

  // Road dashes down the track and along each branch
  {
    const g = track(new THREE.PlaneGeometry(0.4, 2.4));
    g.rotateX(-Math.PI / 2);
    const spots: Array<[number, number, number]> = [];
    for (let z = START_Z - 14; z > TOWER_Z + 18; z -= 6) {
      if (JUNCTION_Z.some((j) => Math.abs(z - j) < 5) || RAMPS.some((r) => r.x === 0 && z < r.z + 1 && z > r.z - r.len - 1)) continue;
      spots.push([0, z, 0]);
    }
    CENTERS.forEach((c, d) => {
      for (let t = 8; t < BRANCH_LEN - PLAZA; t += 6) spots.push([SIDE[d] * t, JUNCTION_Z[d], Math.PI / 2]);
    });
    const dashes = new THREE.InstancedMesh(g, mat(CREAM), spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z, a], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m4.compose(new THREE.Vector3(x, terrain(x, z) + 0.06, z), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(i, m4);
    });
    scene.add(dashes);
  }

  // Ramps
  for (const r of RAMPS) {
    const g = new THREE.BufferGeometry();
    const hw = r.w / 2;
    const v = [0, 0, -hw, r.len, 0, -hw, r.len, r.top, -hw, 0, 0, hw, r.len, 0, hw, r.len, r.top, hw];
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3]);
    g.computeVertexNormals();
    const m = mesh(g, "#e2452b", scene, r.x, terrain(r.x, r.z) + 0.02, r.z);
    m.rotation.y = -r.a;
    const stripe = box(0.5, 0.05, r.w + 0.02, CREAM, m, r.len * 0.5, r.top * 0.5, 0);
    stripe.rotation.z = Math.atan2(r.top, r.len);
  }

  // ---- static colliders
  const colliders: Array<{ x: number; z: number; r: number }> = [];

  // ---- labels
  const labels: Array<{ s: THREE.Sprite; fade: boolean }> = [];
  const addLabel = (top: string, main: string, color: string, x: number, y: number, z: number, scale = 4, fade = true, big = false) => {
    const { tex, aspect } = labelTexture(top, main, color, big);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    s.scale.set(scale * aspect, scale, 1);
    s.position.set(x, y, z);
    s.renderOrder = fade ? 1 : 2;
    scene.add(s);
    labels.push({ s, fade });
    return s;
  };

  // ---- the coast loop road: red-and-white kerbs, a dashed centre line and a chequered
  // start line, all in one mesh (one draw call), with an arch over the start.
  {
    const P = RING_PTS;
    const N = RING_N;
    const NR = P.map((_, i) => {
      const a = P[(i + N - 1) % N];
      const b = P[(i + 1) % N];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // outward (towards the sea)
      return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
    });
    const pos: number[] = [];
    const cols: number[] = [];
    /** A point `f` of the way along piece `i`, `off` metres out from the centre line. */
    const at = (i: number, f: number, off: number) => {
      const a = i % N;
      const b = (i + 1) % N;
      const x = P[a][0] + (P[b][0] - P[a][0]) * f + (NR[a][0] + (NR[b][0] - NR[a][0]) * f) * off;
      const z = P[a][1] + (P[b][1] - P[a][1]) * f + (NR[a][1] + (NR[b][1] - NR[a][1]) * f) * off;
      return new THREE.Vector3(x, terrain(x, z) + 0.07, z);
    };
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, c: THREE.Color) => {
      // wind it to face up, whichever way round the points came
      e1.subVectors(q, p);
      e2.subVectors(r, p);
      for (const v of e1.z * e2.x - e1.x * e2.z > 0 ? [p, q, r] : [p, r, q]) {
        pos.push(v.x, v.y, v.z);
        cols.push(c.r, c.g, c.b);
      }
    };
    const quad = (i: number, f0: number, f1: number, o0: number, o1: number, c: THREE.Color) => {
      const a = at(i, f0, o0);
      const b = at(i, f1, o0);
      const d = at(i, f0, o1);
      const e = at(i, f1, o1);
      tri(a, b, d, c);
      tri(d, b, e, c);
    };
    const asphalt = new THREE.Color("#3b3430");
    const red = new THREE.Color("#e2452b");
    const cream = new THREE.Color(CREAM);
    const ink = new THREE.Color(INK);
    const K = RING_HALF - 0.9;
    for (let i = 0; i < N; i++) {
      if (i === RING_START) {
        // the start line: two rows of eight squares
        for (let r = 0; r < 2; r++)
          for (let k = 0; k < 8; k++) quad(i, r / 2, (r + 1) / 2, RING_HALF - (k * RING_HALF) / 4, RING_HALF - ((k + 1) * RING_HALF) / 4, (r + k) % 2 ? ink : cream);
        continue;
      }
      const kerb = i % 2 ? red : cream;
      quad(i, 0, 1, RING_HALF, K, kerb);
      quad(i, 0, 1, K, 0.12, asphalt);
      quad(i, 0, 1, 0.12, -0.12, i % 2 && Math.abs(i - RING_START) > 2 ? cream : asphalt);
      quad(i, 0, 1, -0.12, -K, asphalt);
      quad(i, 0, 1, -K, -RING_HALF, kerb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const loop = new THREE.Mesh(track(g), keepMat(new THREE.MeshLambertMaterial({ vertexColors: true })));
    loop.receiveShadow = !lowPower;
    loop.matrixAutoUpdate = false;
    scene.add(loop);

    // The start arch, side posts just off the kerbs
    const s0 = P[RING_START];
    const s1 = P[RING_START + 1];
    const mx = (s0[0] + s1[0]) / 2;
    const mz = (s0[1] + s1[1]) / 2;
    const [nx, nz] = NR[RING_START];
    const arch = new THREE.Group();
    arch.position.set(mx, terrain(mx, mz), mz);
    arch.rotation.y = Math.atan2(-nz, nx);
    scene.add(arch);
    const span = RING_HALF + 0.9;
    for (const sd of [-1, 1]) {
      box(0.7, 6.2, 0.7, INK, arch, sd * span, 0, 0);
      colliders.push({ x: mx + nx * sd * span, z: mz + nz * sd * span, r: 0.5 });
    }
    const W = span * 2 + 0.7;
    box(W, 1.3, 0.5, "#e2452b", arch, 0, 6.2, 0);
    for (let k = 0; k < 12; k++) box((W - 0.1) / 12, 0.35, 0.56, k % 2 ? INK : CREAM, arch, -(W - 0.1) / 2 + ((k + 0.5) * (W - 0.1)) / 12, 6.95, 0);
    addLabel("Unlimited nitro", "COAST LOOP", "#e2452b", mx, terrain(mx, mz) + 9.4, mz, 3.4);
  }

  // ---- the clock tower at the end of the track
  const clockHands: THREE.Object3D[] = [];
  {
    const t = new THREE.Group();
    t.position.set(0, terrain(0, TOWER_Z), TOWER_Z);
    scene.add(t);
    box(9, 1, 9, "#efe1c4", t);
    box(6, 16, 6, "#c7553a", t, 0, 1, 0);
    box(6.8, 1, 6.8, INK, t, 0, 17, 0);
    box(5.6, 6, 5.6, "#f4ecdd", t, 0, 18, 0);
    const roof = mesh(new THREE.ConeGeometry(4.8, 6, 4), "#2453b3", t, 0, 27, 0);
    roof.rotation.y = Math.PI / 4;
    mesh(new THREE.SphereGeometry(0.6, 8, 6), "#f4b536", t, 0, 30.4, 0);
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = CREAM;
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = INK;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.arc(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96, i % 3 === 0 ? 10 : 5, 0, Math.PI * 2);
      g.fill();
    }
    const faceMat = keepMat(new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true }));
    const faceGeo = track(new THREE.CircleGeometry(2.5, 32));
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group();
      f.rotation.y = (i * Math.PI) / 2;
      t.add(f);
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.set(0, 21, 2.82);
      f.add(face);
      const hour = new THREE.Group();
      hour.position.set(0, 21, 2.9);
      box(0.3, 1.5, 0.1, INK, hour, 0, 0, 0);
      const minute = new THREE.Group();
      minute.position.set(0, 21, 2.95);
      box(0.2, 2.2, 0.1, "#e2452b", minute, 0, 0, 0);
      f.add(hour, minute);
      clockHands.push(hour, minute);
    }
    colliders.push({ x: 0, z: TOWER_Z, r: 5.6 });
  }

  // ---- start gate
  {
    const g = new THREE.Group();
    const z = START_Z - 12;
    g.position.set(0, terrain(0, z), z);
    scene.add(g);
    box(1.2, 8, 1.2, INK, g, -5.2, 0, 0);
    box(1.2, 8, 1.2, INK, g, 5.2, 0, 0);
    box(12, 1.6, 1.4, "#e2452b", g, 0, 8, 0);
    for (let i = 0; i < 6; i++) box(1.2, 0.5, 1.45, i % 2 ? CREAM : INK, g, -3 + i * 1.2, 8.55, 0);
    colliders.push({ x: -5.2, z, r: 1 }, { x: 5.2, z, r: 1 });
    addLabel("Chronos 2026 · start", "Earned, never given", "#e2452b", 0, g.position.y + 13, z, 3.2, false, true);
  }

  // ---- district gates on each branch
  const DAY_NAMES = ["The Awakening", "The Challenge", "The Legacy"];
  CENTERS.forEach((_, d) => {
    const a = DISTRICT_ANGLES[d];
    const gx = SIDE[d] * (BRANCH_LEN - PLAZA - 5);
    const gz = JUNCTION_Z[d];
    const g = new THREE.Group();
    g.position.set(gx, terrain(gx, gz), gz);
    g.rotation.y = -a + Math.PI / 2;
    scene.add(g);
    box(1, 7, 1, INK, g, -3.6, 0, 0);
    box(1, 7, 1, INK, g, 3.6, 0, 0);
    box(9, 1.4, 1.2, DAY_COLORS[d], g, 0, 7, 0);
    colliders.push({ x: gx, z: gz + 3.6, r: 0.9 }, { x: gx, z: gz - 3.6, r: 0.9 });
    addLabel(`Day 0${d + 1} · enter`, DAY_NAMES[d], DAY_COLORS[d], gx, g.position.y + 11.5, gz, 3.6, false, true);
  });

  // ---- the guide: giant day numbers over each district and a signpost at each junction
  const dayNumbers: THREE.Sprite[] = [];
  CENTERS.forEach((c, d) => {
    const sp = new THREE.Sprite(keepMat(new THREE.SpriteMaterial({ map: numberTexture(d + 1, DAY_COLORS[d]), depthWrite: false })));
    sp.scale.set(12, 12, 1);
    sp.position.set(c.x, terrain(c.x, c.y) + 30, c.y);
    sp.renderOrder = 3;
    scene.add(sp);
    dayNumbers.push(sp);
  });
  {
    const boardGeo = track(new THREE.PlaneGeometry(4.2, 1.05));
    CENTERS.forEach((_, d) => {
      // A post on the far side of the track at each junction, its board pointing down the branch.
      const px = -SIDE[d] * 5.6;
      const pz = JUNCTION_Z[d] + 6;
      const post = new THREE.Group();
      post.position.set(px, terrain(px, pz), pz);
      scene.add(post);
      box(0.45, 6, 0.45, INK, post);
      mesh(new THREE.SphereGeometry(0.45, 8, 6), DAY_COLORS[d], post, 0, 6.2, 0);
      const arm = new THREE.Group();
      arm.position.y = 5;
      arm.rotation.y = -DISTRICT_ANGLES[d];
      post.add(arm);
      box(4.2, 1.05, 0.22, INK, arm, 2.45, -0.52, 0);
      const tip = mesh(new THREE.ConeGeometry(0.75, 0.9, 3), INK, arm, 4.9, 0, 0);
      tip.rotation.z = -Math.PI / 2;
      const front = new THREE.Mesh(boardGeo, keepMat(new THREE.MeshBasicMaterial({ map: boardTexture(`DAY ${d + 1} →`, DAY_COLORS[d]) })));
      front.position.set(2.45, 0, 0.12);
      const back = new THREE.Mesh(boardGeo, keepMat(new THREE.MeshBasicMaterial({ map: boardTexture(`← DAY ${d + 1}`, DAY_COLORS[d]) })));
      back.position.set(2.45, 0, -0.12);
      back.rotation.y = Math.PI;
      arm.add(front, back);
      colliders.push({ x: px, z: pz, r: 0.5 });
    });
  }

  // ---- event landmarks
  type ZoneRuntime = ZoneDef & { x: number; z: number; lx: number; lz: number; a: number; ring: THREE.Mesh; beam: THREE.Mesh; spin?: THREE.Object3D; live: boolean; liveTag: THREE.Sprite };
  const liveTex = (() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 120;
    const g = c.getContext("2d")!;
    g.fillStyle = INK;
    g.beginPath();
    g.rect(14, 14, 300, 100);
    g.fill();
    g.fillStyle = "#e2452b";
    g.beginPath();
    g.rect(4, 4, 300, 100);
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = CREAM;
    g.beginPath();
    g.arc(62, 54, 16, 0, Math.PI * 2);
    g.fill();
    g.font = `400 50px ${fontOf("--font-pixel-label", "system-ui, sans-serif")}`;
    g.textBaseline = "middle";
    g.fillText("LIVE NOW", 92, 58);
    return canvasTex(c);
  })();
  const zoneRt: ZoneRuntime[] = [];
  const perDay = [0, 1, 2].map((d) => zones.filter((z) => z.day === d));

  function landmark(kind: string, name: string, color: string, g: THREE.Group): THREE.Object3D | undefined {
    const n = name.toLowerCase();
    if (n.includes("soccer")) {
      box(11, 0.15, 7, "#3f9b4a", g);
      box(10, 0.17, 0.2, CREAM, g, 0, 0, 0);
      [-5.5, 5.5].forEach((x) => {
        box(0.3, 2, 0.3, CREAM, g, x, 0, -1.6);
        box(0.3, 2, 0.3, CREAM, g, x, 0, 1.6);
        box(0.3, 0.3, 3.5, CREAM, g, x, 2, 0);
      });
      return mesh(new THREE.IcosahedronGeometry(0.7, 0), CREAM, g, 0, 0.8, 0);
    }
    if (n.includes("war")) {
      box(10, 0.4, 10, "#5c5550", g);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        box(0.35, 3, 0.35, color, g, Math.cos(a) * 5.2, 0.4, Math.sin(a) * 5.2);
      }
      const bots = new THREE.Group();
      bots.position.y = 0.4;
      g.add(bots);
      box(1.8, 0.8, 1.4, "#e2452b", bots, -1.8, 0, 0);
      box(1.8, 0.8, 1.4, "#2453b3", bots, 1.8, 0, 0);
      box(0.2, 0.2, 2.2, "#c9c3bb", bots, -0.8, 0.5, 0);
      return bots;
    }
    if (n.includes("boat")) {
      const pond = mesh(new THREE.CircleGeometry(5.5, 20), "#3aa6c9", g, 0, 0.08, 0);
      pond.rotation.x = -Math.PI / 2;
      const boats = new THREE.Group();
      g.add(boats);
      ["#f4b536", "#e2452b", CREAM].forEach((c, i) => {
        const b = new THREE.Group();
        b.position.set(Math.cos(i * 2.1) * 3, 0.15, Math.sin(i * 2.1) * 3);
        b.rotation.y = i * 2.1;
        box(0.8, 0.4, 1.8, c, b);
        box(0.08, 1.4, 0.08, INK, b, 0, 0.4, 0);
        boats.add(b);
      });
      return boats;
    }
    if (n.includes("hurdle")) {
      for (let i = 0; i < 4; i++) {
        box(0.2, 1.3, 0.2, INK, g, -2.4, 0, -4.5 + i * 3);
        box(0.2, 1.3, 0.2, INK, g, 2.4, 0, -4.5 + i * 3);
        box(5, 0.35, 0.2, i % 2 ? CREAM : color, g, 0, 1.1, -4.5 + i * 3);
      }
      return;
    }
    if (n.includes("jet")) {
      box(4, 1.5, 4, "#5c5550", g);
      const jet = new THREE.Group();
      jet.position.y = 4;
      g.add(jet);
      const body = mesh(new THREE.ConeGeometry(0.8, 7, 6), "#8a9aa8", jet);
      body.rotation.x = Math.PI / 2;
      box(6, 0.15, 2, "#6c7b88", jet, 0, -0.1, 0.8);
      box(0.15, 1.4, 1.2, "#6c7b88", jet, 0, 0, 3);
      return jet;
    }
    if (n.includes("hack") || kind === "hackathon") {
      box(9, 6, 7, "#2453b3", g);
      box(9.4, 0.6, 7.4, INK, g, 0, 6, 0);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(track(new THREE.PlaneGeometry(1.8, 1.2)), keepMat(new THREE.MeshBasicMaterial({ color: i === 1 ? "#f4b536" : "#7ef0d0" })));
        s.position.set(-2.8 + i * 2.8, 3.4, 3.52);
        g.add(s);
      }
      box(2, 2.6, 0.2, "#f4b536", g, 0, 0, 3.55);
      return;
    }
    if (kind === "talk" || n.includes("talk")) {
      box(10, 1.2, 6, INK, g);
      box(10, 6, 0.5, "#e2452b", g, 0, 1.2, -2.8);
      box(1, 1.4, 0.8, "#c79a5b", g, 0, 1.2, 0.6);
      [-3.5, 3.5].forEach((x) => mesh(new THREE.ConeGeometry(0.6, 1.2, 6), "#f4b536", g, x, 6.6, -2));
      return;
    }
    if (kind === "exhibition" || n.includes("exhibit") || n.includes("build")) {
      [
        [-3, 7, "#f4b536"],
        [0, 10, "#1f9c86"],
        [3, 6, "#f08aa0"],
      ].forEach(([x, h, c]) => {
        box(2.4, h as number, 2.4, c as string, g, x as number, 0, 0);
        box(2.8, 0.4, 2.8, INK, g, x as number, h as number, 0);
      });
      return;
    }
    box(5, 3, 4, CREAM, g);
    box(5.6, 0.5, 4.6, color, g, 0, 3, 0);
    return;
  }

  perDay.forEach((list, d) => {
    const c = CENTERS[d];
    const outward = DISTRICT_ANGLES[d];
    list.forEach((z, i) => {
      // Spread a day's events in a fan facing away from the track.
      const spread = list.length > 1 ? (i / (list.length - 1) - 0.5) * Math.PI * 1.25 : 0;
      const a = outward + spread;
      const x = c.x + Math.cos(a) * ZONE_RING * 0.55;
      const zz = c.y + Math.sin(a) * ZONE_RING * 0.55;
      const y = terrain(x, zz);
      const ring = mesh(new THREE.RingGeometry(3.6, 4.4, 28), DAY_COLORS[d], scene, x, y + 0.08, zz);
      ring.rotation.x = -Math.PI / 2;
      ring.castShadow = false;
      const beam = new THREE.Mesh(
        track(new THREE.CylinderGeometry(3.6, 3.6, 18, 20, 1, true)),
        keepMat(new THREE.MeshBasicMaterial({ color: DAY_COLORS[d], transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })),
      );
      beam.position.set(x, y + 9, zz);
      scene.add(beam);
      const lx = c.x + Math.cos(a) * (ZONE_RING + 2);
      const lz = c.y + Math.sin(a) * (ZONE_RING + 2);
      const g = new THREE.Group();
      g.position.set(lx, terrain(lx, lz), lz);
      g.rotation.y = -a - Math.PI / 2;
      scene.add(g);
      const spin = landmark(z.kind, z.name, DAY_COLORS[d], g);
      const n = z.name.toLowerCase();
      if (!(n.includes("soccer") || n.includes("boat") || n.includes("hurdle"))) colliders.push({ x: lx, z: lz, r: 4.4 });
      addLabel(z.tag, z.name, DAY_COLORS[d], lx, g.position.y + 9, lz, 2.7);
      const liveTag = new THREE.Sprite(keepMat(new THREE.SpriteMaterial({ map: liveTex, depthWrite: false })));
      liveTag.scale.set(4.2, 1.6, 1);
      liveTag.position.set(lx, g.position.y + 13.4, lz);
      liveTag.visible = false;
      liveTag.renderOrder = 4;
      scene.add(liveTag);
      zoneRt.push({ ...z, x, z: zz, lx, lz, a, ring, beam, spin, live: false, liveTag });
    });
  });

  // ---- people: static mannequins and statues, merged into two meshes
  {
    const parts: THREE.BufferGeometry[] = [];
    const statueParts: THREE.BufferGeometry[] = [];
    const unit = {
      box: new THREE.BoxGeometry(1, 1, 1),
      head: new THREE.IcosahedronGeometry(0.5, 1),
    };
    const colorize = (g: THREE.BufferGeometry, color: string, m: THREE.Matrix4) => {
      const out = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry;
      out.deleteAttribute("uv");
      out.applyMatrix4(m);
      const c = new THREE.Color(color);
      const n = out.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      out.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      return out;
    };
    const M = () => new THREE.Matrix4();
    const T = (x: number, y: number, z: number) => M().makeTranslation(x, y, z);
    const S = (x: number, y: number, z: number) => M().makeScale(x, y, z);
    type Pose = "rest" | "wave" | "cheer" | "point" | "hips";
    const SHIRTS = ["#e2452b", "#2453b3", "#f4b536", "#1f9c86", "#f08aa0", CREAM, "#6a4c93"];
    const PANTS = [INK, "#3b4a6b", "#6b4a2b", "#4a4a4a"];
    const SKIN = ["#f1c9a5", "#d9a066", "#b07a48", "#7a4a26"];
    const HAIR = [INK, "#3b2414", "#6b3e1f"];
    const r = rng(2026);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

    /** One standing figure. Front faces +z before `face` turns it. */
    const figure = (out: THREE.BufferGeometry[], x: number, z: number, face: number, pose: Pose, k = 1, stone?: string, baseY?: number) => {
      const base = M().compose(
        new THREE.Vector3(x, baseY ?? terrain(x, z), z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face),
        new THREE.Vector3(k, k, k),
      );
      const shirt = stone ?? pick(SHIRTS);
      const pants = stone ?? pick(PANTS);
      const skin = stone ?? pick(SKIN);
      const hair = stone ?? pick(HAIR);
      const add = (g: THREE.BufferGeometry, color: string, local: THREE.Matrix4) => out.push(colorize(g, color, M().multiplyMatrices(base, local)));
      add(unit.box, pants, M().multiplyMatrices(T(-0.18, 0.45, 0), S(0.28, 0.9, 0.3)));
      add(unit.box, pants, M().multiplyMatrices(T(0.18, 0.45, 0), S(0.28, 0.9, 0.3)));
      add(unit.box, shirt, M().multiplyMatrices(T(0, 1.32, 0), S(0.78, 0.86, 0.42)));
      add(unit.head, skin, M().multiplyMatrices(T(0, 2.02, 0), S(0.62, 0.66, 0.62)));
      add(unit.box, hair, M().multiplyMatrices(T(0, 2.3, -0.04), S(0.6, 0.16, 0.6)));
      const arm = (side: number, angleZ: number, angleX = 0) => {
        const local = T(side * 0.5, 1.7, 0)
          .multiply(M().makeRotationX(angleX))
          .multiply(M().makeRotationZ(angleZ))
          .multiply(T(0, -0.38, 0))
          .multiply(S(0.2, 0.76, 0.22));
        add(unit.box, shirt, local);
      };
      if (pose === "rest") {
        arm(-1, -0.08);
        arm(1, 0.08);
      } else if (pose === "wave") {
        arm(-1, -0.08);
        arm(1, Math.PI - 0.35);
      } else if (pose === "cheer") {
        arm(-1, -(Math.PI - 0.35));
        arm(1, Math.PI - 0.35);
      } else if (pose === "point") {
        arm(-1, -0.08);
        arm(1, 0, -Math.PI / 2);
      } else {
        arm(-1, -0.6);
        arm(1, 0.6);
      }
    };
    const poses: Pose[] = ["rest", "rest", "wave", "cheer", "hips", "point"];
    const person = (x: number, z: number, face: number) => {
      figure(parts, x, z, face, pick(poses), 0.95 + r() * 0.15);
      colliders.push({ x, z, r: 0.55 });
    };
    const faceTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

    // (The standing crowds are gone: people now stroll around instead; see "life" below.)
    void person;
    void faceTo;
    // Statues on plinths along the track
    const STATUES: Array<{ x: number; z: number; pose: Pose; name: string; stone: string; gear?: boolean }> = [
      { x: -10, z: START_Z - 22, pose: "point", name: "The First Spark", stone: "#b9b2a6" },
      { x: 10, z: 62, pose: "cheer", name: "The Builder", stone: "#a8743f", gear: true },
      { x: -10, z: -22, pose: "hips", name: "Never Given Up", stone: "#b9b2a6" },
      { x: 10, z: -112, pose: "point", name: "The Time Keeper", stone: "#a8743f" },
    ];
    for (const s of STATUES) {
      const face = faceTo(s.x, s.z, 0, s.z - (s.pose === "point" ? 10 : 0));
      const gy = terrain(s.x, s.z);
      const plinth = new THREE.Group();
      plinth.position.set(s.x, gy, s.z);
      scene.add(plinth);
      box(3.4, 0.5, 3.4, INK, plinth);
      box(2.8, 2.2, 2.8, "#efe1c4", plinth, 0, 0.5, 0);
      box(3.1, 0.35, 3.1, INK, plinth, 0, 2.7, 0);
      figure(statueParts, s.x, s.z, face, s.pose, 2.2, s.stone, gy + 3.05);
      if (s.gear) {
        const gm = new THREE.Mesh(gearGeo, mat("#f4b536"));
        gm.scale.setScalar(1.6);
        gm.position.set(s.x, gy + 3.05 + 6.4, s.z);
        gm.castShadow = !lowPower;
        scene.add(gm);
        spinning.push(gm);
      }
      colliders.push({ x: s.x, z: s.z, r: 2.1 });
      addLabel("Statue", s.name, "#1f9c86", s.x, gy + 12.5, s.z, 2);
    }

    const pMat = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    for (const list of [parts, statueParts]) {
      if (!list.length) continue;
      const merged = track(mergeGeometries(list)!);
      list.forEach((g) => g.dispose());
      const m = new THREE.Mesh(merged, pMat);
      m.castShadow = !lowPower;
      m.receiveShadow = !lowPower;
      scene.add(m);
    }
    unit.box.dispose();
    unit.head.dispose();
  }

  /** How bright the SIC and GEC PALAMU blocks glow (brighter after dark, gently pulsing). */
  const wordGlow = { value: 0.3 };
  const haloMats: THREE.SpriteMaterial[] = [];
  const haloTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return canvasTex(c, 1);
  })();
  // ---- words: chunky voxel letters standing in the world, and paint on the ground
  {
    const WORD_COLORS = ["#e2452b", "#2453b3", "#f4b536", "#1f9c86", "#f08aa0", CREAM];
    type Letter = { ch: string; x: number; z: number; face: number; size: number; color: string; glow: boolean };
    const letters: Letter[] = [];
    const widthOf = (ch: string) => (GLYPHS[ch] ?? GLYPHS[" "])[0].length;
    /** A straight word centred on (cx, cz); `face` turns its front (+z) to the viewer. */
    const word = (text: string, cx: number, cz: number, face: number, size: number, colorOffset = 0, glow = false) => {
      const cols = text.split("").reduce((n, ch) => n + widthOf(ch) + 1, -1);
      const rx = Math.cos(face);
      const rz = -Math.sin(face);
      let col = 0;
      let ci = colorOffset;
      for (const ch of text) {
        const w = widthOf(ch);
        const off = (col + w / 2 - cols / 2) * size;
        if (ch !== " ") letters.push({ ch, x: cx + rx * off, z: cz + rz * off, face, size, color: WORD_COLORS[ci++ % WORD_COLORS.length], glow });
        col += w + 1;
      }
    };
    word("CHRONOS", 0, TOWER_Z - 22, 0, 1.35);
    word("EARNED, NEVER GIVEN.", 44, 76, -Math.PI / 2, 0.85, 2);
    word("GEC PALAMU", -44, 0, Math.PI / 2, 1.0, 1, true);
    word("BUILD. BREAK. REPEAT.", 44, -82, -Math.PI / 2, 0.65, 4);
    word("SIC", -15, START_Z - 16, 0, 0.75, 0, true);
    word("2026", 15, START_Z - 16, 0, 0.6, 3);

    let n = 0;
    for (const l of letters) for (const row of GLYPHS[l.ch]) for (const c of row) if (c === "#") n++;
    // SIC and GEC PALAMU glow: their blocks light up in their own colour (a per-block flag
    // read by a two-line shader tweak, so it is still one draw call), with a soft halo.
    const voxMat = keepMat(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }));
    voxMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = wordGlow;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", ["#include <common>", "attribute float aGlow;", "varying float vGlow;"].join("\n"))
        .replace("#include <begin_vertex>", ["#include <begin_vertex>", "vGlow = aGlow;"].join("\n"));
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", ["#include <common>", "uniform float uGlow;", "varying float vGlow;"].join("\n"))
        .replace(
          "#include <emissivemap_fragment>",
          ["#include <emissivemap_fragment>", "totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;"].join("\n"),
        );
    };
    const vox = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), voxMat, n);
    const glowFlag = new Float32Array(n);
    const shade = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), mat(INK), n);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let i = 0;
    for (const l of letters) {
      const g = GLYPHS[l.ch];
      const w = g[0].length;
      const y0 = terrain(l.x, l.z);
      q.setFromAxisAngle(up, l.face);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      col.set(l.color);
      g.forEach((row, rr) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] !== "#") continue;
          p.set(l.x, y0 + (6 - rr) * l.size + l.size / 2 + 0.15, l.z).addScaledVector(right, (c - (w - 1) / 2) * l.size);
          sc.set(l.size, l.size, l.size * 0.9);
          m4.compose(p, q, sc);
          vox.setMatrixAt(i, m4);
          vox.setColorAt(i, col);
          glowFlag[i] = l.glow ? 1 : 0;
          p.addScaledVector(right, l.size * 0.28).addScaledVector(back, l.size * 0.45);
          p.y -= l.size * 0.28;
          m4.compose(p, q, sc);
          shade.setMatrixAt(i, m4);
          i++;
        }
      });
      colliders.push({ x: l.x, z: l.z, r: (w * l.size) / 2 + 0.2 });
      if (l.glow) {
        let hm = haloMats.find((h) => h.color.getHexString() === col.getHexString());
        if (!hm) {
          hm = keepMat(new THREE.SpriteMaterial({ map: haloTex, color: col.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }));
          haloMats.push(hm);
        }
        const halo = new THREE.Sprite(hm);
        halo.position.set(l.x, y0 + 3.6 * l.size, l.z).addScaledVector(back, l.size * 0.6);
        halo.scale.set(w * l.size * 3.2, 11 * l.size, 1);
        halo.renderOrder = 2;
        scene.add(halo);
      }
    }
    vox.geometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(glowFlag, 1));
    for (const m of [vox, shade]) {
      m.castShadow = !lowPower;
      m.receiveShadow = !lowPower;
      scene.add(m);
    }

    // Paint on the ground: transparent canvas text lying flat, like road markings.
    const paint = (text: string, x: number, z: number, upAngle: number, width: number, color = CREAM, font = "--font-pixel-display", weight = 400) => {
      const c = document.createElement("canvas");
      const g = c.getContext("2d")!;
      const f = `${weight} 120px ${fontOf(font, "Georgia, serif")}`;
      g.font = f;
      c.width = Math.ceil(g.measureText(text).width + 40);
      c.height = 160;
      g.font = f;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = color;
      g.globalAlpha = 0.92;
      g.fillText(text, c.width / 2, 86);
      const h = (width * c.height) / c.width;
      const m = new THREE.Mesh(
        track(new THREE.PlaneGeometry(width, h)),
        keepMat(new THREE.MeshBasicMaterial({ map: canvasTex(c, 8), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })),
      );
      m.rotation.order = "YXZ";
      m.rotation.set(-Math.PI / 2, Math.atan2(-Math.cos(upAngle), -Math.sin(upAngle)), 0);
      m.position.set(x, ground(x, z) + 0.07, z);
      m.renderOrder = 1;
      scene.add(m);
    };
    const NORTH = -Math.PI / 2;
    paint("START", 0, START_Z - 5, NORTH, 5);
    paint("SCIENCE & INNOVATION CLUB", 0, START_Z - 20, NORTH, 6.6, "#f4b536", "--font-pixel-label", 400);
    CENTERS.forEach((c, d) => {
      paint(`DAY ${d + 1}`, SIDE[d] * 14, JUNCTION_Z[d], DISTRICT_ANGLES[d], 4.4, DAY_COLORS[d]);
      paint(`DAY ${d + 1} →`, 0, JUNCTION_Z[d] + 9, NORTH, 5, DAY_COLORS[d]);
      paint(DAY_NAMES[d].toUpperCase(), c.x - SIDE[d] * 1.5, c.y, DISTRICT_ANGLES[d], 12, d === 0 ? "#8a5a00" : DAY_COLORS[d]);
    });
    paint("TO THE TOWER", 0, TOWER_Z + 34, NORTH, 6);
    for (const r of RAMPS) paint("JUMP!", r.x - Math.cos(r.a) * 3.5, r.z - Math.sin(r.a) * 3.5, r.a, 3.6, "#f4b536");

    // Handwritten notes floating in the air, no background.
    const note = (text: string, x: number, z: number, h: number, color = INK, size = 2.2) => {
      const c = document.createElement("canvas");
      const g = c.getContext("2d")!;
      const f = `400 130px ${fontOf("--font-pixel-hand", "cursive")}`;
      g.font = f;
      c.width = Math.ceil(g.measureText(text).width + 40);
      c.height = 150;
      g.font = f;
      g.textBaseline = "middle";
      g.lineWidth = 14;
      g.strokeStyle = "rgba(255,243,220,0.9)";
      g.strokeText(text, 20, 78);
      g.fillStyle = color;
      g.fillText(text, 20, 78);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false }));
      sp.scale.set((size * c.width) / c.height, size, 1);
      sp.position.set(x, ground(x, z) + h, z);
      sp.material.rotation = -0.06;
      scene.add(sp);
      labels.push({ s: sp, fade: true });
    };
    note("welcome, builder ✦", -12, START_Z - 30, 6, "#e2452b", 1.7);
    note("built at 3 am, tested at 4", CENTERS[1].x + 14, CENTERS[1].y + 16, 11, "#2453b3", 1.8);
    note("one more try…", CENTERS[2].x - 14, CENTERS[2].y + 14, 10, "#c2361d", 1.8);
    note("SIC was here", 8, TOWER_Z + 14, 7, "#e2452b");
    note("made by students, for students", 0, TOWER_Z - 22, 13, INK, 2.6);
    note("the clock is ticking", -7, TOWER_Z + 6, 15, INK, 1.8);
    note("go on, jump it", 15, 128, 7, "#1f9c86", 1.8);
  }

  // ---- street lamps down both sides of the track (glow at night)
  const lampBulbMat = keepMat(new THREE.MeshBasicMaterial({ color: "#d9d2bd" }));
  const lampGlowMat = keepMat(new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0, depthWrite: false }));
  {
    const spots: Array<[number, number]> = [];
    for (let z = START_Z - 20; z > TOWER_Z + 22; z -= 16) {
      if (JUNCTION_Z.some((j) => Math.abs(z - j) < 7)) continue;
      spots.push([-5.3, z], [5.3, z + 8]);
    }
    const poleGeo = track(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6));
    const bulbGeo = track(new THREE.SphereGeometry(0.42, 10, 8));
    const glowGeo = track(new THREE.SphereGeometry(1.3, 12, 10));
    const poles = new THREE.InstancedMesh(poleGeo, mat(INK), spots.length);
    const bulbs = new THREE.InstancedMesh(bulbGeo, lampBulbMat, spots.length);
    const glows = new THREE.InstancedMesh(glowGeo, lampGlowMat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const y = terrain(x, z);
      m4.makeTranslation(x, y + 2.6, z);
      poles.setMatrixAt(i, m4);
      m4.makeTranslation(x, y + 5.4, z);
      bulbs.setMatrixAt(i, m4);
      glows.setMatrixAt(i, m4);
      colliders.push({ x, z, r: 0.3 });
    });
    poles.castShadow = !lowPower;
    scene.add(poles, bulbs, glows);
  }

  // ---- trees, rocks, clouds
  const rand = rng(7);
  const freeSpot = (x: number, z: number, pad: number) => !colliders.some((c) => c.r > 1.5 && Math.hypot(c.x - x, c.z - z) < c.r + pad);
  {
    const trunkGeo = track(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5));
    // Pines get a second, smaller tier; blossom trees get a little top puff. Same draw
    // calls as before (still one instanced mesh each), just a few more triangles.
    const leafGeo = (() => {
      const a = new THREE.ConeGeometry(1.6, 2.6, 6);
      a.translate(0, -0.5, 0);
      const b = new THREE.ConeGeometry(1.15, 2.1, 6);
      b.translate(0, 0.9, 0);
      b.rotateY(0.5);
      return track(mergeGeometries([a.toNonIndexed(), b.toNonIndexed()])!);
    })();
    const roundGeo = (() => {
      const a = new THREE.IcosahedronGeometry(1.6, 0);
      const b = new THREE.IcosahedronGeometry(0.95, 0);
      b.translate(0.5, 1.05, -0.2);
      const c = new THREE.IcosahedronGeometry(0.8, 0);
      c.translate(-0.8, 0.5, 0.6);
      return track(mergeGeometries([a, b, c])!);
    })();
    const rockGeo = track(new THREE.DodecahedronGeometry(1, 0));
    const N = lowPower ? 130 : 230;
    const trunks = new THREE.InstancedMesh(trunkGeo, mat("#7a5233"), N);
    const leaves = new THREE.InstancedMesh(leafGeo, keepMat(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })), N);
    const rounds = new THREE.InstancedMesh(roundGeo, keepMat(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })), N);
    const pineTones = ["#2f7d46", "#2a6e3f", "#3a8a4c", "#246b45"].map((c) => new THREE.Color(c));
    const blossomTones = ["#f08aa0", "#f6a5b6", "#e9768f", "#f4b536", "#ff9a62"].map((c) => new THREE.Color(c));
    const rocks = new THREE.InstancedMesh(rockGeo, mat("#a39a8c"), 60);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    let roundCount = 0;
    let coneCount = 0;
    for (let tries = 0; placed < N && tries < N * 25; tries++) {
      const x = (rand() * 2 - 1) * ISLAND_A;
      const z = (rand() * 2 - 1) * ISLAND_B;
      if (shore(x, z) > 0.86 || openness(x, z) < 3 || !freeSpot(x, z, 2)) continue;
      const y = terrain(x, z);
      const k = 0.8 + rand() * 0.7;
      s.set(k, k, k);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
      m4.compose(new THREE.Vector3(x, y + 0.8 * k, z), q, s);
      trunks.setMatrixAt(placed, m4);
      if (rand() < 0.3) {
        m4.compose(new THREE.Vector3(x, y + 2.8 * k, z), q, s);
        rounds.setColorAt(roundCount, blossomTones[rand() < 0.8 ? Math.floor(rand() * 3) : 3 + Math.floor(rand() * 2)]);
        rounds.setMatrixAt(roundCount++, m4);
      } else {
        m4.compose(new THREE.Vector3(x, y + 3.2 * k, z), q, s);
        leaves.setColorAt(coneCount, pineTones[Math.floor(rand() * pineTones.length)]);
        leaves.setMatrixAt(coneCount++, m4);
      }
      colliders.push({ x, z, r: 0.7 * k });
      placed++;
    }
    trunks.count = placed;
    leaves.count = coneCount;
    rounds.count = roundCount;
    let rc = 0;
    for (let tries = 0; rc < 60 && tries < 1500; tries++) {
      const x = (rand() * 2 - 1) * ISLAND_A;
      const z = (rand() * 2 - 1) * ISLAND_B;
      if (shore(x, z) > 0.88 || openness(x, z) < 2 || !freeSpot(x, z, 2)) continue;
      const k = 0.6 + rand() * 1.4;
      s.set(k, k * 0.7, k);
      q.setFromEuler(new THREE.Euler(rand(), rand() * 6, rand()));
      m4.compose(new THREE.Vector3(x, terrain(x, z) + 0.3 * k, z), q, s);
      rocks.setMatrixAt(rc++, m4);
      colliders.push({ x, z, r: k * 0.9 });
    }
    rocks.count = rc;
    for (const m of [trunks, leaves, rounds, rocks]) {
      m.castShadow = !lowPower;
      m.receiveShadow = !lowPower;
      scene.add(m);
    }
  }
  // ---- grass tufts and flower clumps: two instanced meshes, no shadows, one draw call each
  {
    const tuftGeo = track(new THREE.ConeGeometry(0.16, 0.75, 4));
    tuftGeo.translate(0, 0.3, 0);
    const flowerGeo = track(new THREE.OctahedronGeometry(0.2, 0));
    flowerGeo.translate(0, 0.42, 0);
    const NT = lowPower ? 900 : 2000;
    const NF = lowPower ? 260 : 520;
    const tufts = new THREE.InstancedMesh(tuftGeo, keepMat(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })), NT);
    const flowers = new THREE.InstancedMesh(flowerGeo, keepMat(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true })), NF);
    const r = rng(2026);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    const grassTones = ["#5aa845", "#6fb84b", "#4a9440", "#86c456"];
    const petals = ["#fff3dc", "#f4b536", "#e2452b", "#f08aa0", "#7fa8ff"];
    const ok = (x: number, z: number) => shore(x, z) < 0.86 && openness(x, z) > 1.2 && freeSpot(x, z, 0.6);
    let nt = 0;
    for (let tries = 0; nt < NT && tries < NT * 6; tries++) {
      // Tufts gather in loose clumps around random seeds
      const cx = (r() * 2 - 1) * ISLAND_A;
      const cz = (r() * 2 - 1) * ISLAND_B;
      for (let k = 0; k < 5 && nt < NT; k++) {
        const x = cx + (r() - 0.5) * 5;
        const z = cz + (r() - 0.5) * 5;
        if (!ok(x, z)) continue;
        const sc = 0.7 + r() * 0.8;
        s.set(sc, sc * (0.8 + r() * 0.6), sc);
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4));
        m4.compose(v.set(x, terrain(x, z) - 0.05, z), q, s);
        tufts.setMatrixAt(nt, m4);
        tufts.setColorAt(nt, c.set(grassTones[Math.floor(r() * grassTones.length)]));
        nt++;
      }
    }
    let nf = 0;
    for (let tries = 0; nf < NF && tries < NF * 8; tries++) {
      const cx = (r() * 2 - 1) * ISLAND_A;
      const cz = (r() * 2 - 1) * ISLAND_B;
      const tone = petals[Math.floor(r() * petals.length)];
      for (let k = 0; k < 7 && nf < NF; k++) {
        const x = cx + (r() - 0.5) * 6;
        const z = cz + (r() - 0.5) * 6;
        if (!ok(x, z)) continue;
        const sc = 0.7 + r() * 0.6;
        s.set(sc, sc, sc);
        q.setFromAxisAngle(v.set(0, 1, 0), r() * 6);
        m4.compose(v.set(x, terrain(x, z), z), q, s);
        flowers.setMatrixAt(nf, m4);
        flowers.setColorAt(nf, c.set(tone));
        nf++;
      }
    }
    tufts.count = nt;
    flowers.count = nf;
    scene.add(tufts, flowers);
  }
  const clouds: THREE.Group[] = [];
  {
    const g = track(new THREE.IcosahedronGeometry(3, 0));
    const white = keepMat(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }));
    for (let i = 0; i < 13; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(g, white);
        m.position.set(j * 3.2 - 5, Math.sin(j) * 1.2, rand() * 2);
        m.scale.setScalar(0.7 + rand() * 0.6);
        c.add(m);
      }
      c.position.set((rand() * 2 - 1) * 170, 40 + rand() * 16, (rand() * 2 - 1) * 230);
      scene.add(c);
      clouds.push(c);
    }
  }

  // ---- gears to collect
  /** Each can's transform lives on a plain Object3D; all cans draw as one instanced mesh. */
  const gears: Array<{ m: THREE.Object3D; x: number; z: number; taken: boolean }> = [];
  // A soft golden halo behind every gear, added on top of the scene so it glows.
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,236,150,1)");
    grad.addColorStop(0.35, "rgba(255,196,64,0.55)");
    grad.addColorStop(1, "rgba(255,170,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return canvasTex(c, 1);
  })();
  const glowMat = keepMat(new THREE.PointsMaterial({ map: glowTex, color: "#ff9a62", size: 4.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 }));
  // Pickups are nitro cans: red body, cream band, ink cap and nozzle. One merged mesh each.
  const gearMat = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: "#5a1206", emissiveIntensity: 0.6, flatShading: true }));
  const canGeo = (() => {
    const part = (g: THREE.BufferGeometry, color: string, y: number) => {
      const out = (g.index ? g.toNonIndexed() : g) as THREE.BufferGeometry;
      out.deleteAttribute("uv");
      out.translate(0, y, 0);
      const c = new THREE.Color(color);
      const n = out.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      out.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      return out;
    };
    const merged = mergeGeometries([
      part(new THREE.CylinderGeometry(0.46, 0.46, 1.25, 12), "#e2452b", 0),
      part(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 12), "#fff3dc", 0.05),
      part(new THREE.CylinderGeometry(0.3, 0.46, 0.22, 12), "#1d1813", 0.73),
      part(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 8), "#f4b536", 0.95),
      part(new THREE.CylinderGeometry(0.47, 0.47, 0.1, 12), "#1d1813", -0.62),
    ])!;
    return track(merged);
  })();
  {
    const r2 = rng(42);
    for (let tries = 0; gears.length < 34 && tries < 1500; tries++) {
      const x = (r2() * 2 - 1) * ISLAND_A;
      const z = (r2() * 2 - 1) * ISLAND_B;
      if (shore(x, z) > 0.84) continue;
      if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 2)) continue;
      if (gears.some((g) => Math.hypot(g.x - x, g.z - z) < 10)) continue;
      const m = new THREE.Object3D();
      m.rotation.z = 0.25;
      m.position.set(x, ground(x, z) + 1.4, z);
      gears.push({ m, x, z, taken: false });
    }
  }
  // One draw call for every can, one for every halo
  const canInst = new THREE.InstancedMesh(canGeo, gearMat, gears.length);
  canInst.castShadow = !lowPower;
  canInst.frustumCulled = false;
  scene.add(canInst);
  const glowPos = new Float32Array(gears.length * 3);
  const glowGeo = track(new THREE.BufferGeometry());
  glowGeo.setAttribute("position", new THREE.BufferAttribute(glowPos, 3));
  const glowPts = new THREE.Points(glowGeo, glowMat);
  glowPts.frustumCulled = false;
  glowPts.renderOrder = 2;
  scene.add(glowPts);
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  let collected = 0;
  /** Nitro tank, 0..1: a full tank lasts about 3.5 s of boost. */
  let nitroTank = 1;
  /** Driving on the coast loop right now (nitro stays full there). */
  let onLoop = false;
  const NITRO_BURN = 0.28;
  const NITRO_REFILL = 0.02;
  const NITRO_PER_CAN = 0.33;
  cb.onCollect(0, gears.length);

  // ---- cones you can knock over
  const cones: Array<{ g: THREE.Group; x: number; z: number; vx: number; vz: number; tip: number; tipAxis: THREE.Vector3 }> = [];
  let coneInst: THREE.InstancedMesh;
  let bandInst: THREE.InstancedMesh;
  {
    const coneGeo = track(new THREE.ConeGeometry(0.45, 1.2, 8));
    const bandGeo = track(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 8));
    const r3 = rng(99);
    const spots: Array<[number, number]> = [];
    CENTERS.forEach((c) => {
      for (let i = 0; i < 6; i++) {
        const a = r3() * Math.PI * 2;
        spots.push([c.x + Math.cos(a) * (5 + r3() * 4), c.y + Math.sin(a) * (5 + r3() * 4)]);
      }
    });
    // A slalom down part of the track
    for (let i = 0; i < 6; i++) spots.push([i % 2 ? 1.8 : -1.8, 105 - i * 4]);
    coneGeo.translate(0, 0.6, 0);
    bandGeo.translate(0, 0.6, 0);
    coneInst = new THREE.InstancedMesh(coneGeo, mat("#ff7a1a"), spots.length);
    bandInst = new THREE.InstancedMesh(bandGeo, mat(CREAM), spots.length);
    coneInst.castShadow = !lowPower;
    for (const [x, z] of spots) {
      // the transform lives on a plain Group; both parts draw instanced
      const g = new THREE.Group();
      g.position.set(x, terrain(x, z), z);
      g.updateMatrix();
      coneInst.setMatrixAt(cones.length, g.matrix);
      bandInst.setMatrixAt(cones.length, g.matrix);
      cones.push({ g, x, z, vx: 0, vz: 0, tip: 0, tipAxis: new THREE.Vector3(1, 0, 0) });
    }
    for (const m of [coneInst, bandInst]) {
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  // ---- the rover
  /** The rover's paint (changeable in Customise). */
  const roverPaint = keepMat(new THREE.MeshLambertMaterial({ color: "#e2452b", flatShading: true }));
  const rover = new THREE.Group();
  const body = new THREE.Group();
  rover.add(body);
  box(2.2, 0.7, 3.2, "#e2452b", body, 0, 0.55, 0);
  box(1.8, 0.7, 1.5, CREAM, body, 0, 1.25, -0.3);
  box(1.9, 0.12, 1.6, INK, body, 0, 1.95, -0.3);
  box(1.6, 0.4, 0.06, "#5fb4e0", body, 0, 1.4, 0.47);
  box(2.3, 0.3, 0.3, INK, body, 0, 0.5, 1.6);
  box(0.08, 1.6, 0.08, INK, body, 0.7, 1.95, -0.9);
  const flag = box(0.6, 0.35, 0.04, "#f4b536", body, 1.0, 3.2, -0.9);
  flag.position.y = 3.2;
  // Details: a cream racing stripe, side skirts, a roof light bar, tail lights and a bumper
  box(0.5, 0.02, 3.22, CREAM, body, 0, 0.9, 0);
  box(0.06, 0.18, 2.6, INK, body, 1.12, 0.45, 0);
  box(0.06, 0.18, 2.6, INK, body, -1.12, 0.45, 0);
  box(1.3, 0.16, 0.3, INK, body, 0, 2.02, 0.3);
  box(2.3, 0.25, 0.25, INK, body, 0, 0.5, -1.62);
  const roofLampMat = keepMat(new THREE.MeshBasicMaterial({ color: "#ffe9a8" }));
  const tailMat = keepMat(new THREE.MeshBasicMaterial({ color: "#ff4a3a" }));
  {
    const lampGeo = track(new THREE.BoxGeometry(0.22, 0.12, 0.1));
    [-0.45, -0.15, 0.15, 0.45].forEach((x) => {
      const l = new THREE.Mesh(lampGeo, roofLampMat);
      l.position.set(x, 2.2, 0.46);
      body.add(l);
    });
    [-0.85, 0.85].forEach((x) => {
      const l = new THREE.Mesh(lampGeo, tailMat);
      l.scale.set(1.4, 1.3, 1);
      l.position.set(x, 0.85, -1.62);
      body.add(l);
    });
  }
  [-0.7, 0.7].forEach((x) => {
    const l = new THREE.Mesh(track(new THREE.BoxGeometry(0.4, 0.25, 0.1)), keepMat(new THREE.MeshBasicMaterial({ color: "#fff7c2" })));
    l.position.set(x, 0.75, 1.62);
    body.add(l);
  });
  const wheels: THREE.Object3D[] = [];
  const wheelGeo = track(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10));
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = track(new THREE.CylinderGeometry(0.26, 0.26, 0.54, 8));
  hubGeo.rotateZ(Math.PI / 2);
  [
    [-1.2, 1.1],
    [1.2, 1.1],
    [-1.2, -1.1],
    [1.2, -1.1],
  ].forEach(([x, z]) => {
    const w = new THREE.Group();
    w.position.set(x, 0.55, z);
    const m = new THREE.Mesh(wheelGeo, mat(INK));
    m.castShadow = !lowPower;
    w.add(m);
    box(0.52, 0.18, 0.18, "#f4b536", m, 0, -0.09, 0);
    // Hub caps on both faces of the tyre
    const hub = new THREE.Mesh(hubGeo, mat("#d9d2bd"));
    m.add(hub);
    rover.add(w);
    wheels.push(w);
  });
  // A small rover, closer to a robot than a car
  rover.scale.setScalar(0.68);

  // Nitro: two flame jets out of the back while boosting (an outer orange cone, an inner blue core)
  const nitro = new THREE.Group();
  nitro.position.set(0, 0.6, -1.7);
  body.add(nitro);
  const flameMat = keepMat(new THREE.MeshBasicMaterial({ color: "#ff8a1f", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const coreMat = keepMat(new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flameGeo = track(new THREE.ConeGeometry(0.32, 1.6, 10, 1, true));
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -0.8);
  const coreGeo = track(new THREE.ConeGeometry(0.16, 0.9, 8, 1, true));
  coreGeo.rotateX(-Math.PI / 2);
  coreGeo.translate(0, 0, -0.45);
  const jets = [-0.55, 0.55].map((x) => {
    const j = new THREE.Group();
    j.position.x = x;
    j.add(new THREE.Mesh(flameGeo, flameMat), new THREE.Mesh(coreGeo, coreMat));
    box(0.34, 0.3, 0.3, "#3b3430", j, 0, -0.15, 0.1);
    nitro.add(j);
    return j;
  });
  nitro.visible = false;
  /** 0 = off, 1 = full nitro; eased so the flames and the view widen smoothly. */
  let nitroLevel = 0;
  // The rover's fixed body panels share one mesh (they never move relative to the body),
  // so the always-visible rover costs a few draw calls instead of dozens.
  {
    const plain = new Set<THREE.Material>(mats.values());
    const parts: THREE.BufferGeometry[] = [];
    const paintParts: THREE.BufferGeometry[] = [];
    const red = mat("#e2452b");
    const panels = body.children.filter((c) => (c as THREE.Mesh).isMesh && c !== flag && plain.has((c as THREE.Mesh).material as THREE.Material)) as THREE.Mesh[];
    for (const m of panels) {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()) as THREE.BufferGeometry;
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
      g.applyMatrix4(m.matrix);
      const c = (m.material as THREE.MeshLambertMaterial).color;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      // the red bodywork keeps its own material so it can be repainted
      (m.material === red ? paintParts : parts).push(g);
      body.remove(m);
    }
    if (parts.length) {
      const merged = new THREE.Mesh(track(mergeGeometries(parts)!), keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
      merged.castShadow = !lowPower;
      merged.receiveShadow = !lowPower;
      body.add(merged);
      parts.forEach((g) => g.dispose());
    }
    if (paintParts.length) {
      for (const g of paintParts) g.deleteAttribute("color");
      const paint = new THREE.Mesh(track(mergeGeometries(paintParts)!), roverPaint);
      paint.castShadow = !lowPower;
      paint.receiveShadow = !lowPower;
      body.add(paint);
      paintParts.forEach((g) => g.dispose());
    }
  }
  scene.add(rover);

  // Headlight beams: a soft glowing fan on the ground ahead, only after dark.
  const beamMat = keepMat(
    new THREE.MeshBasicMaterial({
      map: (() => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 128;
        const g = c.getContext("2d")!;
        // Canvas top is the end nearest the rover (the plane is laid flat facing forward):
        // narrow and bright at the lamps, spreading wide and fading down the road.
        const grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, "rgba(255,240,190,0.9)");
        grad.addColorStop(1, "rgba(255,240,190,0)");
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(20, 0);
        g.lineTo(44, 0);
        g.lineTo(64, 128);
        g.lineTo(0, 128);
        g.closePath();
        g.fill();
        return canvasTex(c, 1);
      })(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    }),
  );
  const beam = new THREE.Mesh(track(new THREE.PlaneGeometry(7.5, 12)), beamMat);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.12, 7.6);
  beam.visible = false;
  rover.add(beam);

  // Drifting motes by day, fireflies by night: one small point cloud that follows the rover.
  const MOTES = lowPower ? 60 : 130;
  const moteBox = { w: 70, h: 14 };
  const motePos = new Float32Array(MOTES * 3);
  const moteVel = new Float32Array(MOTES * 3);
  {
    const r = rng(77);
    for (let i = 0; i < MOTES; i++) {
      motePos.set([(r() - 0.5) * moteBox.w, 0.5 + r() * moteBox.h, (r() - 0.5) * moteBox.w], i * 3);
      moteVel.set([(r() - 0.5) * 0.6, (r() - 0.3) * 0.25, (r() - 0.5) * 0.6], i * 3);
    }
  }
  const moteGeo = track(new THREE.BufferGeometry());
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const moteMat = keepMat(
    new THREE.PointsMaterial({ map: glowTex, color: "#fff3dc", size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }),
  );
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // The guide arrow: a flat paper cut-out that always faces the camera and turns on screen.
  const arrowTex = DAY_COLORS.map((color) => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const path = (dx: number, dy: number) => {
      g.beginPath();
      g.moveTo(128 + dx, 30 + dy);
      g.lineTo(192 + dx, 112 + dy);
      g.lineTo(146 + dx, 112 + dy);
      g.lineTo(146 + dx, 226 + dy);
      g.lineTo(110 + dx, 226 + dy);
      g.lineTo(110 + dx, 112 + dy);
      g.lineTo(64 + dx, 112 + dy);
      g.closePath();
    };
    g.fillStyle = INK;
    path(7, 6);
    g.fill();
    g.fillStyle = color;
    path(0, 0);
    g.fill();
    g.save();
    path(0, 0);
    g.clip();
    g.fillStyle = g.createPattern(paperGrain(), "repeat")!;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.fillRect(0, 0, 128, 256);
    g.restore();
    g.lineWidth = 6;
    g.lineJoin = "round";
    g.strokeStyle = INK;
    path(0, 0);
    g.stroke();
    return canvasTex(c);
  });
  const arrowMat = keepMat(new THREE.SpriteMaterial({ map: arrowTex[0], depthTest: false, depthWrite: false, transparent: true }));
  const arrow = new THREE.Sprite(arrowMat);
  arrow.scale.set(1.6, 1.6, 1);
  arrowMat.opacity = 0.8;
  arrow.renderOrder = 10;
  scene.add(arrow);
  const camInv = new THREE.Quaternion();
  const dirV = new THREE.Vector3();
  let arrowAngle = 0;
  const visited = new Set<number>();
  const guideTarget = { x: 0, z: 0, on: false };
  let guideKey = "";

  // Dust puffs behind the wheels
  const dustGeo = track(new THREE.IcosahedronGeometry(0.35, 0));
  const dust: Array<{ m: THREE.Mesh; mat: THREE.MeshLambertMaterial; life: number }> = [];
  for (let i = 0; i < 30; i++) {
    const dm = keepMat(new THREE.MeshLambertMaterial({ color: "#f0e2c6", transparent: true, opacity: 0.8, flatShading: true }));
    const m = new THREE.Mesh(dustGeo, dm);
    m.visible = false;
    scene.add(m);
    dust.push({ m, mat: dm, life: 0 });
  }
  let dustI = 0;

  // ---- state
  const SPAWN = { x: 0, z: START_Z - 6, heading: Math.PI };
  const car = { x: SPAWN.x, z: SPAWN.z, y: 0, vy: 0, heading: SPAWN.heading, speed: 0, air: false, pitch: 0, roll: 0, steer: 0 };
  const keys = new Set<string>();
  const input = { x: 0, y: 0, boost: false, held: false, jump: false };
  /** Where the player has turned the camera, on top of "behind the rover". */
  let lookYaw = 0;
  let lookPitch = 0;
  let driving = false;
  let started = false;
  /** Waiting for the first move to start the time trial. */
  let runArmed = false;
  let currentZone: number | null = null;
  let view = 0.35;
  /** Top speed multiplier from the menu (Chill / Normal / Fast). */
  let speedScale = SPEED_LEVELS[1];
  let arrowOn = true;
  const camPos = new THREE.Vector3(150, 90, 150);
  const camLook = new THREE.Vector3();

  function respawn() {
    car.x = SPAWN.x;
    car.z = SPAWN.z;
    car.heading = SPAWN.heading;
    car.speed = 0;
    car.vy = 0;
    car.air = false;
    car.y = ground(car.x, car.z);
  }
  respawn();
  /** Back to the start (replaced once the vehicles exist, to always put you in the rover). */
  let resetPlayer = respawn;

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const down = e.type === "keydown";
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) && started) e.preventDefault();
    if (down) keys.add(e.code);
    else keys.delete(e.code);
    if (down && e.code === "KeyR") resetPlayer();
    if (down && e.code === "KeyF" && !e.repeat) toggleVehicle();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  const clearKeys = () => keys.clear();
  window.addEventListener("blur", clearKeys);

  /** Touch screen held sideways: use the low chase camera. */
  let chaseCam = false;
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    chaseCam = window.matchMedia("(pointer: coarse)").matches && w > h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = w < h ? 62 : 50;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  // ---- minimap
  const mm = minimap?.getContext("2d") ?? null;
  const mapScale = (minimap?.width ?? 220) / 2 / (ISLAND_B * 1.1 + 4);
  const toPath = (k: number) => {
    const path = new Path2D();
    shorePoints(k).forEach(([x, z], i) => (i ? path.lineTo(x * mapScale, z * mapScale) : path.moveTo(x * mapScale, z * mapScale)));
    path.closePath();
    return path;
  };
  const sandPath = toPath(1);
  const grassPath = toPath(0.9);
  const loopPath = toPath(RING_K);
  const mapFont = `400 ${Math.round((minimap?.width ?? 220) * 0.09)}px ${fontOf("--font-pixel-digits", "monospace")}`;
  const drawMinimap = () => {
    if (!mm || !minimap) return;
    const W = minimap.width;
    const s = mapScale;
    mm.clearRect(0, 0, W, W);
    mm.save();
    mm.translate(W / 2, W / 2);
    mm.fillStyle = "#2f8fb3";
    mm.beginPath();
    mm.arc(0, 0, W / 2, 0, Math.PI * 2);
    mm.fill();
    mm.fillStyle = "#f0d29a";
    mm.fill(sandPath);
    mm.fillStyle = "#7fbf4d";
    mm.fill(grassPath);
    mm.strokeStyle = "#3b3430";
    mm.lineCap = "round";
    // the coast loop round the island
    mm.lineWidth = RING_HALF * 2 * s;
    mm.stroke(loopPath);
    mm.lineWidth = TRACK_W * 2 * s;
    mm.beginPath();
    mm.moveTo(0, START_Z * s);
    mm.lineTo(0, TOWER_Z * s);
    mm.stroke();
    mm.lineWidth = BRANCH_W * 2 * s;
    CENTERS.forEach((c, d) => {
      mm.beginPath();
      mm.moveTo(0, JUNCTION_Z[d] * s);
      mm.lineTo(c.x * s, c.y * s);
      mm.stroke();
    });
    CENTERS.forEach((c, d) => {
      mm.fillStyle = "#efe1c4";
      mm.beginPath();
      mm.arc(c.x * s, c.y * s, PLAZA * s, 0, Math.PI * 2);
      mm.fill();
      mm.fillStyle = DAY_COLORS[d];
      mm.globalAlpha = 0.35;
      mm.fill();
      mm.globalAlpha = 1;
    });
    mm.fillStyle = "#c7553a";
    mm.fillRect(-4 * s, (TOWER_Z - 4) * s, 8 * s, 8 * s);
    for (const g of gears) {
      if (g.taken) continue;
      mm.fillStyle = "#f4b536";
      mm.fillRect(g.x * s - 1.5, g.z * s - 1.5, 3, 3);
    }
    for (const z of zoneRt) {
      mm.fillStyle = DAY_COLORS[z.day];
      mm.strokeStyle = INK;
      mm.lineWidth = 2;
      mm.beginPath();
      mm.arc(z.x * s, z.z * s, z.id === currentZone ? 6 : 4, 0, Math.PI * 2);
      mm.fill();
      mm.stroke();
    }
    if (guideTarget.on && started) {
      mm.setLineDash([4, 4]);
      mm.strokeStyle = CREAM;
      mm.lineWidth = 2.5;
      mm.beginPath();
      mm.moveTo(car.x * s, car.z * s);
      mm.lineTo(guideTarget.x * s, guideTarget.z * s);
      mm.stroke();
      mm.setLineDash([]);
    }
    mm.textAlign = "center";
    mm.textBaseline = "middle";
    mm.font = mapFont;
    CENTERS.forEach((c, d) => {
      const cx = (c.x + SIDE[d] * (PLAZA + 6)) * s;
      const cy = c.y * s;
      mm.lineWidth = 3;
      mm.strokeStyle = INK;
      mm.fillStyle = DAY_COLORS[d];
      mm.beginPath();
      mm.arc(cx, cy, W * 0.065, 0, Math.PI * 2);
      mm.fill();
      mm.stroke();
      mm.fillStyle = d === 0 ? INK : CREAM;
      mm.fillText(String(d + 1), cx, cy + 1);
    });
    // Cars you can drive: a small car shape in its paint colour, with a light ring so it
    // stands out on the grass (the one you're driving is the arrow instead)
    for (const v of vehicles) {
      if (mode === "drive" && v === activeV) continue;
      mm.save();
      mm.translate(v.x * s, v.z * s);
      mm.fillStyle = "rgba(255, 243, 220, 0.85)";
      mm.beginPath();
      mm.arc(0, 0, 13, 0, Math.PI * 2);
      mm.fill();
      mm.rotate(-v.heading + Math.PI);
      mm.fillStyle = `#${v.paint.color.getHexString()}`;
      mm.strokeStyle = INK;
      mm.lineWidth = 1.5;
      mm.beginPath();
      mm.lineWidth = 2;
      mm.roundRect(-5.5, -9, 11, 18, 3);
      mm.fill();
      mm.stroke();
      mm.fillStyle = INK;
      mm.fillRect(-4, -4.5, 8, 4.5);
      mm.restore();
    }
    mm.translate(car.x * s, car.z * s);
    mm.rotate(-car.heading + Math.PI);
    mm.fillStyle = CREAM;
    mm.strokeStyle = INK;
    mm.lineWidth = 2;
    mm.beginPath();
    mm.moveTo(0, -8);
    mm.lineTo(6, 6);
    mm.lineTo(-6, 6);
    mm.closePath();
    mm.fill();
    mm.stroke();
    mm.restore();
  };

  // ---- life: birds, butterflies, people strolling, boats, balloons, wind turbines.
  // Everything that moves is one instanced mesh or one merged mesh per thing, updated
  // with a handful of matrix writes per frame.
  /** Moving things: kept out of the static batching pass below. */
  const lifeMovers: THREE.Object3D[] = [];
  const tint = (g: THREE.BufferGeometry, color: string, m?: THREE.Matrix4) => {
    const out = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry;
    if (out.attributes.uv) out.deleteAttribute("uv");
    if (m) out.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = out.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    out.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return out;
  };
  const at = (x: number, y: number, z: number, ry = 0, s = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
  const vcMat = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const lr = rng(311);
  const lm4 = new THREE.Matrix4();
  const lq = new THREE.Quaternion();
  const lv = new THREE.Vector3();
  const ls = new THREE.Vector3();
  const le = new THREE.Euler();
  const lmA = new THREE.Matrix4();

  // Blocky creatures: a body plus a left and a right wing, each one instanced mesh, so the
  // wings really hinge at the shoulders and flap (three draw calls per kind of creature).
  const lpivot = new THREE.Matrix4();
  const lwing = new THREE.Matrix4();
  const wingMats = (base: THREE.Matrix4, px: number, py: number, angle: number, out: THREE.Matrix4) =>
    out.copy(base).multiply(lpivot.makeTranslation(px, py, 0)).multiply(lwing.makeRotationZ(angle));

  // Birds: three flocks of chunky gulls in a V, circling over the island by day.
  const birdBodyGeo = track(
    mergeGeometries([
      tint(new THREE.BoxGeometry(0.7, 0.6, 1.5), "#fbf7ee", at(0, 0, 0)),
      tint(new THREE.BoxGeometry(0.56, 0.56, 0.56), "#fbf7ee", at(0, 0.32, 0.86)),
      tint(new THREE.BoxGeometry(0.2, 0.16, 0.34), "#f4b536", at(0, 0.26, 1.28)),
      tint(new THREE.BoxGeometry(0.58, 0.1, 0.1), INK, at(0, 0.42, 1.0)),
      tint(new THREE.BoxGeometry(0.52, 0.12, 0.5), "#9aa3ad", at(0, 0.08, -0.98)),
    ])!,
  );
  const birdWing = (side: number) =>
    track(
      mergeGeometries([
        tint(new THREE.BoxGeometry(1.1, 0.12, 0.8), "#fbf7ee", at(side * 0.55, 0, 0)),
        tint(new THREE.BoxGeometry(0.6, 0.12, 0.6), "#5d6670", at(side * 1.4, 0, -0.08)),
      ])!,
    );
  const FLOCKS = [
    { cx: -40, cz: 40, r: 70, h: 26, sp: 0.09 },
    { cx: 50, cz: -60, r: 55, h: 30, sp: -0.11 },
    { cx: 0, cz: 120, r: 45, h: 22, sp: 0.13 },
  ];
  const PER_FLOCK = lowPower ? 4 : 6;
  const birdMat = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const birdsBody = new THREE.InstancedMesh(birdBodyGeo, birdMat, FLOCKS.length * PER_FLOCK);
  const birdsL = new THREE.InstancedMesh(birdWing(-1), birdMat, FLOCKS.length * PER_FLOCK);
  const birdsR = new THREE.InstancedMesh(birdWing(1), birdMat, FLOCKS.length * PER_FLOCK);
  const birds = new THREE.Group();
  for (const m of [birdsBody, birdsL, birdsR]) {
    m.frustumCulled = false;
    birds.add(m);
  }
  scene.add(birds);
  lifeMovers.push(birds);

  // Butterflies: bright two-panel wings that fold and open, around the rover by day
  // (fireflies take over at night).
  const BUTTERFLIES = lowPower ? 10 : 20;
  const flyWing = (side: number) =>
    track(
      mergeGeometries([
        tint(new THREE.BoxGeometry(0.46, 0.04, 0.4), "#ffffff", at(side * 0.25, 0, 0.1)),
        tint(new THREE.BoxGeometry(0.34, 0.04, 0.3), "#ffffff", at(side * 0.2, 0, -0.22)),
        tint(new THREE.BoxGeometry(0.12, 0.05, 0.12), INK, at(side * 0.4, 0.01, 0.2)),
      ])!,
    );
  const flyMat = keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const fliesBody = new THREE.InstancedMesh(track(tint(new THREE.BoxGeometry(0.1, 0.1, 0.5), INK)), flyMat, BUTTERFLIES);
  const fliesL = new THREE.InstancedMesh(flyWing(-1), flyMat, BUTTERFLIES);
  const fliesR = new THREE.InstancedMesh(flyWing(1), flyMat, BUTTERFLIES);
  const flies = new THREE.Group();
  const FLY_TONES = ["#f4b536", "#f08aa0", "#7fa8ff", "#ff9a62", "#ffffff"];
  const flyData = Array.from({ length: BUTTERFLIES }, (_, i) => {
    const c = new THREE.Color(FLY_TONES[i % FLY_TONES.length]);
    fliesL.setColorAt(i, c);
    fliesR.setColorAt(i, c);
    fliesBody.setColorAt(i, new THREE.Color("#ffffff"));
    return { ox: (lr() - 0.5) * 50, oz: (lr() - 0.5) * 50, ph: lr() * 10, sp: 0.6 + lr() * 0.6 };
  });
  for (const m of [fliesBody, fliesL, fliesR]) {
    m.frustumCulled = false;
    flies.add(m);
  }
  scene.add(flies);
  lifeMovers.push(flies);

  // Sailboats circling just offshore.
  const boatGeo = track(
    mergeGeometries([
      tint(new THREE.BoxGeometry(1.6, 0.6, 4), "#e2452b", at(0, 0.3, 0)),
      tint(new THREE.BoxGeometry(1.7, 0.15, 4.1), INK, at(0, 0.62, 0)),
      tint(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 5), "#7a5233", at(0, 2.7, 0.2)),
      tint(
        (() => {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute([0, 4.6, 0.25, 0, 0.9, 0.25, 0, 0.9, -1.9, 0, 4.6, 0.25, 0, 0.9, -1.9, 0, 0.9, 0.25], 3));
          g.computeVertexNormals();
          return g;
        })(),
        CREAM,
      ),
    ])!,
  );
  const boatMat = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  const boats = [0.4, 2.5, 4.4].map((a, i) => {
    const m = new THREE.Mesh(boatGeo, boatMat);
    m.scale.setScalar(1.3);
    scene.add(m);
    lifeMovers.push(m);
    return { m, a, sp: (i % 2 ? -1 : 1) * (0.012 + i * 0.004), k: 1.1 + i * 0.03 };
  });

  // Hot-air balloons in festival colours drifting high over the island.
  const balloonGeo = (() => {
    const env = new THREE.IcosahedronGeometry(3.4, 1).toNonIndexed();
    env.scale(1, 1.15, 1);
    const pal = ["#e2452b", "#f4b536", CREAM, "#2453b3"].map((c) => new THREE.Color(c));
    const n = env.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let f = 0; f < n / 3; f++) {
      // stripes by the angle round the envelope
      const x = env.attributes.position.getX(f * 3);
      const z = env.attributes.position.getZ(f * 3);
      const c = pal[Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % pal.length];
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f * 3 + k) * 3);
    }
    env.deleteAttribute("uv");
    env.setAttribute("color", new THREE.BufferAttribute(col, 3));
    env.translate(0, 5, 0);
    return track(mergeGeometries([env, tint(new THREE.BoxGeometry(1.2, 0.9, 1.2), "#7a5233", at(0, 0, 0)), tint(new THREE.CylinderGeometry(1.2, 0.6, 1.6, 8, 1, true), INK, at(0, 1.4, 0))])!);
  })();
  const balloons = [
    { cx: -60, cz: -20, r: 40, h: 52, sp: 0.02, ph: 0 },
    { cx: 60, cz: 70, r: 50, h: 60, sp: -0.016, ph: 2 },
  ].map((b) => {
    const m = new THREE.Mesh(balloonGeo, vcMat);
    scene.add(m);
    lifeMovers.push(m);
    return { ...b, m };
  });

  // Wind turbines on the hills: static towers (batched below) and spinning rotors.
  const rotorGeo = (() => {
    const blade = new THREE.BoxGeometry(0.5, 6, 0.15);
    blade.translate(0, 3, 0);
    const parts = [0, 1, 2].map((i) => tint(blade, CREAM, new THREE.Matrix4().makeRotationZ((i * Math.PI * 2) / 3)));
    parts.push(tint(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 8), "#e2452b", new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    return track(mergeGeometries(parts)!);
  })();
  const rotors: THREE.Mesh[] = [];
  {
    let placed = 0;
    for (let tries = 0; placed < 3 && tries < 400; tries++) {
      const a = lr() * Math.PI * 2;
      const x = Math.cos(a) * ISLAND_A * 0.72;
      const z = Math.sin(a) * ISLAND_B * 0.72;
      if (shore(x, z) > 0.84 || openness(x, z) < 8 || !freeSpot(x, z, 3)) continue;
      if (rotors.some((r) => Math.hypot(r.position.x - x, r.position.z - z) < 60)) continue;
      const y = terrain(x, z);
      const tower = mesh(new THREE.CylinderGeometry(0.35, 0.6, 14, 8), CREAM, scene, x, y + 7, z);
      tower.castShadow = !lowPower;
      const rotor = new THREE.Mesh(rotorGeo, vcMat);
      rotor.position.set(x, y + 14, z + 0.7);
      rotor.lookAt(0, y + 14, 0);
      rotor.rotateY(Math.PI);
      scene.add(rotor);
      lifeMovers.push(rotor);
      rotors.push(rotor);
      colliders.push({ x, z, r: 1 });
      placed++;
    }
  }

  // ---- more map: market stalls round each plaza and benches along the track (static)
  {
    const stripes = ["#e2452b", "#2453b3", "#1f9c86", "#f08aa0", "#f4b536"];
    CENTERS.forEach((c, d) => {
      for (let k = 0; k < 4; k++) {
        // round the far side of the plaza, away from the road in
        const a = DISTRICT_ANGLES[d] + (k - 1.5) * 0.42;
        const x = c.x + Math.cos(a) * (PLAZA + 2.5);
        const z = c.y + Math.sin(a) * (PLAZA + 2.5);
        if (!freeSpot(x, z, 1.5) || shore(x, z) > 0.84) continue;
        const g = new THREE.Group();
        g.position.set(x, terrain(x, z), z);
        g.rotation.y = -a + Math.PI / 2;
        scene.add(g);
        const roof = stripes[(d * 4 + k) % stripes.length];
        box(2.6, 1.1, 1.6, "#c4a676", g, 0, 0, 0.5);
        box(2.8, 0.12, 1.8, roof, g, 0, 1.1, 0.5);
        [-1.25, 1.25].forEach((px) => box(0.12, 2.3, 0.12, INK, g, px, 0, -0.35));
        const top = mesh(new THREE.ConeGeometry(2.1, 1.1, 4), roof, g, 0, 2.85, 0);
        top.rotation.y = Math.PI / 4;
        top.scale.set(1, 1, 0.75);
        box(2.9, 0.18, 0.08, CREAM, g, 0, 2.25, -0.95);
        colliders.push({ x, z, r: 1.8 });
      }
    });
    for (let z = START_Z - 28; z > TOWER_Z + 28; z -= 32) {
      [-1, 1].forEach((side) => {
        const zz = z + (side > 0 ? 0 : 8) + 4;
        if (JUNCTION_Z.some((j) => Math.abs(zz - j) < 9)) return;
        const x = side * 6.6;
        const g = new THREE.Group();
        g.position.set(x, terrain(x, zz), zz);
        g.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        scene.add(g);
        box(1.8, 0.12, 0.55, "#b5763a", g, 0, 0.5, 0);
        box(1.8, 0.45, 0.1, "#b5763a", g, 0, 0.62, -0.25);
        [-0.75, 0.75].forEach((px) => box(0.1, 0.5, 0.45, INK, g, px, 0, 0));
        colliders.push({ x, z: zz, r: 0.9 });
      });
    }
  }

  // ---- blocky countryside: voxel oaks, fenced pastures with grazing animals, plank
  // cottages with hay bales. Static parts are plain boxes (merged by the batching pass);
  // each kind of animal is one instanced mesh.
  {
    // Voxel oaks: a trunk column and a stack of leaf cubes, one instanced mesh.
    const oakGeo = mergeGeometries([
      tint(new THREE.BoxGeometry(0.9, 3.2, 0.9), "#7a5233", at(0, 1.6, 0)),
      tint(new THREE.BoxGeometry(4.2, 1.6, 4.2), "#3f9a3e", at(0, 3.8, 0)),
      tint(new THREE.BoxGeometry(3, 1.4, 3), "#4fae47", at(0, 5.2, 0)),
      tint(new THREE.BoxGeometry(1.6, 1.1, 1.6), "#5cbd52", at(0.3, 6.3, -0.2)),
      tint(new THREE.BoxGeometry(1.4, 1, 1.4), "#3f9a3e", at(-2.2, 3.6, 0.8)),
      tint(new THREE.BoxGeometry(1.2, 0.9, 1.2), "#4fae47", at(1.9, 4.4, -1.6)),
    ])!;
    const OAKS = lowPower ? 40 : 80;
    const oaks = new THREE.InstancedMesh(track(oakGeo), vcMat, OAKS);
    let n = 0;
    for (let tries = 0; n < OAKS && tries < OAKS * 30; tries++) {
      const x = (lr() * 2 - 1) * ISLAND_A;
      const z = (lr() * 2 - 1) * ISLAND_B;
      if (shore(x, z) > 0.84 || openness(x, z) < 4 || !freeSpot(x, z, 2.5)) continue;
      const k = 0.8 + lr() * 0.5;
      oaks.setMatrixAt(n++, at(x, terrain(x, z) - 0.1, z, Math.floor(lr() * 4) * (Math.PI / 2), k));
      colliders.push({ x, z, r: 0.8 * k });
    }
    oaks.count = n;
    oaks.castShadow = !lowPower;
    oaks.receiveShadow = !lowPower;
    scene.add(oaks);
  }

  // Animals: woolly sheep, patched cows and little chickens, each kind one instanced mesh.
  const leg = (x: number, z: number, h: number, w: number, color: string) => tint(new THREE.BoxGeometry(w, h, w), color, at(x, h / 2, z));
  const sheepGeo = mergeGeometries([
    tint(new THREE.BoxGeometry(1.3, 1, 1.8), "#f3efe6", at(0, 1.15, 0)),
    tint(new THREE.BoxGeometry(0.7, 0.7, 0.6), "#6b5a4a", at(0, 1.45, 1.1)),
    tint(new THREE.BoxGeometry(0.72, 0.3, 0.3), "#f3efe6", at(0, 1.85, 0.95)),
    leg(-0.42, 0.6, 0.7, 0.3, "#6b5a4a"),
    leg(0.42, 0.6, 0.7, 0.3, "#6b5a4a"),
    leg(-0.42, -0.6, 0.7, 0.3, "#6b5a4a"),
    leg(0.42, -0.6, 0.7, 0.3, "#6b5a4a"),
  ])!;
  const cowGeo = mergeGeometries([
    tint(new THREE.BoxGeometry(1.5, 1.2, 2.4), "#f6f1e6", at(0, 1.55, 0)),
    tint(new THREE.BoxGeometry(1.52, 0.9, 0.9), "#3b2b22", at(0, 1.7, -0.5)),
    tint(new THREE.BoxGeometry(1.0, 0.7, 0.8), "#3b2b22", at(0.26, 1.4, 0.75)),
    tint(new THREE.BoxGeometry(0.9, 0.9, 0.8), "#f6f1e6", at(0, 1.9, 1.5)),
    tint(new THREE.BoxGeometry(0.7, 0.36, 0.2), "#f0a8a0", at(0, 1.65, 1.95)),
    tint(new THREE.BoxGeometry(1.2, 0.16, 0.16), "#e8dcc0", at(0, 2.42, 1.45)),
    leg(-0.5, 0.85, 0.95, 0.36, "#3b2b22"),
    leg(0.5, 0.85, 0.95, 0.36, "#3b2b22"),
    leg(-0.5, -0.85, 0.95, 0.36, "#f6f1e6"),
    leg(0.5, -0.85, 0.95, 0.36, "#3b2b22"),
  ])!;
  const chickenGeo = mergeGeometries([
    tint(new THREE.BoxGeometry(0.5, 0.5, 0.6), "#ffffff", at(0, 0.6, 0)),
    tint(new THREE.BoxGeometry(0.36, 0.42, 0.32), "#ffffff", at(0, 0.98, 0.26)),
    tint(new THREE.BoxGeometry(0.14, 0.14, 0.2), "#f4b536", at(0, 0.95, 0.5)),
    tint(new THREE.BoxGeometry(0.1, 0.18, 0.2), "#e2452b", at(0, 1.24, 0.28)),
    tint(new THREE.BoxGeometry(0.1, 0.12, 0.1), "#e2452b", at(0, 0.82, 0.47)),
    tint(new THREE.BoxGeometry(0.12, 0.3, 0.3), "#ece8de", at(-0.3, 0.62, -0.02)),
    tint(new THREE.BoxGeometry(0.12, 0.3, 0.3), "#ece8de", at(0.3, 0.62, -0.02)),
    leg(-0.12, 0, 0.36, 0.08, "#f4b536"),
    leg(0.12, 0, 0.36, 0.08, "#f4b536"),
  ])!;
  type Animal = { kind: number; slot: number; pen: number; x: number; z: number; tx: number; tz: number; face: number; wait: number; speed: number; scared: number };
  const KINDS = [
    { geo: sheepGeo, speed: 0.9 },
    { geo: cowGeo, speed: 0.7 },
    { geo: chickenGeo, speed: 1.6 },
  ];
  const pens: Array<{ x: number; z: number; w: number; d: number }> = [];
  const animals: Animal[] = [];
  const herds: THREE.InstancedMesh[] = [];
  {
    // Find open, gentle ground for three pastures, well apart
    for (let tries = 0; pens.length < 3 && tries < 600; tries++) {
      const x = (lr() * 2 - 1) * ISLAND_A * 0.75;
      const z = (lr() * 2 - 1) * ISLAND_B * 0.75;
      const w = 16;
      const d = 12;
      if (shore(x, z) > 0.78 || openness(x, z) < 16) continue;
      let ok = true;
      for (const [cx, cz] of [
        [x - w / 2, z - d / 2],
        [x + w / 2, z - d / 2],
        [x - w / 2, z + d / 2],
        [x + w / 2, z + d / 2],
      ])
        if (openness(cx, cz) < 4 || !freeSpot(cx, cz, 2)) ok = false;
      if (!ok || !freeSpot(x, z, 9)) continue;
      if (pens.some((p) => Math.hypot(p.x - x, p.z - z) < 70)) continue;
      pens.push({ x, z, w, d });
    }
    // Fences: posts every 2 m (the rover bumps into them), with two rails between
    pens.forEach((p) => {
      const posts: Array<[number, number]> = [];
      for (let u = -p.w / 2; u <= p.w / 2 + 0.01; u += 2) posts.push([p.x + u, p.z - p.d / 2], [p.x + u, p.z + p.d / 2]);
      for (let v = -p.d / 2 + 2; v <= p.d / 2 - 1.99; v += 2) {
        posts.push([p.x - p.w / 2, p.z + v]);
        // leave a gate gap on one side
        if (Math.abs(v) > 1.5) posts.push([p.x + p.w / 2, p.z + v]);
      }
      for (const [x, z] of posts) {
        box(0.28, 1.4, 0.28, "#8a5a32", scene, x, terrain(x, z) - 0.1, z);
        colliders.push({ x, z, r: 0.3 });
      }
      const rail = (x1: number, z1: number, x2: number, z2: number) => {
        const len = Math.hypot(x2 - x1, z2 - z1);
        const mx = (x1 + x2) / 2;
        const mz = (z1 + z2) / 2;
        for (const y of [0.55, 1.05]) {
          const r = mesh(new THREE.BoxGeometry(0.12, 0.14, len), "#b5763a", scene, mx, terrain(mx, mz) + y, mz);
          r.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        }
      };
      rail(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z - p.d / 2);
      rail(p.x - p.w / 2, p.z + p.d / 2, p.x + p.w / 2, p.z + p.d / 2);
      rail(p.x - p.w / 2, p.z - p.d / 2, p.x - p.w / 2, p.z + p.d / 2);
      rail(p.x + p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z - 1.5);
      rail(p.x + p.w / 2, p.z + 1.5, p.x + p.w / 2, p.z + p.d / 2);
      // a water trough
      box(2.4, 0.6, 0.9, "#8a5a32", scene, p.x - p.w / 2 + 2.2, terrain(p.x - p.w / 2 + 2.2, p.z) - 0.05, p.z);
      box(2.1, 0.08, 0.6, "#4aa8d8", scene, p.x - p.w / 2 + 2.2, terrain(p.x - p.w / 2 + 2.2, p.z) + 0.5, p.z);
    });
    // Each pasture: a mix, mostly one kind
    pens.forEach((p, pi) => {
      const mix = [
        [0, 0, 0, 0, 2, 2],
        [1, 1, 1, 0, 2],
        [2, 2, 2, 2, 0, 1],
      ][pi % 3];
      for (const kind of mix) {
        const x = p.x + (lr() - 0.5) * (p.w - 4);
        const z = p.z + (lr() - 0.5) * (p.d - 4);
        const slot = animals.filter((a) => a.kind === kind).length;
        animals.push({ kind, slot, pen: pi, x, z, tx: x, tz: z, face: lr() * 6, wait: lr() * 4, speed: KINDS[kind].speed, scared: 0 });
      }
    });
    KINDS.forEach((k, ki) => {
      const count = Math.max(1, animals.filter((a) => a.kind === ki).length);
      const m = new THREE.InstancedMesh(track(k.geo), vcMat, count);
      m.count = animals.filter((a) => a.kind === ki).length;
      m.castShadow = !lowPower;
      m.frustumCulled = false;
      scene.add(m);
      lifeMovers.push(m);
      herds.push(m);
    });
  }

  // Plank cottages with a stepped roof, a lit window and hay bales, near each district.
  {
    const ROOF = ["#a3442d", "#2f5d8a", "#5b7f3a"];
    CENTERS.forEach((c, d) => {
      for (let k = 0; k < 2; k++) {
        const a = DISTRICT_ANGLES[d] + (k ? 1.15 : -1.15);
        const x = c.x + Math.cos(a) * (PLAZA + 12);
        const z = c.y + Math.sin(a) * (PLAZA + 12);
        if (!freeSpot(x, z, 5) || shore(x, z) > 0.82) continue;
        const g = new THREE.Group();
        g.position.set(x, terrain(x, z) - 0.2, z);
        // front door faces the plaza
        g.rotation.y = Math.atan2(c.x - x, c.y - z);
        scene.add(g);
        box(6.4, 0.5, 5.4, "#8d8a84", g, 0, 0, 0); // stone footing
        box(6, 3.2, 5, "#b5763a", g, 0, 0.5, 0); // plank walls
        [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => box(0.5, 3.3, 0.5, "#6b4423", g, sx * 2.85, 0.5, sz * 2.35)));
        box(1.1, 2, 0.12, "#5a3a1c", g, 0, 0.5, 2.52); // door
        [-1.8, 1.8].forEach((wx) => box(0.9, 0.9, 0.12, "#bfe3ef", g, wx, 1.9, 2.52)); // windows
        const roof = ROOF[(d + k) % ROOF.length];
        for (let i = 0; i < 4; i++) box(6.6 - i * 1.5, 0.55, 5.6, roof, g, 0, 3.7 + i * 0.55, 0);
        box(0.8, 1.8, 0.8, "#8d8a84", g, 1.8, 4.6, -1.2); // chimney
        // hay bales by the side wall
        box(1.2, 1.2, 1.2, "#d9b24a", g, 3.9, 0.2, 0.6);
        box(1.2, 1.2, 1.2, "#d9b24a", g, 3.9, 0.2, -0.8);
        box(1.2, 1.1, 1.2, "#e2bf55", g, 3.9, 1.4, -0.1);
        colliders.push({ x, z, r: 4.2 });
      }
    });
  }

  // ---- people: one blocky body plan shared by the player (on foot) and the strollers.
  // Limbs hang from hip and shoulder pivots so they can swing; strollers are instanced
  // (one draw call per body part for all of them).
  const limbGeo = {
    leg: (() => {
      const g = new THREE.BoxGeometry(0.24, 0.82, 0.28);
      g.translate(0, -0.41, 0);
      return track(g);
    })(),
    arm: (() => {
      const g = new THREE.BoxGeometry(0.19, 0.72, 0.22);
      g.translate(0, -0.34, 0);
      return track(g);
    })(),
    torso: (() => {
      const g = new THREE.BoxGeometry(0.6, 0.74, 0.34);
      g.translate(0, 1.2, 0);
      return track(g);
    })(),
    head: (() => {
      const g = new THREE.BoxGeometry(0.46, 0.46, 0.46);
      g.translate(0, 1.82, 0);
      return track(g);
    })(),
    hair: track(
      mergeGeometries([
        new THREE.BoxGeometry(0.5, 0.15, 0.5).translate(0, 2.08, 0),
        new THREE.BoxGeometry(0.5, 0.3, 0.12).translate(0, 1.93, -0.21),
      ])!,
    ),
  };
  const HIP = { x: 0.14, y: 0.84 };
  const SHOULDER = { x: 0.4, y: 1.52 };

  // The player's character
  const look = { skin: "#d9a066", hair: "#3b2414", shirt: "#e2452b", pants: "#2c3a5a", rover: "#e2452b", supercar: "" };
  const skinMat = keepMat(new THREE.MeshLambertMaterial({ color: look.skin, flatShading: true }));
  const hairMat = keepMat(new THREE.MeshLambertMaterial({ color: look.hair, flatShading: true }));
  const shirtMat = keepMat(new THREE.MeshLambertMaterial({ color: look.shirt, flatShading: true }));
  const pantsMat = keepMat(new THREE.MeshLambertMaterial({ color: look.pants, flatShading: true }));
  const player = new THREE.Group();
  const limb = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = !lowPower;
    pivot.add(mesh);
    player.add(pivot);
    return pivot;
  };
  const pLegL = limb(limbGeo.leg, pantsMat, -HIP.x, HIP.y);
  const pLegR = limb(limbGeo.leg, pantsMat, HIP.x, HIP.y);
  const pArmL = limb(limbGeo.arm, skinMat, -SHOULDER.x, SHOULDER.y);
  const pArmR = limb(limbGeo.arm, skinMat, SHOULDER.x, SHOULDER.y);
  for (const [g, m] of [
    [limbGeo.torso, shirtMat],
    [limbGeo.head, skinMat],
    [limbGeo.hair, hairMat],
  ] as const) {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = !lowPower;
    player.add(mesh);
  }
  // short sleeves in the shirt colour
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(track(new THREE.BoxGeometry(0.23, 0.26, 0.26).translate(0, -0.1, 0)), shirtMat);
    (side < 0 ? pArmL : pArmR).add(sleeve);
  }
  player.visible = false;
  scene.add(player);
  lifeMovers.push(player);
  let walkPhase = 0;
  let sprintLock = false;
  let lockTimer = 0;
  let prevHeld = false;

  // Strollers: wander between busy spots, pause and look around, wave at you, keep
  // their distance from each other and hurry out of the rover's way.
  const STROLLERS = lowPower ? 8 : 16;
  const sMat = keepMat(new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }));
  const sPart = (geo: THREE.BufferGeometry, cast: boolean) => {
    const m = new THREE.InstancedMesh(geo, sMat, STROLLERS);
    m.castShadow = cast && !lowPower;
    m.frustumCulled = false;
    scene.add(m);
    lifeMovers.push(m);
    return m;
  };
  const sTorso = sPart(limbGeo.torso, true);
  const sHead = sPart(limbGeo.head, false);
  const sHair = sPart(limbGeo.hair, false);
  const sLegL = sPart(limbGeo.leg, true);
  const sLegR = sPart(limbGeo.leg, true);
  const sArmL = sPart(limbGeo.arm, false);
  const sArmR = sPart(limbGeo.arm, false);
  type Stroller = { x: number; z: number; h: number; speed: number; base: number; tx: number; tz: number; state: "walk" | "idle"; timer: number; phase: number; wave: number; flee: number; stuck: number; lastD: number; ax: number; az: number };
  const strollers: Stroller[] = [];
  {
    const SKINS = ["#f1c9a5", "#d9a066", "#b07a48", "#7a4a26"];
    const HAIRS = [INK, "#3b2414", "#6b3e1f", "#c9a24a", "#8a8a8a"];
    const SHIRTS = ["#e2452b", "#2453b3", "#f4b536", "#1f9c86", "#f08aa0", CREAM, "#6a4c93", "#ff8a3a"];
    const PANTS = [INK, "#3b4a6b", "#6b4a2b", "#4a4a4a", "#2c3a5a"];
    const c = new THREE.Color();
    for (let i = 0; i < STROLLERS; i++) {
      const skin = SKINS[Math.floor(lr() * SKINS.length)];
      sHead.setColorAt(i, c.set(skin));
      sArmL.setColorAt(i, c.set(skin));
      sArmR.setColorAt(i, c.set(skin));
      sHair.setColorAt(i, c.set(HAIRS[Math.floor(lr() * HAIRS.length)]));
      sTorso.setColorAt(i, c.set(SHIRTS[i % SHIRTS.length]));
      const pants = PANTS[Math.floor(lr() * PANTS.length)];
      sLegL.setColorAt(i, c.set(pants));
      sLegR.setColorAt(i, c.set(pants));
      // start along the track, spread out
      const x = (i % 2 ? 1 : -1) * (4.8 + lr() * 1.5);
      const z = START_Z - 20 - i * ((START_Z - TOWER_Z - 50) / STROLLERS);
      const base = 1.0 + lr() * 0.55;
      strollers.push({ x, z, h: lr() * 6, speed: base, base, tx: x, tz: z, state: "idle", timer: lr() * 3, phase: lr() * 6, wave: 0, flee: 0, stuck: 0, lastD: 0, ax: 0, az: 0 });
    }
  }
  /** Busy spots people walk between (built on first use, once everything is placed). */
  let hangouts: Array<[number, number]> | null = null;
  const buildHangouts = () => {
    const out: Array<[number, number]> = [];
    const add = (x: number, z: number) => {
      if (shore(x, z) < 0.86 && freeSpot(x, z, 0.8) && !colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.8)) out.push([x, z]);
    };
    for (let z = START_Z - 18; z > TOWER_Z + 24; z -= 16) {
      add(-4.7, z);
      add(4.7, z + 8);
    }
    CENTERS.forEach((c) => {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        add(c.x + Math.cos(a) * (PLAZA - 4), c.y + Math.sin(a) * (PLAZA - 4));
      }
    });
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 0.1 + (k / 5) * Math.PI * 0.8;
      add(Math.cos(a) * 15, TOWER_Z + Math.sin(a) * 15);
    }
    for (const p of pens) {
      add(p.x - p.w / 2 - 2, p.z);
      add(p.x, p.z + p.d / 2 + 2);
    }
    for (let k = 0; k < 6; k++) add(-12 + k * 4.8, START_Z - 6);
    return out;
  };
  const pickTarget = (s: Stroller) => {
    if (!hangouts || !hangouts.length) return;
    // prefer somewhere fairly close, like real wandering
    for (let tries = 0; tries < 8; tries++) {
      const [x, z] = hangouts[Math.floor(Math.random() * hangouts.length)];
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > 4 && (d < 60 || tries === 7)) {
        s.tx = x + (Math.random() - 0.5) * 2;
        s.tz = z + (Math.random() - 0.5) * 2;
        return;
      }
    }
  };
  const turnTo = (from: number, to: number, rate: number) => {
    let d = to - from;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return from + d * Math.min(1, rate);
  };
  function animateStrollers(t: number, dt: number) {
    if (!hangouts) hangouts = buildHangouts();
    const carFast = mode === "drive" && Math.abs(car.speed) > 2.5;
    for (let i = 0; i < strollers.length; i++) {
      const s = strollers[i];
      // keep a little personal space from each other and from the player
      let px = 0;
      let pz = 0;
      for (let j = 0; j < strollers.length; j++) {
        if (j === i) continue;
        const o = strollers[j];
        const dx = s.x - o.x;
        const dz = s.z - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.6 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          px += (dx / d) * (1.3 - d);
          pz += (dz / d) * (1.3 - d);
        }
      }
      const cdx = s.x - car.x;
      const cdz = s.z - car.z;
      const cd = Math.hypot(cdx, cdz);
      // the rover coming at them: get out of the way, fast
      if (carFast && cd < 7) {
        const ahead = (cdx * Math.sin(car.heading) + cdz * Math.cos(car.heading)) / (cd || 1);
        if (ahead > 0.2 || cd < 3.5) {
          s.flee = 1.2;
          s.state = "walk";
          const side = -cdx * Math.cos(car.heading) + cdz * Math.sin(car.heading) > 0 ? 1 : -1;
          s.tx = s.x + Math.cos(car.heading) * side * -4 + (cdx / (cd || 1)) * 2;
          s.tz = s.z - Math.sin(car.heading) * side * -4 + (cdz / (cd || 1)) * 2;
        }
      } else if (cd < 1.4) {
        px += (cdx / (cd || 1)) * 1.2;
        pz += (cdz / (cd || 1)) * 1.2;
      }
      s.flee = Math.max(0, s.flee - dt);

      let moving = false;
      if (s.state === "walk") {
        const dx = s.tx - s.x;
        const dz = s.tz - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) {
          s.state = "idle";
          s.timer = 2 + Math.random() * 6;
        } else {
          let sx = dx / d + px * 1.6;
          let sz = dz / d + pz * 1.6;
          // feel ahead for trees, posts and stalls and steer round them (each person checks
          // every third frame, staggered, and keeps the last answer in between)
          if ((frame + i) % 3 === 0) {
            s.ax = 0;
            s.az = 0;
            const lx = s.x + Math.sin(s.h) * 1.3;
            const lz = s.z + Math.cos(s.h) * 1.3;
            for (const c of colliders) {
              const ox = lx - c.x;
              const oz = lz - c.z;
              const r = c.r + 0.45;
              if (Math.abs(ox) > r || Math.abs(oz) > r) continue;
              if (ox * ox + oz * oz < r * r) {
                const cross = Math.sin(s.h) * (c.z - s.z) - Math.cos(s.h) * (c.x - s.x);
                const side = cross > 0 ? 1 : -1;
                s.ax = Math.cos(s.h) * side * 1.8;
                s.az = -Math.sin(s.h) * side * 1.8;
                break;
              }
            }
          }
          sx += s.ax;
          sz += s.az;
          s.h = turnTo(s.h, Math.atan2(sx, sz), dt * (s.flee > 0 ? 9 : 3.5));
          const want = s.base * (s.flee > 0 ? 2.6 : 1);
          s.speed += (want - s.speed) * Math.min(1, dt * 4);
          s.x += Math.sin(s.h) * s.speed * dt;
          s.z += Math.cos(s.h) * s.speed * dt;
          moving = true;
          // give up on a spot they can't reach
          s.stuck = Math.abs(s.lastD - d) < s.speed * dt * 0.2 ? s.stuck + dt : 0;
          s.lastD = d;
          if (s.stuck > 2.5) {
            s.stuck = 0;
            pickTarget(s);
          }
        }
      } else {
        s.x += px * dt;
        s.z += pz * dt;
        s.timer -= dt;
        s.speed = 0;
        // someone nearby on foot or a slow rover: turn and wave
        const near = cd < 9 && !carFast;
        if (near) {
          s.h = turnTo(s.h, Math.atan2(car.x - s.x, car.z - s.z), dt * 3);
          s.wave = Math.min(1, s.wave + dt * 3);
        } else {
          s.wave = Math.max(0, s.wave - dt * 2);
          // glance around
          s.h += Math.sin(t * 0.7 + i * 1.7) * 0.35 * dt;
        }
        if (s.timer <= 0) {
          s.state = "walk";
          s.wave = 0;
          pickTarget(s);
        }
      }

      // pose: swing legs and arms with the stride, a little bob, wave if waving
      s.phase += (moving ? s.speed * 3.4 : 0) * dt;
      const swing = moving ? Math.sin(s.phase) * Math.min(0.75, 0.35 + s.speed * 0.15) : 0;
      const bob = moving ? Math.abs(Math.sin(s.phase)) * 0.06 : Math.sin(t * 2 + i) * 0.01;
      lv.set(s.x, terrain(s.x, s.z) + bob, s.z);
      lq.setFromEuler(le.set(moving && s.flee > 0 ? 0.15 : 0, s.h, 0, "YXZ"));
      ls.set(1, 1, 1);
      lm4.compose(lv, lq, ls);
      sTorso.setMatrixAt(i, lm4);
      sHead.setMatrixAt(i, lm4);
      sHair.setMatrixAt(i, lm4);
      sLegL.setMatrixAt(i, limbMat(lm4, -HIP.x, HIP.y, swing, 0));
      sLegR.setMatrixAt(i, limbMat(lm4, HIP.x, HIP.y, -swing, 0));
      sArmL.setMatrixAt(i, limbMat(lm4, -SHOULDER.x, SHOULDER.y, -swing * 0.8, 0));
      const waveZ = s.wave > 0 ? s.wave * (2.5 + Math.sin(t * 9 + i) * 0.35) : 0;
      sArmR.setMatrixAt(i, limbMat(lm4, SHOULDER.x, SHOULDER.y, s.wave > 0 ? 0 : swing * 0.8, waveZ));
    }
    for (const m of [sTorso, sHead, sHair, sLegL, sLegR, sArmL, sArmR]) m.instanceMatrix.needsUpdate = true;
  }
  const lRot = new THREE.Matrix4();
  const lEu = new THREE.Euler();
  /** base × (pivot translate) × (swing about x, raise about z) */
  const limbMat = (base: THREE.Matrix4, px: number, py: number, rx: number, rz: number) =>
    lmA.copy(base).multiply(lpivot.makeTranslation(px, py, 0)).multiply(lRot.makeRotationFromEuler(lEu.set(rx, 0, rz)));

  // ---- vehicles: the rover plus three supercars. Walk up to one and press F to drive.
  type Spec = { top: number; boost: number; accel: number; turn: number; offroad: number };
  type Vehicle = {
    kind: "rover" | "supercar";
    name: string;
    group: THREE.Group;
    body: THREE.Object3D;
    wheels: THREE.Object3D[];
    flag?: THREE.Object3D;
    x: number;
    z: number;
    heading: number;
    spec: Spec;
    nitroAt: THREE.Vector3;
    beamZ: number;
    paint: THREE.MeshLambertMaterial;
    defaultPaint: string;
  };
  const ROVER_SPEC: Spec = { top: 21, boost: 32, accel: 17, turn: 2.3, offroad: 0.8 };
  const SUPER_SPEC: Spec = { top: 27, boost: 42, accel: 23, turn: 2.6, offroad: 0.6 };
  const WALK_SPEC: Spec = { top: 4.4, boost: 8.2, accel: 40, turn: 3.4, offroad: 1 };
  const roverV: Vehicle = {
    kind: "rover",
    name: "rover",
    group: rover,
    body,
    wheels,
    flag,
    x: car.x,
    z: car.z,
    heading: car.heading,
    spec: ROVER_SPEC,
    nitroAt: nitro.position.clone(),
    beamZ: beam.position.z,
    paint: roverPaint,
    defaultPaint: "#e2452b",
  };
  const vehicles: Vehicle[] = [roverV];
  {
    const tireGeo = track(
      mergeGeometries([
        tint(new THREE.CylinderGeometry(0.44, 0.44, 0.36, 14).rotateZ(Math.PI / 2), INK),
        tint(new THREE.CylinderGeometry(0.25, 0.25, 0.38, 8).rotateZ(Math.PI / 2), "#d9d2bd"),
        tint(new THREE.BoxGeometry(0.4, 0.06, 0.06), "#9aa3ad", at(0, 0, 0)),
      ])!,
    );
    const paintGeo = track(
      mergeGeometries([
        new THREE.BoxGeometry(2.0, 0.5, 4.4).translate(0, 0.58, 0),
        new THREE.BoxGeometry(1.9, 0.18, 1.6).rotateX(0.11).translate(0, 0.86, 1.3),
        new THREE.BoxGeometry(1.9, 0.26, 1.3).translate(0, 0.94, -1.45),
        new THREE.BoxGeometry(0.26, 0.42, 1.5).translate(-1.02, 0.78, -0.6),
        new THREE.BoxGeometry(0.26, 0.42, 1.5).translate(1.02, 0.78, -0.6),
        new THREE.BoxGeometry(1.45, 0.08, 1.15).translate(0, 1.36, -0.25),
      ])!,
    );
    const trimGeo = track(
      mergeGeometries([
        tint(new THREE.BoxGeometry(1.55, 0.42, 1.7), "#1d2a3a", at(0, 1.12, -0.15)),
        tint(new THREE.BoxGeometry(2.1, 0.1, 0.45), INK, at(0, 0.34, 2.15)),
        tint(new THREE.BoxGeometry(1.0, 0.18, 0.06), INK, at(0, 0.52, 2.21)),
        tint(new THREE.BoxGeometry(0.5, 0.13, 0.06), "#fff7c2", at(-0.62, 0.74, 2.2)),
        tint(new THREE.BoxGeometry(0.5, 0.13, 0.06), "#fff7c2", at(0.62, 0.74, 2.2)),
        tint(new THREE.BoxGeometry(0.55, 0.13, 0.06), "#ff3b2f", at(-0.6, 0.88, -2.21)),
        tint(new THREE.BoxGeometry(0.55, 0.13, 0.06), "#ff3b2f", at(0.6, 0.88, -2.21)),
        tint(new THREE.BoxGeometry(0.1, 0.36, 0.1), INK, at(-0.62, 1.22, -1.95)),
        tint(new THREE.BoxGeometry(0.1, 0.36, 0.1), INK, at(0.62, 1.22, -1.95)),
        tint(new THREE.BoxGeometry(2.05, 0.08, 0.5), INK, at(0, 1.42, -1.98)),
        tint(new THREE.BoxGeometry(0.5, 0.12, 0.06), "#555b63", at(0, 0.44, -2.21)),
        tint(new THREE.BoxGeometry(0.03, 0.08, 3.9), CREAM, at(-1.01, 0.62, 0)),
        tint(new THREE.BoxGeometry(0.03, 0.08, 3.9), CREAM, at(1.01, 0.62, 0)),
        tint(new THREE.BoxGeometry(2.04, 0.12, 4.0), INK, at(0, 0.3, 0)),
      ])!,
    );
    const makeSupercar = (paintColor: string, name: string) => {
      const group = new THREE.Group();
      const sbody = new THREE.Group();
      group.add(sbody);
      const paint = keepMat(new THREE.MeshLambertMaterial({ color: paintColor, flatShading: true }));
      const pm = new THREE.Mesh(paintGeo, paint);
      const tm = new THREE.Mesh(trimGeo, vcMat);
      for (const m of [pm, tm]) {
        m.castShadow = !lowPower;
        m.receiveShadow = !lowPower;
        sbody.add(m);
      }
      const sw: THREE.Object3D[] = [];
      for (const [x, z] of [
        [-0.98, 1.42],
        [0.98, 1.42],
        [-0.98, -1.42],
        [0.98, -1.42],
      ]) {
        const w = new THREE.Group();
        w.position.set(x, 0.44, z);
        const m = new THREE.Mesh(tireGeo, vcMat);
        m.castShadow = !lowPower;
        w.add(m);
        group.add(w);
        sw.push(w);
      }
      group.scale.setScalar(0.78);
      scene.add(group);
      lifeMovers.push(group);
      const v: Vehicle = { kind: "supercar", name, group, body: sbody, wheels: sw, x: 0, z: 0, heading: 0, spec: SUPER_SPEC, nitroAt: new THREE.Vector3(0, 0.5, -2.35), beamZ: 9.5, paint, defaultPaint: paintColor };
      return v;
    };
    // Parked in sensible places: by the start gate and at the edge of two plazas
    const spots: Array<[number, number, number]> = [
      [9.5, START_Z - 12, Math.PI],
      [-9.5, START_Z - 34, Math.PI],
      [CENTERS[0].x + 8, CENTERS[0].y + PLAZA - 6, Math.PI / 2],
      [CENTERS[1].x - 8, CENTERS[1].y - PLAZA + 6, -Math.PI / 2],
      [CENTERS[2].x + 8, CENTERS[2].y + PLAZA - 6, Math.PI / 2],
      [-9.5, 20, Math.PI],
      [9.5, -60, Math.PI],
      [16, START_Z - 2, Math.PI],
      [-9.5, -100, Math.PI],
    ];
    const paints = ["#f4b536", "#2453b3", "#1f9c86"];
    let made = 0;
    for (const [x, z, h] of spots) {
      if (made >= 3) break;
      if (!freeSpot(x, z, 2) || colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 2.2)) continue;
      const v = makeSupercar(paints[made], `supercar ${made + 1}`);
      v.x = x;
      v.z = z;
      v.heading = h;
      v.group.position.set(x, ground(x, z), z);
      v.group.rotation.y = h;
      vehicles.push(v);
      made++;
    }
  }

  // Driving or walking, and which vehicle is yours right now
  let mode: "drive" | "walk" = "drive";
  let activeV: Vehicle = roverV;
  let nearV: Vehicle | null = null;
  let lastMode: string = "";
  let lastActive: Vehicle | null = null;
  let lastNear: Vehicle | null | undefined;
  const parkPose = (v: Vehicle) => {
    v.x = car.x;
    v.z = car.z;
    v.heading = car.heading;
  };
  const reportMode = () => {
    if (mode === lastMode && activeV === lastActive && nearV === lastNear) return;
    lastMode = mode;
    lastActive = activeV;
    lastNear = nearV;
    cb.onMode?.({ mode, vehicle: activeV.kind, near: nearV ? nearV.kind : null });
  };
  function exitVehicle() {
    if (mode !== "drive" || car.air) return;
    parkPose(activeV);
    // step out on whichever side is clear
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    let ox = car.x - rx * 2.2;
    let oz = car.z - rz * 2.2;
    if (colliders.some((c) => Math.hypot(c.x - ox, c.z - oz) < c.r + 0.5)) {
      ox = car.x + rx * 2.2;
      oz = car.z + rz * 2.2;
    }
    car.x = ox;
    car.z = oz;
    car.speed = 0;
    car.y = ground(ox, oz);
    car.pitch = car.roll = 0;
    nitroLevel = 0;
    nitro.visible = false;
    mode = "walk";
    player.visible = true;
    reportMode();
  }
  function enterVehicle(v: Vehicle) {
    if (mode !== "walk") return;
    activeV = v;
    car.x = v.x;
    car.z = v.z;
    car.heading = v.heading;
    car.speed = 0;
    car.vy = 0;
    car.air = false;
    car.y = ground(v.x, v.z);
    v.body.add(nitro);
    nitro.position.copy(v.nitroAt);
    v.group.add(beam);
    beam.position.z = v.beamZ;
    mode = "drive";
    player.visible = false;
    nearV = null;
    reportMode();
  }
  /** F: get out, or get into the nearest car. */
  function toggleVehicle() {
    if (!started) return;
    if (mode === "drive") exitVehicle();
    else if (nearV) enterVehicle(nearV);
  }
  // Back to the start: always in the rover
  resetPlayer = () => {
    if (mode === "walk") enterVehicle(roverV);
    else if (activeV !== roverV) {
      parkPose(activeV);
      mode = "walk";
      enterVehicle(roverV);
    }
    respawn();
    resetRun();
  };
  /** Cans back on the island, tank full, score to zero, clock waiting for the first move. */
  function resetRun() {
    for (const g of gears) g.taken = false;
    collected = 0;
    nitroTank = 1;
    cb.onCollect(0, gears.length);
    runArmed = true;
    cb.onRunReset?.();
  }
  function setLook(next: Partial<typeof look>) {
    Object.assign(look, next);
    skinMat.color.set(look.skin);
    hairMat.color.set(look.hair);
    shirtMat.color.set(look.shirt);
    pantsMat.color.set(look.pants);
    roverPaint.color.set(look.rover || "#e2452b");
    for (const v of vehicles) if (v.kind === "supercar") v.paint.color.set(look.supercar || v.defaultPaint);
  }

  // ---- the intro film: while the start screen is up, ground-level shots cut together
  // (racing the coast loop, drifting a bend, a ramp jump through the cones, people
  // waving, the start line, the clock tower). Real game pieces, driven by a script.
  const LOOP_S: number[] = [0];
  for (let i = 0; i < RING_N; i++) {
    const a = RING_PTS[i];
    const b = RING_PTS[(i + 1) % RING_N];
    LOOP_S.push(LOOP_S[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const LOOP_LEN = LOOP_S[RING_N];
  const LOOP_H = RING_PTS.map((a, i) => {
    const b = RING_PTS[(i + 1) % RING_N];
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  });
  /** How sharp the bend is (change of heading per metre), smoothed over a few pieces. */
  const LOOP_K = LOOP_H.map((_, i) => {
    const a = LOOP_H[(i - 3 + RING_N) % RING_N];
    const b = LOOP_H[(i + 3) % RING_N];
    return Math.atan2(Math.sin(b - a), Math.cos(b - a)) / ((6 * LOOP_LEN) / RING_N);
  });
  const loopPt = { x: 0, z: 0, h: 0, k: 0, nx: 0, nz: 0 };
  /** A point `s` metres round the loop: position, heading, bend and the outward side. */
  const loopAt = (s: number) => {
    const m = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
    let lo = 0;
    let hi = RING_N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (LOOP_S[mid] <= m) lo = mid;
      else hi = mid;
    }
    const j = (lo + 1) % RING_N;
    const f = (m - LOOP_S[lo]) / (LOOP_S[lo + 1] - LOOP_S[lo]);
    const a = RING_PTS[lo];
    const b = RING_PTS[j];
    loopPt.x = a[0] + (b[0] - a[0]) * f;
    loopPt.z = a[1] + (b[1] - a[1]) * f;
    const h0 = LOOP_H[lo];
    loopPt.h = h0 + Math.atan2(Math.sin(LOOP_H[j] - h0), Math.cos(LOOP_H[j] - h0)) * f;
    loopPt.k = LOOP_K[lo] + (LOOP_K[j] - LOOP_K[lo]) * f;
    loopPt.nx = Math.cos(loopPt.h);
    loopPt.nz = -Math.sin(loopPt.h);
    return loopPt;
  };
  const S_START = (LOOP_S[RING_START] + LOOP_S[RING_START + 1]) / 2;

  // The three supercars race the loop in the film, each with its own nitro flames
  const racers = vehicles
    .filter((v) => v.kind === "supercar")
    .map((v, i) => {
      const flame = new THREE.Group();
      flame.position.copy(v.nitroAt);
      for (const x of [-0.5, 0.5]) {
        const j = new THREE.Group();
        j.position.x = x;
        j.add(new THREE.Mesh(flameGeo, flameMat), new THREE.Mesh(coreGeo, coreMat));
        flame.add(j);
      }
      flame.visible = false;
      v.body.add(flame);
      return { v, s: 0, speed: 30, drift: 0, lane: [-2.3, 0.4, 2.6][i % 3], pace: [1, 0.985, 1.012][i % 3], flame, home: { x: v.x, z: v.z, h: v.heading } };
    });
  const placeRacers = (lead: number, gap = 10) =>
    racers.forEach((r, i) => {
      r.s = lead - i * gap;
      r.speed = 30;
      r.drift = 0;
    });
  function updateRacers(dt: number, t: number) {
    racers.forEach((r, i) => {
      const bendNow = Math.abs(loopAt(r.s).k);
      const want = Math.max(22, Math.min(34, 34 - bendNow * 650)) * r.pace * (1 + Math.sin(t * 0.35 + i * 2.1) * 0.035);
      const accel = want - r.speed;
      r.speed += accel * Math.min(1, dt * 1.2);
      r.s += r.speed * dt;
      const q = loopAt(r.s);
      // Sliding: the faster through a bend, the more the tail steps out
      const slide = Math.max(-0.6, Math.min(0.6, r.speed * r.speed * q.k * 0.045));
      r.drift += (slide - r.drift) * Math.min(1, dt * 3.5);
      const lane = r.lane + Math.sin(t * 0.21 + i * 1.7) * 0.8;
      const x = q.x + q.nx * lane;
      const z = q.z + q.nz * lane;
      const yaw = q.h + r.drift;
      const v = r.v;
      v.group.position.set(x, ground(x, z), z);
      v.group.rotation.set(0, yaw, 0);
      v.wheels.forEach((w, wi) => {
        w.children[0].rotation.x += (r.speed * dt) / 0.34;
        // counter-steer: the front wheels point where the car is really going
        if (wi < 2) w.rotation.y = -r.drift * 0.9;
      });
      r.flame.visible = accel > 0.4 && Math.abs(q.k) < 0.008;
      if (r.flame.visible) r.flame.scale.set(1, 1, 0.75 + Math.random() * 0.5);
      // tyre smoke off the back wheels while sliding
      if (Math.abs(r.drift) > 0.3 && (frame + i) % 3 === 0) {
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const side = (frame >> 1) % 2 ? 0.8 : -0.8;
        const px = x - fx * 1.2 + fz * side;
        const pz = z - fz * 1.2 - fx * side;
        const d = dust[dustI++ % dust.length];
        d.life = 1;
        d.m.visible = true;
        d.m.position.set(px, ground(px, pz) + 0.3, pz);
        d.mat.color.set("#f8f6f1");
      }
    });
  }

  // The rover drives itself in the film, through the real physics (ramps, cones, people)
  const auto = { on: false, throttle: 0, steer: 0, boost: false };
  let autoSpeed = 0;
  let aim: (() => [number, number]) | null = null;
  const driveFrom = (x: number, z: number, heading: number, speed: number, target: number, to: () => [number, number]) => {
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = speed;
    car.vy = 0;
    car.air = false;
    car.y = ground(x, z);
    nitroTank = 1;
    autoSpeed = target;
    aim = to;
    auto.on = true;
  };
  const coneHome = cones.map((c) => [c.x, c.z] as const);
  function resetCones() {
    cones.forEach((c, i) => {
      [c.x, c.z] = coneHome[i];
      c.vx = c.vz = 0;
      c.tip = 0;
      c.g.position.set(c.x, terrain(c.x, c.z), c.z);
      c.g.quaternion.identity();
      c.g.updateMatrix();
      coneInst.setMatrixAt(i, c.g.matrix);
      bandInst.setMatrixAt(i, c.g.matrix);
    });
    coneInst.instanceMatrix.needsUpdate = true;
    bandInst.instanceMatrix.needsUpdate = true;
  }

  const lookWant = new THREE.Vector3();
  const camAt = (x: number, z: number, lift: number) => camPos.set(x, Math.max(terrain(x, z), -0.6) + lift, z);
  type Shot = { title: string; dur: number; fov: number; setup: () => void; cam: (u: number) => void };
  const SHOTS: Shot[] = [
    {
      // alongside the leader, from the inland side so the sea fills the background
      title: "The coast loop · nitro never runs out",
      dur: 6.5,
      fov: 44,
      setup: () => placeRacers(S_START + 30),
      cam: (u) => {
        const r = racers[0];
        const q = loopAt(r.s);
        const p = r.v.group.position;
        const fx = Math.sin(q.h);
        const fz = Math.cos(q.h);
        const along = 3 - u * 0.9;
        camAt(p.x - q.nx * 6.8 + fx * along, p.z - q.nz * 6.8 + fz * along, 1.2);
        lookWant.set(p.x + fx * 2, p.y + 0.8, p.z + fz * 2);
      },
    },
    {
      // low on the inside of the sharpest bend ahead, panning as they slide past
      title: "Drift the bends",
      dur: 6,
      fov: 38,
      setup: () => {
        const s0 = racers[0].s;
        let best = -1;
        let bs = s0 + 80;
        for (let s = s0 + 60; s < s0 + 125; s += 2.5) {
          const k = Math.abs(loopAt(s).k);
          if (k > best) {
            best = k;
            bs = s;
          }
        }
        const q = loopAt(bs);
        const off = (RING_HALF + 3.5) * (q.k >= 0 ? 1 : -1);
        camAt(q.x + q.nx * off, q.z + q.nz * off, 0.9);
      },
      cam: () => {
        const p = racers[0].v.group.position;
        lookWant.set(p.x, p.y + 0.6, p.z);
      },
    },
    {
      // beside the first ramp: the rover flies over (in slow motion) and ploughs the cones
      title: "Ramps, jumps and cones",
      dur: 6.5,
      fov: 46,
      setup: () => {
        resetCones();
        driveFrom(0, 157, Math.PI, 18, 30, () => {
          const z = car.z - 12;
          return [z < 108 && z > 80 ? Math.sin(z * 0.5) * 1.5 : 0, z];
        });
        camAt(3.4, 117, 0.8);
        lookWant.set(0, 1, 150);
      },
      cam: () => lookWant.set(car.x, car.y + 0.8, car.z),
    },
    {
      // the rover crawls up the Day 2 road and the people along it turn and wave
      title: "Wave at the locals",
      dur: 6.5,
      fov: 42,
      setup: () => {
        driveFrom(26, 0, Math.PI / 2, 2, 2, () => [car.x + 10, 0]);
        const n = Math.min(6, strollers.length);
        for (let k = 0; k < n; k++) {
          const s = strollers[k];
          s.x = s.tx = 33 + k * 3.6;
          s.z = s.tz = k % 2 ? 4.4 : -4.4;
          s.h = k % 2 ? Math.PI : 0;
          s.state = "idle";
          s.timer = 14;
          s.wave = 0;
          s.flee = 0;
          s.speed = 0;
        }
      },
      cam: (u) => {
        camAt(car.x + 10 - u * 0.5, 1.2, 1.4);
        lookWant.set(car.x, 1, 0);
      },
    },
    {
      // just past the start line on the beach side: the pack blasts through the arch
      title: "Race the start line",
      dur: 5,
      fov: 40,
      setup: () => {
        placeRacers(S_START - 75, 8);
        const q = loopAt(S_START + 18);
        const off = RING_HALF + 2.2;
        camAt(q.x + q.nx * off, q.z + q.nz * off, 1.3);
        const a = loopAt(S_START - 6);
        lookWant.set(a.x, 2.4, a.z);
      },
      cam: () => {
        const p = racers[0].v.group.position;
        const a = loopAt(S_START - 4);
        lookWant.set((a.x * 2 + p.x) / 3, 2.2, (a.z * 2 + p.z) / 3);
      },
    },
    {
      // a slow crane up the clock tower as the rover rolls in and stops
      title: "Find every event",
      dur: 7,
      fov: 48,
      setup: () => driveFrom(-2, TOWER_Z + 80, Math.PI, 10, 12, () => [-2, car.z - 10]),
      cam: (u) => {
        const e = smooth(0, 7, u);
        camAt(11 - e * 4, TOWER_Z + 36 - e * 8, 1 + e * 5);
        lookWant.set(0, 3 + e * 12, TOWER_Z);
        if (car.z < TOWER_Z + 34) autoSpeed = 0;
      },
    },
  ];
  const introOn = !reduced && racers.length > 0;
  let shotI = -1;
  let shotT = 0;
  let cut = 0;
  let snap = true;
  let introFov = 46;
  let slow = 1;
  /** Advance the film by `dt`; returns the time step for the world (slow motion mid-jump). */
  function introUpdate(dt: number, t: number) {
    shotT += dt;
    if (shotI < 0 || shotT >= SHOTS[shotI].dur) {
      shotI = (shotI + 1) % SHOTS.length;
      shotT = 0;
      auto.on = false;
      aim = null;
      const shot = SHOTS[shotI];
      shot.setup();
      snap = true;
      introFov = shot.fov;
      cb.onShot?.({ n: shotI, cut: ++cut, title: shot.title, seconds: shot.dur });
    }
    slow += ((auto.on && car.air ? 0.3 : 1) - slow) * Math.min(1, dt * 8);
    const sdt = dt * slow;
    updateRacers(sdt, t);
    if (auto.on && aim) {
      const [ax, az] = aim();
      let d = Math.atan2(ax - car.x, az - car.z) - car.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      auto.steer = Math.max(-1, Math.min(1, d * 2.5));
      const ds = autoSpeed - car.speed;
      auto.throttle = Math.abs(ds) < 0.3 ? 0 : Math.max(-1, Math.min(1, ds * 0.4));
      auto.boost = autoSpeed > 22;
    } else {
      auto.throttle = 0;
      auto.steer = 0;
      auto.boost = false;
    }
    return sdt;
  }
  function introCamera(dt: number) {
    if (introOn && shotI >= 0) {
      SHOTS[shotI].cam(shotT);
      camera.position.copy(camPos);
      if (snap) camLook.copy(lookWant);
      else camLook.lerp(lookWant, 1 - Math.pow(0.002, dt));
      snap = false;
      return;
    }
    // Reduced motion: one still view of the start line from the beach
    const q = loopAt(S_START + 24);
    camAt(q.x + q.nx * (RING_HALF + 2.5), q.z + q.nz * (RING_HALF + 2.5), 1.4);
    const a = loopAt(S_START);
    camLook.set(a.x, 3, a.z);
    camera.position.copy(camPos);
  }
  /** The film ends: cars back where they park, cones up, the rover at the start gate. */
  function endIntro() {
    auto.on = false;
    aim = null;
    slow = 1;
    for (const r of racers) {
      const v = r.v;
      v.group.position.set(r.home.x, ground(r.home.x, r.home.z), r.home.z);
      v.group.rotation.set(0, r.home.h, 0);
      v.wheels.forEach((w) => (w.rotation.y = 0));
      r.flame.visible = false;
    }
    resetCones();
    nitroLevel = 0;
    nitro.visible = false;
    resetPlayer();
    // swoop down from above and behind into the driving view
    camera.position.set(car.x, car.y + 26, car.z + 34);
    camLook.set(car.x, car.y, car.z - 6);
    cb.onShot?.(null);
  }

  function animateLife(t: number, dt: number) {
    const day = 1 - nightAmt;
    birds.visible = day > 0.3;
    if (birds.visible) {
      let i = 0;
      for (const f of FLOCKS) {
        const a = t * f.sp;
        const cx = f.cx + Math.cos(a) * f.r;
        const cz = f.cz + Math.sin(a) * f.r;
        // heading along the circle; the rest of the flock trails behind in a V
        const head = Math.atan2(-Math.sin(a) * Math.sign(f.sp), Math.cos(a) * Math.sign(f.sp));
        const fx = Math.sin(head);
        const fz = Math.cos(head);
        for (let k = 0; k < PER_FLOCK; k++) {
          const row = Math.ceil(k / 2);
          const side = k % 2 ? 1 : -1;
          // flap, then glide for a moment, like real gulls
          const beat = Math.sin(t * 6 + k * 1.3);
          const flap = beat > -0.2 ? beat * 0.65 : -0.13;
          lv.set(cx - fx * row * 3.2 + fz * side * row * 2.8, f.h + Math.sin(t * 0.7 + k) * 0.8 - flap * 0.25, cz - fz * row * 3.2 - fx * side * row * 2.8);
          lq.setFromEuler(le.set(0, head, -Math.sign(f.sp) * 0.18, "XYZ"));
          ls.set(1.5, 1.5, 1.5);
          lm4.compose(lv, lq, ls);
          birdsBody.setMatrixAt(i, lm4);
          birdsL.setMatrixAt(i, wingMats(lm4, -0.35, 0.12, -flap, lmA));
          birdsR.setMatrixAt(i, wingMats(lm4, 0.35, 0.12, flap, lmA));
          i++;
        }
      }
      for (const m of [birdsBody, birdsL, birdsR]) m.instanceMatrix.needsUpdate = true;
    }

    flies.visible = day > 0.4 && started;
    if (flies.visible) {
      const half = 25;
      for (let i = 0; i < BUTTERFLIES; i++) {
        const d = flyData[i];
        // wander on a lissajous path, kept in a box that follows the rover
        let x = d.ox + Math.sin(t * d.sp + d.ph) * 3;
        let z = d.oz + Math.cos(t * d.sp * 0.8 + d.ph * 2) * 3;
        x = car.x + ((((x - car.x + half) % (half * 2)) + half * 2) % (half * 2)) - half;
        z = car.z + ((((z - car.z + half) % (half * 2)) + half * 2) % (half * 2)) - half;
        lv.set(x, terrain(x, z) + 1.3 + Math.sin(t * 2 + d.ph) * 0.5, z);
        lq.setFromEuler(le.set(0, t * d.sp + d.ph, 0, "XYZ"));
        ls.set(1.15, 1.15, 1.15);
        lm4.compose(lv, lq, ls);
        const flap = 0.15 + Math.abs(Math.sin(t * 13 + d.ph)) * 1.15;
        fliesBody.setMatrixAt(i, lm4);
        fliesL.setMatrixAt(i, wingMats(lm4, -0.05, 0, -flap, lmA));
        fliesR.setMatrixAt(i, wingMats(lm4, 0.05, 0, flap, lmA));
      }
      for (const m of [fliesBody, fliesL, fliesR]) m.instanceMatrix.needsUpdate = true;
    }

    animateStrollers(t, dt);

    for (const b of boats) {
      b.a += b.sp * dt;
      const r = (1 + wobble(b.a)) * b.k;
      const x = Math.cos(b.a) * ISLAND_A * r;
      const z = Math.sin(b.a) * ISLAND_B * r;
      b.m.position.set(x, -1.3 + Math.sin(t * 1.4 + b.a * 5) * 0.15, z);
      // sail along the shore, rocking gently
      const heading = Math.atan2(-Math.sin(b.a) * ISLAND_A, Math.cos(b.a) * ISLAND_B) + (b.sp < 0 ? Math.PI : 0);
      b.m.rotation.set(Math.sin(t * 1.1 + b.a) * 0.06, heading, Math.sin(t * 1.3 + b.a) * 0.08);
    }

    for (const b of balloons) {
      const a = t * b.sp + b.ph;
      b.m.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.4 + b.ph) * 2, b.cz + Math.sin(a) * b.r);
      b.m.rotation.y = t * 0.05;
    }

    for (const r of rotors) r.rotateZ(dt * 1.6);

    // Animals wander inside their pasture, pause to graze, and scatter from the rover
    for (const an of animals) {
      const p = pens[an.pen];
      const near = Math.hypot(car.x - an.x, car.z - an.z);
      if (near < 6 && Math.abs(car.speed) > 3 && an.scared <= 0) {
        an.scared = 1.6;
        an.wait = 0;
        const away = Math.atan2(an.x - car.x, an.z - car.z);
        an.tx = an.x + Math.sin(away) * 5;
        an.tz = an.z + Math.cos(away) * 5;
      }
      an.scared = Math.max(0, an.scared - dt);
      an.tx = Math.max(p.x - p.w / 2 + 1.5, Math.min(p.x + p.w / 2 - 1.5, an.tx));
      an.tz = Math.max(p.z - p.d / 2 + 1.5, Math.min(p.z + p.d / 2 - 1.5, an.tz));
      let walking = false;
      if (an.wait > 0) an.wait -= dt;
      else {
        const dx = an.tx - an.x;
        const dz = an.tz - an.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.25) {
          an.wait = 2 + Math.random() * 5;
          an.tx = p.x + (Math.random() - 0.5) * (p.w - 3);
          an.tz = p.z + (Math.random() - 0.5) * (p.d - 3);
        } else {
          walking = true;
          const stepLen = Math.min(dist, an.speed * (an.scared > 0 ? 2.6 : 1) * dt);
          an.x += (dx / dist) * stepLen;
          an.z += (dz / dist) * stepLen;
          const want = Math.atan2(dx, dz);
          let diff = want - an.face;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          an.face += diff * Math.min(1, dt * 5);
        }
      }
      const chick = an.kind === 2;
      const bob = walking ? Math.abs(Math.sin(t * (chick ? 14 : 7) + an.slot)) * (chick ? 0.18 : 0.08) : 0;
      // grazing: nose down now and then while standing
      const graze = !walking && !chick ? Math.max(0, Math.sin(t * 0.8 + an.slot * 2)) * 0.14 : 0;
      lv.set(an.x, terrain(an.x, an.z) + bob, an.z);
      lq.setFromEuler(le.set(graze, an.face, 0, "YXZ"));
      ls.set(1, 1, 1);
      herds[an.kind].setMatrixAt(an.slot, lm4.compose(lv, lq, ls));
    }
    for (const h of herds) h.instanceMatrix.needsUpdate = true;
  }

  // ---- performance: static batching + frozen transforms (the standard engine playbook)
  // 1. Every plain-coloured mesh that never moves is baked, with its colour, into one
  //    mesh per 60 m map cell: hundreds of draw calls become a few dozen, and each cell
  //    is still culled on its own when it is off screen or outside the shadow camera.
  // 2. Anything left that never moves stops recomputing its transform every frame.
  {
    const dynamic = new Set<THREE.Object3D>([rover, arrow, foam, ...clouds, ...lifeMovers, ...clockHands, ...dayNumbers, ...spinning]);
    for (const d of dust) dynamic.add(d.m);
    for (const c of cones) dynamic.add(c.g);
    for (const g of gears) dynamic.add(g.m);
    for (const z of zoneRt) {
      dynamic.add(z.ring);
      dynamic.add(z.beam);
      dynamic.add(z.liveTag);
      if (z.spin) dynamic.add(z.spin);
    }
    for (const l of labels) dynamic.add(l.s);
    const moves = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (dynamic.has(p)) return true;
      return false;
    };
    const plain = new Set<THREE.Material>(mats.values());
    scene.updateMatrixWorld(true);
    const CELL = 60;
    const buckets = new Map<string, THREE.BufferGeometry[]>();
    const baked: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || !m.visible || moves(m)) return;
      const material = m.material as THREE.MeshLambertMaterial;
      if (!plain.has(material)) return;
      const src = m.geometry;
      const g = (src.index ? src.toNonIndexed() : src.clone()) as THREE.BufferGeometry;
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(m.matrixWorld);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const c = material.color;
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
      const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)},${m.castShadow ? 1 : 0}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(g);
      baked.push(m);
    });
    for (const m of baked) m.removeFromParent();
    const bakedMat = keepMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    for (const [key, list] of buckets) {
      const merged = track(mergeGeometries(list)!);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, bakedMat);
      mesh.castShadow = key.endsWith(",1");
      mesh.receiveShadow = !lowPower;
      scene.add(mesh);
    }
    scene.traverse((o) => {
      if (o === scene || o === sun || o === sun.target || o === fill || o === fill.target || moves(o)) return;
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
  }

  // Dynamic resolution, as consoles do: when frames run long the render scale drops a
  // step; when there is headroom again it creeps back up (never above where it failed).
  const DPR_MAX = Math.min(window.devicePixelRatio, lowPower ? 1.25 : 1.75);
  const DPR_MIN = Math.min(DPR_MAX, 0.7);
  let dpr = DPR_MAX;
  let dprCeiling = DPR_MAX;
  let frameAvg = 16.7;
  let lastFrameAt = performance.now();
  let dprWait = 3000;
  let lastRaiseAt = -1e9;
  /** Shadows on or off, how soft (blur radius) and how often they're redrawn. */
  function setShadows(on: boolean, radius: number, every: number) {
    shadowEvery = every;
    sun.shadow.radius = radius;
    renderer.shadowMap.needsUpdate = true;
    if (renderer.shadowMap.enabled === on) return;
    renderer.shadowMap.enabled = on;
    // drop the old shadow texture so it's rebuilt to match the recompiled materials
    sun.shadow.map?.dispose();
    (sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    // materials pick up the change on their next compile
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
  }
  /** "auto" adapts; the fixed settings from the menu leave the scale alone. */
  let quality: "auto" | "high" | "medium" | "low" = "auto";
  function adaptResolution(now: number) {
    const gap = now - lastFrameAt;
    lastFrameAt = now;
    if (gap > 250 || quality !== "auto") return; // a pause (tab switch), not a slow frame
    frameAvg += (gap - frameAvg) * 0.05;
    dprWait -= gap;
    if (dprWait > 0 || !started) return;
    // Already at the lowest resolution and still slow: drop shadows (the biggest cost)
    if (frameAvg > 24 && dpr <= DPR_MIN && renderer.shadowMap.enabled) {
      setShadows(false, sun.shadow.radius, shadowEvery);
      dprWait = 3000;
      return;
    }
    if (frameAvg > 24 && dpr > DPR_MIN) {
      // Just raised and it fell over again: that level is too much for this device
      if (now - lastRaiseAt < 4000) dprCeiling = Math.max(DPR_MIN, dpr - 0.1);
      dpr = Math.max(DPR_MIN, +(dpr - 0.15).toFixed(2));
      renderer.setPixelRatio(dpr);
      resize();
      dprWait = 1500;
    } else if (frameAvg < 17.5 && dpr < dprCeiling) {
      dpr = Math.min(dprCeiling, +(dpr + 0.1).toFixed(2));
      renderer.setPixelRatio(dpr);
      resize();
      lastRaiseAt = now;
      dprWait = 6000;
    }
  }

  // ---- time of day: the sky follows the clock in India (?hour=21 previews a time)
  const SKY = {
    night: { top: new THREE.Color("#0b1736"), mid: new THREE.Color("#1f2d5c"), low: new THREE.Color("#3a3f6b") },
    dusk: { top: new THREE.Color("#3d5aa8"), mid: new THREE.Color("#f08a5d"), low: new THREE.Color("#ffd39a") },
    day: { top: new THREE.Color("#5fb4e0"), mid: new THREE.Color("#bfe3ef"), low: new THREE.Color("#ffe3b8") },
  };
  let forcedHour = (() => {
    const v = new URLSearchParams(window.location.search).get("hour");
    const n = v === null || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
  })();
  const tmp = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const NIGHT_HEMI = new THREE.Color("#9fb3ff");
  const DUSK_SUN = new THREE.Color("#ff9a5a");
  const MOON = new THREE.Color("#8fa6ff");
  const WARM = new THREE.Color("#fff3b0");
  /** Day cycle: a whole day in `cycleSec` seconds, starting from `cycleFrom` o'clock. */
  let cycleSec: number | null = null;
  let cycleFrom = 0;
  let cycleT0 = 0;
  let shownHour = 12;
  const liveHour = () => {
    const d = new Date(Date.now() + 5.5 * 3600 * 1000);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
  };
  function applyTimeOfDay() {
    const h = cycleSec ? (cycleFrom + ((performance.now() - cycleT0) / 1000 / cycleSec) * 24) % 24 : (forcedHour ?? liveHour());
    shownHour = h;
    // 0 at night, 1 in full day; dusk peaks around sunrise and sunset.
    const day = smooth(5.2, 7.4, h) * (1 - smooth(17.2, 19.4, h));
    const dusk = Math.min(1, Math.max(0, 1 - Math.abs(h - 6.3) / 1.4) + Math.max(0, 1 - Math.abs(h - 18.3) / 1.4));
    const pick = (k: "top" | "mid" | "low", out: THREE.Color) => out.copy(SKY.night[k]).lerp(SKY.day[k], day).lerp(SKY.dusk[k], dusk * 0.75);
    pick("top", tmp[0]);
    pick("mid", tmp[1]);
    pick("low", tmp[2]);
    const g = skyCanvas.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${tmp[0].getHexString()}`);
    grad.addColorStop(0.55, `#${tmp[1].getHexString()}`);
    grad.addColorStop(1, `#${tmp[2].getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    skyTex.needsUpdate = true;
    fog.color.copy(tmp[2]);
    hemi.intensity = 0.5 + day * 1.0;
    hemi.color.set("#fff6e0").lerp(NIGHT_HEMI, 1 - day);
    sun.intensity = 0.35 + day * 1.85;
    sun.color.set("#fff1d6").lerp(DUSK_SUN, dusk * 0.6).lerp(MOON, (1 - day) * 0.7);
    const night = 1 - day;
    nightBoost = 1 + night * 1.6;
    nightAmt = night;
    for (const h of haloMats) h.opacity = 0.3 + night * 0.65;
    beamMat.opacity = smooth(0.35, 0.9, night) * 0.55;
    beam.visible = beamMat.opacity > 0.02;
    moteMat.color.set("#fff3dc").lerp(new THREE.Color("#ffe066"), night);
    moteMat.size = 0.45 + night * 0.35;
    moteMat.opacity = 0.35 + night * 0.6;
    fill.intensity = 0.3 + night * 0.25;
    lampBulbMat.color.set("#d9d2bd").lerp(WARM, night);
    lampGlowMat.opacity = night * 0.45;
    // Gears shine a little more after dark
    glowMat.opacity = 0.65 + night * 0.35;
    gearMat.emissiveIntensity = 0.6 + night * 0.8;
  }
  applyTimeOfDay();

  // ---- loop
  let last = performance.now();
  const t0 = last;
  let raf = 0;
  let frame = 0;
  let slowAcc = 0;
  let slowFrames = 0;
  let slowReported = false;
  const fwd = new THREE.Vector3();
  const ist = () => {
    const d = new Date(Date.now() + 5.5 * 3600 * 1000);
    return { h: d.getUTCHours() % 12, m: d.getUTCMinutes(), s: d.getUTCSeconds() };
  };

  function step(dt: number, t: number) {
    const kUp = keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0;
    const kDown = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
    const kLeft = keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0;
    const kRight = keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0;
    const throttle = started ? Math.max(-1, Math.min(1, kUp - kDown + input.y)) : auto.on ? auto.throttle : 0;
    // Driving (joystick held or a drive key down) brings the camera back behind the rover.
    driving = input.held || kUp + kDown + kLeft + kRight > 0;
    const steerIn = started ? Math.max(-1, Math.min(1, kLeft - kRight - input.x)) : auto.on ? auto.steer : 0;
    // The time trial clock starts on the first move (a key, or a thumb on the stick)
    if (runArmed && started && (throttle !== 0 || steerIn !== 0 || input.held)) {
      runArmed = false;
      cb.onRunStart?.();
    }
    // Boost burns nitro; with an empty tank it does nothing until a can or the slow refill.
    // On foot Shift/boost means run; in a car it burns nitro
    const walking = mode === "walk";
    const spec = walking ? WALK_SPEC : activeV.spec;
    const wantBoost = keys.has("ShiftLeft") || keys.has("ShiftRight") || input.boost || (!started && auto.on && auto.boost);
    // Sprint lock (touch): push the stick fully forward for a moment and you keep running
    // on your own, even after letting go. Touching the stick again ends it.
    if (walking) {
      if (input.held && !prevHeld && sprintLock) sprintLock = false;
      else if (!sprintLock && input.held && input.y > 0.88 && Math.abs(input.x) < 0.45) {
        lockTimer += dt;
        if (lockTimer > 0.5) sprintLock = true;
      } else if (!sprintLock) lockTimer = 0;
    } else {
      sprintLock = false;
      lockTimer = 0;
    }
    prevHeld = input.held;
    const boost = (wantBoost || sprintLock) && (walking || nitroTank > 0.01);
    const nitroWant = !walking && boost && (started || auto.on) && car.speed > 4 && !car.air ? 1 : 0;
    if (nitroWant) nitroTank = Math.max(0, nitroTank - NITRO_BURN * dt);
    else if (started) nitroTank = Math.min(1, nitroTank + NITRO_REFILL * dt);
    // The coast loop: boost all you like, the tank stays at 100%
    onLoop = !walking && started && ringGap(car.x, car.z) < 0.5;
    if (onLoop) nitroTank = 1;
    nitroLevel += (nitroWant - nitroLevel) * Math.min(1, dt * (nitroWant ? 8 : 4));
    nitro.visible = nitroLevel > 0.03;
    if (nitro.visible) {
      jets.forEach((j, i) => {
        const flick = 0.75 + Math.random() * 0.5;
        j.scale.set(0.8 + nitroLevel * 0.4, 0.8 + nitroLevel * 0.4, nitroLevel * flick * (1.1 + Math.sin(t * 40 + i) * 0.15));
      });
      flameMat.opacity = 0.55 + nitroLevel * 0.4;
    }
    // Space brakes in a car; on foot it (or the phone's Jump button) jumps
    const brake = !walking && keys.has("Space");
    if (walking && (keys.has("Space") || input.jump) && !car.air && started) {
      car.air = true;
      car.vy = 8.5;
      input.jump = false;
    }
    if (!walking) input.jump = false;

    const max = (boost ? spec.boost : spec.top) * (walking ? 1 : speedScale);
    const onRoad = openness(car.x, car.z) < 0;
    const grip = car.air ? 0.15 : 1;
    if (walking) {
      // On foot the stick moves you relative to the camera (push up to walk away from it,
      // sideways to cross the screen). The camera keeps its own direction while you turn,
      // so you can look one way and walk another.
      const side = started ? kRight - kLeft + input.x : 0;
      // a locked sprint keeps going forward (steer with the stick while you hold it)
      const fwd = started ? (sprintLock ? Math.max(0.85, input.held ? input.y : 1) : kUp - kDown + input.y) : 0;
      const mag = Math.min(1, Math.hypot(side, fwd));
      const camYaw = car.heading + lookYaw;
      if (mag > 0.08) {
        const vx = fwd * Math.sin(camYaw) - side * Math.cos(camYaw);
        const vz = fwd * Math.cos(camYaw) + side * Math.sin(camYaw);
        let d = Math.atan2(vx, vz) - car.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        car.heading += d * Math.min(1, dt * 12);
        lookYaw = Math.atan2(Math.sin(camYaw - car.heading), Math.cos(camYaw - car.heading));
      }
      car.speed += (mag * max - car.speed) * Math.min(1, dt * 10);
      car.steer = 0;
    } else {
      if (throttle !== 0) car.speed += throttle * (throttle * car.speed < 0 ? 40 : walking ? spec.accel : (boost ? spec.accel * 1.5 : spec.accel) * speedScale) * dt * grip;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), (walking ? 30 : onRoad ? 6 : 9) * dt);
      if (brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 40 * dt);
      const limit = onRoad ? max : max * spec.offroad;
      car.speed = Math.max(-limit * 0.45, Math.min(limit, car.speed));
      car.steer += (steerIn - car.steer) * Math.min(1, dt * 10);
      // People turn on the spot; cars need to be rolling to turn
      const turn = walking ? car.steer * spec.turn : car.steer * spec.turn * Math.min(1, Math.abs(car.speed) / 6) * Math.sign(car.speed || 1) * (car.air ? 0.3 : 1);
      car.heading += turn * dt;
    }

    let nx = car.x + Math.sin(car.heading) * car.speed * dt;
    let nz = car.z + Math.cos(car.heading) * car.speed * dt;
    for (const c of colliders) {
      const dx = nx - c.x;
      const dz = nz - c.z;
      const min = c.r + (walking ? 0.45 : 0.95);
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.0001) {
        nx = c.x + (dx / d) * min;
        nz = c.z + (dz / d) * min;
        car.speed *= 0.55;
      }
    }
    // Parked cars are solid too
    for (const v of vehicles) {
      if (v === activeV && !walking) continue;
      const dx = nx - v.x;
      const dz = nz - v.z;
      const min = 1.5 + (walking ? 0.4 : 0.95);
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.0001) {
        nx = v.x + (dx / d) * min;
        nz = v.z + (dz / d) * min;
        if (!walking) car.speed *= 0.55;
      }
    }
    const e = shore(nx, nz);
    if (e > 0.95) {
      nx *= 0.95 / e;
      nz *= 0.95 / e;
      car.speed *= 0.5;
    }
    car.x = nx;
    car.z = nz;

    const gy = ground(car.x, car.z);
    if (car.air) {
      car.vy -= 34 * dt;
      car.y += car.vy * dt;
      if (car.y <= gy) {
        car.y = gy;
        car.air = false;
        car.vy = 0;
      }
    } else {
      const rate = (gy - car.y) / Math.max(dt, 0.001);
      if (gy < car.y - 0.35 && Math.abs(car.speed) > 9) {
        car.air = true;
        car.vy = Math.max(car.vy, 0);
      } else {
        car.y = gy;
        car.vy = rate * 0.6;
      }
    }

    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    if (!car.air) {
      const hf = ground(car.x + fx * 1.4, car.z + fz * 1.4);
      const hb = ground(car.x - fx * 1.4, car.z - fz * 1.4);
      const hl = ground(car.x + fz * 1.1, car.z - fx * 1.1);
      const hr = ground(car.x - fz * 1.1, car.z + fx * 1.1);
      car.pitch += (Math.atan2(hb - hf, 2.8) - car.pitch) * Math.min(1, dt * 12);
      car.roll += (Math.atan2(hl - hr, 2.2) - car.roll) * Math.min(1, dt * 12);
    } else {
      car.pitch += (0.12 - car.pitch) * dt * 2;
    }
    if (!walking) {
      const v = activeV;
      v.group.position.set(car.x, car.y, car.z);
      v.group.rotation.set(0, 0, 0);
      v.group.rotateY(car.heading);
      v.group.rotateX(car.pitch);
      v.group.rotateZ(car.roll);
      v.body.position.y = Math.sin(t * 18) * 0.03 * Math.min(1, Math.abs(car.speed) / 10);
      v.body.rotation.z = -car.steer * 0.05 * Math.min(1, Math.abs(car.speed) / 10);
      v.wheels.forEach((w, i) => {
        w.children[0].rotation.x += (car.speed * dt) / 0.55;
        if (i < 2) w.rotation.y = car.steer * 0.45;
      });
      if (v.flag) v.flag.rotation.y = Math.sin(t * 8) * 0.3;
      v.x = car.x;
      v.z = car.z;
      v.heading = car.heading;
    } else {
      // On foot: stride with arm swing, lean a little into a run, breathe when still
      const sp = Math.abs(car.speed);
      walkPhase += sp * 2.1 * dt;
      const swing = sp > 0.2 ? Math.sin(walkPhase) * Math.min(0.85, 0.3 + sp * 0.08) : 0;
      player.position.set(car.x, car.y + (sp > 0.2 ? Math.abs(Math.sin(walkPhase)) * 0.07 : Math.sin(t * 2) * 0.012), car.z);
      player.rotation.set(sp > 5 ? 0.12 : 0, car.heading, 0, "YXZ");
      if (car.air) {
        // mid-jump: knees up, arms out
        pLegL.rotation.x = -0.7;
        pLegR.rotation.x = 0.35;
        pArmL.rotation.set(-0.4, 0, -0.9);
        pArmR.rotation.set(-0.4, 0, 0.9);
      } else {
        pLegL.rotation.x = swing;
        pLegR.rotation.x = -swing;
        pArmL.rotation.set(-swing * 0.9, 0, 0);
        pArmR.rotation.set(swing * 0.9, 0, 0);
      }
      // close enough to a car to get in?
      let best = 3.4;
      nearV = null;
      for (const v of vehicles) {
        const d = Math.hypot(v.x - car.x, v.z - car.z);
        if (d < best) {
          best = d;
          nearV = v;
        }
      }
    }
    reportMode();

    if (!walking && !car.air && Math.abs(car.speed) > 7 && frame % 3 === 0) {
      const p = dust[dustI++ % dust.length];
      p.life = 1;
      p.m.visible = true;
      p.m.position.set(car.x - fx * 1.8 + (Math.random() - 0.5), car.y + 0.3, car.z - fz * 1.8 + (Math.random() - 0.5));
      p.mat.color.set(nitroLevel > 0.5 ? "#ffb347" : onRoad ? "#d8cfc0" : "#e6d2a4");
    }
    for (const p of dust) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.6;
      p.m.position.y += dt * 0.8;
      p.m.scale.setScalar(1 + (1 - p.life) * 2);
      p.mat.opacity = Math.max(0, p.life) * 0.7;
      if (p.life <= 0) p.m.visible = false;
    }

    let conesMoved = false;
    for (let ci = 0; ci < cones.length; ci++) {
      const c = cones[ci];
      const dx = c.x - car.x;
      const dz = c.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.8 && d > 0.001 && Math.abs(car.y - c.g.position.y) < 2) {
        const v = Math.abs(car.speed);
        c.vx += (dx / d) * (3 + v * 0.9) + fx * car.speed * 0.4;
        c.vz += (dz / d) * (3 + v * 0.9) + fz * car.speed * 0.4;
        c.tipAxis.set(dz / d, 0, -dx / d);
      }
      if (c.vx || c.vz) {
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        const sp = Math.hypot(c.vx, c.vz);
        const k = Math.max(0, 1 - dt * 3);
        c.vx *= k;
        c.vz *= k;
        if (sp < 0.05) c.vx = c.vz = 0;
        c.tip = Math.min(Math.PI / 2, c.tip + sp * dt * 1.2);
        c.g.position.set(c.x, terrain(c.x, c.z), c.z);
        c.g.quaternion.setFromAxisAngle(c.tipAxis, c.tip);
        c.g.updateMatrix();
        coneInst.setMatrixAt(ci, c.g.matrix);
        bandInst.setMatrixAt(ci, c.g.matrix);
        conesMoved = true;
      }
    }
    if (conesMoved) {
      coneInst.instanceMatrix.needsUpdate = true;
      bandInst.instanceMatrix.needsUpdate = true;
    }

    glowMat.size = 3.9 + Math.sin(t * 3) * 0.5;
    for (let gi = 0; gi < gears.length; gi++) {
      const g = gears[gi];
      if (g.taken) continue;
      g.m.rotation.y = t * 2.2 + g.x;
      g.m.position.y = ground(g.x, g.z) + 1.4 + Math.sin(t * 2 + g.z) * 0.25;
      g.m.updateMatrix();
      canInst.setMatrixAt(gi, g.m.matrix);
      glowPos[gi * 3] = g.x;
      glowPos[gi * 3 + 1] = g.m.position.y;
      glowPos[gi * 3 + 2] = g.z;
      if (started && Math.hypot(g.x - car.x, g.z - car.z) < 2.4 && Math.abs(g.m.position.y - car.y - 1) < 2.5) {
        g.taken = true;
        canInst.setMatrixAt(gi, HIDDEN);
        glowPos[gi * 3 + 1] = -999;
        collected++;
        // Each can tops up the nitro tank by a third.
        nitroTank = Math.min(1, nitroTank + NITRO_PER_CAN);
        cb.onCollect(collected, gears.length);
        if (cb.onNitroPickup) {
          const p = g.m.position.clone().project(camera);
          const r = canvas.getBoundingClientRect();
          cb.onNitroPickup(r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height, nitroTank);
        }
      }
    }
    canInst.instanceMatrix.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = true;

    let near: number | null = null;
    let best = 5.2;
    for (const z of zoneRt) {
      const d = Math.hypot(z.x - car.x, z.z - car.z);
      if (d < best) {
        best = d;
        near = z.id;
      }
      const on = z.id === currentZone;
      const beamMat = z.beam.material as THREE.MeshBasicMaterial;
      if (z.live) {
        beamMat.opacity = 0.35 + Math.sin(t * 5) * 0.15;
        z.beam.scale.set(1 + Math.sin(t * 5) * 0.08, 1.6, 1 + Math.sin(t * 5) * 0.08);
        z.liveTag.position.y = terrain(z.lx, z.lz) + 13.4 + Math.sin(t * 3) * 0.3;
      } else beamMat.opacity = Math.min(0.6, (on ? 0.32 + Math.sin(t * 6) * 0.06 : 0.12) * nightBoost);
      z.ring.rotation.z = t * (on ? 1.5 : 0.3);
      if (z.spin) {
        const n = z.name.toLowerCase();
        if (n.includes("jet")) z.spin.rotation.y = t * 0.5;
        else if (n.includes("war")) z.spin.rotation.y = Math.sin(t * 1.3) * 0.8;
        else if (n.includes("boat")) z.spin.rotation.y = t * 0.4;
        else if (n.includes("soccer")) z.spin.position.x = Math.sin(t * 1.7) * 3.5;
      }
    }
    if (near !== currentZone && started) {
      currentZone = near;
      if (near !== null) visited.add(near);
      cb.onZone(near);
    }

    // Guide: the first day with events left, then the nearest unseen event inside it.
    // (Not during the intro film, where the rover drives itself.)
    if (started) {
    const nextDay = [0, 1, 2].find((d) => zoneRt.some((z) => z.day === d && !visited.has(z.id)));
    let key = "done";
    if (nextDay === undefined) {
      guideTarget.on = false;
    } else {
      const c = CENTERS[nextDay];
      const inside = Math.hypot(car.x - c.x, car.z - c.y) < PLAZA + 2;
      guideTarget.on = true;
      if (inside) {
        let bestZ: ZoneRuntime | null = null;
        let bd = Infinity;
        for (const z of zoneRt) {
          if (z.day !== nextDay || visited.has(z.id)) continue;
          const d = Math.hypot(z.x - car.x, z.z - car.z);
          if (d < bd) {
            bd = d;
            bestZ = z;
          }
        }
        if (bestZ) {
          guideTarget.x = bestZ.x;
          guideTarget.z = bestZ.z;
          key = `${nextDay}:z${bestZ.id}`;
          if (key !== guideKey) cb.onGuide({ day: nextDay, text: bestZ.name });
        }
      } else {
        // Follow the track to the junction, then turn down the branch.
        const onTrackSide = Math.abs(car.x) < 8 || Math.sign(car.x) !== SIDE[nextDay];
        const pastJunction = Math.abs(car.z - JUNCTION_Z[nextDay]) < 6;
        if (onTrackSide && !pastJunction && Math.abs(car.x) < 12) {
          guideTarget.x = 0;
          guideTarget.z = JUNCTION_Z[nextDay];
        } else {
          guideTarget.x = c.x;
          guideTarget.z = c.y;
        }
        key = `${nextDay}:day`;
        if (key !== guideKey) cb.onGuide({ day: nextDay, text: `Day ${nextDay + 1} · ${DAY_NAMES[nextDay]}` });
      }
      if (arrowMat.map !== arrowTex[nextDay]) {
        arrowMat.map = arrowTex[nextDay];
        arrowMat.needsUpdate = true;
      }
    }
    if (key === "done" && guideKey !== "done") cb.onGuide(null);
    guideKey = key;
    }
    arrow.visible = arrowOn && started && guideTarget.on && currentZone === null;
    if (arrow.visible) {
      arrow.position.set(car.x, car.y + 4.6 + Math.sin(t * 3) * 0.25, car.z);
      camInv.copy(camera.quaternion).invert();
      dirV.set(guideTarget.x - car.x, 0, guideTarget.z - car.z).normalize().applyQuaternion(camInv);
      const want = Math.atan2(-dirV.x, -dirV.z + dirV.y * 0.5);
      let diff = want - arrowAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      arrowAngle += diff * Math.min(1, dt * 8);
      arrowMat.rotation = arrowAngle;
      const pulse = 1.6 + Math.sin(t * 5) * 0.08;
      arrow.scale.set(pulse, pulse, 1);
    }
  }

  function render() {
    raf = requestAnimationFrame(render);
    if (document.hidden) return;
    const now = performance.now();
    adaptResolution(now);
    tick(now);
  }

  /** One frame: simulate, animate, draw. */
  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    frame++;
    step(!started && introOn ? introUpdate(dt, t) : dt, t);
    // A running day cycle repaints the sky often (cheap: a 2×256 gradient); otherwise rarely
    if (frame % (cycleSec ? 6 : 600) === 0) applyTimeOfDay();
    // Slow-device check: after warming up, average the frame rate over 4 s windows.
    if (started && cb.onSlow && !slowReported) {
      slowAcc += dt;
      slowFrames++;
      if (slowAcc > 4) {
        const fps = slowFrames / slowAcc;
        if (t > 6 && fps < 25) {
          slowReported = true;
          cb.onSlow();
        }
        slowAcc = 0;
        slowFrames = 0;
      }
    }

    const { h, m, s } = ist();
    for (let i = 0; i < clockHands.length; i += 2) {
      clockHands[i].rotation.z = -((h + m / 60) / 12) * Math.PI * 2;
      clockHands[i + 1].rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
    }
    for (const l of labels) {
      if (!l.fade) continue;
      const d = camera.position.distanceTo(l.s.position);
      const o = Math.max(0, Math.min(1, 1 - (d - 45) / 30));
      l.s.material.opacity = o;
      l.s.visible = o > 0.02;
    }
    dayNumbers.forEach((n, i) => {
      n.position.y = terrain(CENTERS[i].x, CENTERS[i].y) + 30 + Math.sin(t * 1.4 + i * 2) * 1.2;
    });
    for (const g of spinning) g.rotation.y = t * 0.8;
    wordGlow.value = (0.3 + nightAmt * 0.9) * (0.85 + Math.sin(t * 2.2) * 0.15);
    // Foam laps in and out; motes drift (fireflies wander and blink at night)
    foamMat.opacity = 0.55 + Math.sin(t * 1.3) * 0.25;
    foam.scale.setScalar(1 + Math.sin(t * 1.3) * 0.006);
    if (frame % 2 === 0) {
      const ox = car.x;
      const oz = car.z;
      const half = moteBox.w / 2;
      const wob = nightAmt * 1.2;
      for (let i = 0; i < MOTES; i++) {
        const j = i * 3;
        motePos[j] += (moteVel[j] + Math.sin(t * 1.7 + i) * wob) * dt * 2;
        motePos[j + 1] += (moteVel[j + 1] + Math.cos(t * 1.3 + i * 2) * wob * 0.4) * dt * 2;
        motePos[j + 2] += (moteVel[j + 2] + Math.cos(t * 1.1 + i) * wob) * dt * 2;
        // Keep them in a box around the rover, wrapping at the edges
        const dx = motePos[j] - ox;
        const dz = motePos[j + 2] - oz;
        if (dx > half) motePos[j] -= moteBox.w;
        else if (dx < -half) motePos[j] += moteBox.w;
        if (dz > half) motePos[j + 2] -= moteBox.w;
        else if (dz < -half) motePos[j + 2] += moteBox.w;
        const gy = terrain(motePos[j], motePos[j + 2]);
        if (motePos[j + 1] > gy + moteBox.h) motePos[j + 1] = gy + 0.5;
        else if (motePos[j + 1] < gy + 0.3) motePos[j + 1] = gy + moteBox.h;
      }
      moteGeo.attributes.position.needsUpdate = true;
    }
    animateLife(t, dt);
    for (const [i, c] of clouds.entries()) {
      c.position.x += dt * (0.6 + (i % 3) * 0.3);
      if (c.position.x > 190) c.position.x = -190;
    }

    if (!started) {
      introCamera(dt);
    } else {
      // In a car the view drifts back behind you while driving; on foot it stays put
      if (driving && mode === "drive" && (lookYaw || lookPitch)) {
        const k = Math.exp(-dt * 2.5);
        lookYaw *= k;
        lookPitch *= k;
        if (Math.abs(lookYaw) < 0.002) lookYaw = 0;
        if (Math.abs(lookPitch) < 0.002) lookPitch = 0;
      }
      const yaw = car.heading + lookYaw;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      if (mode === "walk") {
        // On foot: a free orbit round your head. Tilt down past the shoulders to look up at
        // the whole sky, or up and over to look straight down at your feet.
        const dist = 4 + view * 9;
        const elev = Math.min(1.45, lookPitch + 0.18);
        const ce = Math.cos(elev);
        const head = car.y + 1.6;
        camPos.set(car.x - fx * dist * ce, head + dist * Math.sin(elev), car.z - fz * dist * ce);
        const gh = terrain(camPos.x, camPos.z) + 0.35;
        if (camPos.y < gh) camPos.y = gh;
        camera.position.lerp(camPos, 1 - Math.pow(0.0005, dt));
        // looking up: aim well above the head so the sky fills the view
        const up = elev < 0 ? -elev * dist * 1.6 : 0;
        fwd.set(car.x + fx * 1.2, head + up, car.z + fz * 1.2);
        camLook.lerp(fwd, 1 - Math.pow(0.0002, dt));
      } else {
        // Phones held sideways get a low chase camera that looks down the road, like driving
        // games; elsewhere the higher view that shows more of the island.
        const chase = chaseCam;
        // view: 0 = close behind the car, 1 = high and far
        const back = (chase ? 6.2 + view * 12 : 8 + view * 20) + Math.abs(car.speed) * (chase ? 0.12 : 0.2);
        // Pitch swings the camera up over the car (positive) or down towards the ground
        const lift = (chase ? 2.3 + view * 7 : 4.5 + view * 13) + Math.abs(car.speed) * (chase ? 0.03 : 0.08) + lookPitch * (6 + view * 8);
        camPos.set(car.x - fx * back, car.y + lift, car.z - fz * back);
        const gh = terrain(camPos.x, camPos.z) + (chase ? 1.2 : 2);
        if (camPos.y < gh) camPos.y = gh;
        camera.position.lerp(camPos, 1 - Math.pow(chase ? 0.0008 : 0.0025, dt));
        const ahead = chase ? 9 : 4;
        fwd.set(car.x + fx * ahead, car.y + (chase ? 1.2 : 1.5), car.z + fz * ahead);
        camLook.lerp(fwd, 1 - Math.pow(0.0005, dt));
      }
    }
    // Nitro widens the view a little, like the world rushing past
    // wider on foot (see more sky and ground) and in the sideways chase view
    const fovWant = !started ? introFov + (baseFov - 50) : baseFov + nitroLevel * 9 + (mode === "walk" ? 16 : chaseCam ? 8 : 0);
    if (Math.abs(camera.fov - fovWant) > 0.05) {
      camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }
    camera.lookAt(camLook);
    if (renderer.shadowMap.enabled && frame % shadowEvery === 0) {
      // Move the sun (and its shadow camera) only on frames that redraw the shadow map,
      // snapped to the shadow texels, so skipped frames don't slide or shimmer.
      const texel = 80 / 1024;
      const sx = Math.round(camLook.x / texel) * texel;
      const sz = Math.round(camLook.z / texel) * texel;
      sun.position.set(sx + 40, 70, sz + 30);
      sun.target.position.set(sx, camLook.y, sz);
      sun.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
    } else if (!renderer.shadowMap.enabled) {
      sun.position.set(camLook.x + 40, 70, camLook.z + 30);
      sun.target.position.copy(camLook);
    }
    fill.position.set(camLook.x - 50, 30, camLook.z - 40);
    fill.target.position.copy(camLook);

    renderer.render(scene, camera);
    if (frame % 2 === 0) drawMinimap();
  }

  camera.position.copy(camPos);
  render();
  cb.onReady();

  // Measuring aid, only with ?perf in the address: frame cost, draw calls, triangles.
  // Local testing only, so nobody can use it to move around in the time trial
  if (new URLSearchParams(window.location.search).has("perf") && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    (window as unknown as { __chronosPerf: unknown }).__chronosPerf = {
      /** Test aid: stand next to vehicle i (on foot). */
      standBy(i: number) {
        const v = vehicles[i];
        if (!v) return vehicles.length;
        if (mode === "drive") exitVehicle();
        car.x = v.x + Math.cos(v.heading) * 2.6;
        car.z = v.z - Math.sin(v.heading) * 2.6;
        car.heading = v.heading;
        return v.name;
      },
      /** Test aid: put the car on the coast loop just before the start line, facing along it. */
      toLoop(back = 6) {
        const [x, z] = RING_PTS[(RING_START - back + RING_N) % RING_N];
        const [bx, bz] = RING_PTS[(RING_START - back + 1 + RING_N) % RING_N];
        car.x = x;
        car.z = z;
        car.heading = Math.atan2(bx - x, bz - z);
        car.speed = 0;
        car.y = ground(x, z);
        return { x, z };
      },
      /** Test aid: cut the intro film to shot i on the next frame. */
      shot(i: number) {
        shotI = (i - 1 + SHOTS.length) % SHOTS.length;
        shotT = 1e9;
        return SHOTS[i]?.title;
      },
      film: () => ({ shotI, shotT: +shotT.toFixed(2), slow: +slow.toFixed(2), maxBend: +Math.max(...LOOP_K.map(Math.abs)).toFixed(4), drift: racers.map((r) => +r.drift.toFixed(2)), speed: racers.map((r) => +r.speed.toFixed(1)) }),
      state: () => ({ onLoop, nitroTank: +nitroTank.toFixed(3), x: +car.x.toFixed(1), z: +car.z.toFixed(1), speed: +car.speed.toFixed(1), mode }),
      /** Time each part of a frame on its own (ms per frame, averaged over n). */
      split(n = 120) {
        const gl = renderer.getContext();
        const time = (fn: () => void) => {
          gl.finish();
          const a = performance.now();
          for (let i = 0; i < n; i++) fn();
          gl.finish();
          return +((performance.now() - a) / n).toFixed(3);
        };
        let tt = (performance.now() - t0) / 1000;
        return {
          step: time(() => step(1 / 60, (tt += 1 / 60))),
          life: time(() => animateLife((tt += 1 / 60), 1 / 60)),
          strollers: time(() => animateStrollers((tt += 1 / 60), 1 / 60)),
          minimap: time(() => drawMinimap()),
          render: time(() => renderer.render(scene, camera)),
          colliders: colliders.length,
        };
      },
      /** Visible drawables grouped by kind, biggest first. */
      breakdown() {
        const out: Record<string, number> = {};
        scene.traverseVisible((o) => {
          const d = o as THREE.Mesh;
          if (!d.isMesh && !(o as THREE.Sprite).isSprite && !(o as THREE.Points).isPoints) return;
          let parent = "";
          for (let p = o.parent; p && p !== scene; p = p.parent) parent = p === rover ? "rover" : parent || "group";
          const key = `${o.type}:${(d.material as THREE.Material).type}${parent ? ":" + parent : ""}${o.castShadow ? ":cast" : ""}`;
          out[key] = (out[key] ?? 0) + 1;
        });
        return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
      },
      bench(n = 120) {
        const gl = renderer.getContext();
        gl.finish();
        const start = performance.now();
        let simNow = last;
        const times: number[] = [];
        for (let i = 0; i < n; i++) {
          const a = performance.now();
          simNow += 1000 / 60;
          tick(simNow);
          gl.finish();
          times.push(performance.now() - a);
        }
        times.sort((x, y) => x - y);
        let objects = 0;
        let meshes = 0;
        scene.traverse((o) => {
          objects++;
          if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints) meshes++;
        });
        return {
          avgMs: +((performance.now() - start) / n).toFixed(2),
          p95Ms: +times[Math.floor(n * 0.95)].toFixed(2),
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          programs: renderer.info.programs?.length ?? 0,
          objects,
          drawables: meshes,
          pixelRatio: renderer.getPixelRatio(),
        };
      },
    };
  }

  return {
    input,
    start() {
      if (!started) endIntro();
      started = true;
      runArmed = true;
      canvas.focus?.();
    },
    teleport(id) {
      const z = zoneRt.find((q) => q.id === id);
      if (!z) return;
      const c = CENTERS[z.day];
      const dx = c.x - z.x;
      const dz = c.y - z.z;
      const d = Math.hypot(dx, dz) || 1;
      car.x = z.x + (dx / d) * 3.5;
      car.z = z.z + (dz / d) * 3.5;
      car.heading = Math.atan2(-dx, -dz);
      car.speed = 0;
      car.vy = 0;
      car.air = false;
      car.y = ground(car.x, car.z);
      camera.position.set(car.x + (dx / d) * 14, car.y + 9, car.z + (dz / d) * 14);
    },
    respawn: () => resetPlayer(),
    look(yaw, pitch) {
      // On foot you can look around while walking (a second finger on the screen)
      if (!started || (input.held && mode !== "walk")) return;
      lookYaw = Math.atan2(Math.sin(lookYaw + yaw), Math.cos(lookYaw + yaw));
      lookPitch = mode === "walk" ? Math.max(-1.35, Math.min(1.27, lookPitch + pitch)) : Math.max(-0.45, Math.min(0.9, lookPitch + pitch));
    },
    getSpeed: () => (mode === "walk" ? 0 : Math.min(1, Math.abs(car.speed) / (32 * speedScale))),
    getSprintLock: () => sprintLock,
    canToggle: () => started && (mode === "drive" ? !car.air : nearV !== null),
    toggleVehicle,
    setLook,
    getNitro: () => nitroTank,
    onLoop: () => onLoop,
    setSpeedLevel(level) {
      speedScale = SPEED_LEVELS[level] ?? SPEED_LEVELS[1];
    },
    setTime(hour) {
      forcedHour = hour === null ? null : ((hour % 24) + 24) % 24;
      applyTimeOfDay();
    },
    setDayCycle(seconds) {
      if (seconds && seconds > 0) {
        // carry on from whatever hour is showing, so switching on doesn't jump
        cycleFrom = shownHour;
        cycleT0 = performance.now();
        cycleSec = seconds;
      } else cycleSec = null;
      applyTimeOfDay();
    },
    getHour: () => shownHour,
    setQuality(q) {
      quality = q;
      // Quality tiers, as games do: High = soft shadows every frame; Medium = cheaper
      // shadows every other frame; Low = no shadows; Auto = soft, every other frame.
      setShadows(!lowPower && q !== "low", q === "medium" ? 1 : 2.5, q === "high" ? 1 : 2);
      const fixed = q === "high" ? DPR_MAX : q === "medium" ? Math.min(DPR_MAX, 1) : q === "low" ? DPR_MIN : null;
      if (fixed !== null) dpr = fixed;
      else {
        dpr = Math.min(dprCeiling, DPR_MAX);
        dprWait = 3000;
      }
      renderer.setPixelRatio(dpr);
      resize();
    },
    setArrow(on) {
      arrowOn = on;
    },
    setView(v) {
      view = Math.max(0, Math.min(1, v));
    },
    setLive(ids) {
      const set = new Set(ids);
      for (const z of zoneRt) {
        z.live = set.has(z.id);
        z.liveTag.visible = z.live;
        (z.beam.material as THREE.MeshBasicMaterial).color.set(z.live ? "#e2452b" : DAY_COLORS[z.day]);
        if (!z.live) z.beam.scale.set(1, 1, 1);
      }
    },
    snapshot() {
      if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      return canvas.toDataURL("image/png");
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", clearKeys);
      window.removeEventListener("resize", resize);
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      extraMats.forEach((m) => {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      });
      labels.forEach(({ s: l }) => {
        l.material.map?.dispose();
        l.material.dispose();
      });
      arrowTex.forEach((t) => t.dispose());
      liveTex.dispose();
      skyTex.dispose();
      renderer.dispose();
    },
  };
}
