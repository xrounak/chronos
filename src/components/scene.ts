import * as THREE from "three";
import { story } from "@/lib/story";

/**
 * One field of glowing particles that reshapes itself for each chapter:
 *   opening  a clock face        prologue  a single spark bursting
 *   grind    three meshed gears  arrival   a world of builders gathering
 *   days     a helix of time     epilogue  an open portal
 *   final    the clock again
 * Points are moved on the CPU (a few thousand, cheap), driven by `story.s`.
 */

type Vec = [number, number, number];
const TAU = Math.PI * 2;
const rnd = (a = -1, b = 1) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function sample(n: number, gen: (i: number) => Vec): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) out.set(gen(i), i * 3);
  return out;
}

function clock(n: number): Float32Array {
  return sample(n, (i) => {
    const r = Math.random();
    if (r < 0.5) {
      const a = rnd(0, TAU);
      const rad = 3.1 + gauss() * 0.06;
      return [Math.cos(a) * rad, Math.sin(a) * rad, gauss() * 0.1];
    }
    if (r < 0.68) {
      const tick = i % 12;
      const a = (tick / 12) * TAU;
      const len = tick % 3 === 0 ? 0.55 : 0.28;
      const d = 2.75 - Math.random() * len;
      return [Math.cos(a) * d, Math.sin(a) * d, gauss() * 0.05];
    }
    if (r < 0.8) {
      const t = Math.random();
      const a = TAU * 0.25 - 0.9;
      return [Math.cos(a) * t * 1.5 + gauss() * 0.03, Math.sin(a) * t * 1.5 + gauss() * 0.03, 0.05];
    }
    if (r < 0.93) {
      const t = Math.random();
      const a = TAU * 0.25 + 0.35;
      return [Math.cos(a) * t * 2.3 + gauss() * 0.02, Math.sin(a) * t * 2.3 + gauss() * 0.02, 0.1];
    }
    const a = rnd(0, TAU);
    const d = 3.6 + Math.random() * 2.6;
    return [Math.cos(a) * d, Math.sin(a) * d, rnd(-1.5, 1.5)];
  });
}

function spark(n: number): Float32Array {
  return sample(n, () => {
    const r = Math.random();
    const dir: Vec = [gauss(), gauss(), gauss()];
    const len = Math.hypot(...dir) || 1;
    if (r < 0.45) {
      const d = Math.pow(Math.random(), 2.5) * 0.7;
      return [(dir[0] / len) * d, (dir[1] / len) * d, (dir[2] / len) * d];
    }
    const d = 0.4 + Math.pow(Math.random(), 1.6) * 4.6;
    return [(dir[0] / len) * d, (dir[1] / len) * d * 0.8, (dir[2] / len) * d * 0.6];
  });
}

function gears(n: number): Float32Array {
  const layout = [
    { x: -1.75, y: 0.95, r: 1.55 },
    { x: 1.75, y: 0.95, r: 1.55 },
    { x: 0, y: -1.95, r: 1.55 },
  ];
  return sample(n, (i) => {
    const g = layout[i % 3];
    const r = Math.random();
    const a = rnd(0, TAU);
    if (r < 0.7) {
      // outline with 12 teeth
      const tooth = (a / TAU) * 12;
      const f = tooth - Math.floor(tooth);
      const rad = g.r * (f > 0.15 && f < 0.5 ? 1 : 0.84);
      return [g.x + Math.cos(a) * rad, g.y + Math.sin(a) * rad, gauss() * 0.12];
    }
    const rad = g.r * 0.55 + gauss() * 0.03;
    return [g.x + Math.cos(a) * rad, g.y + Math.sin(a) * rad, gauss() * 0.08];
  });
}

function world(n: number): Float32Array {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return sample(n, (i) => {
    if (i % 7 === 0) {
      const a = rnd(0, TAU);
      const d = 3.4 + Math.random() * 3;
      return [Math.cos(a) * d, rnd(-2.5, 2.5), Math.sin(a) * d * 0.5];
    }
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    const R = 2.6;
    return [Math.cos(th) * rad * R, y * R, Math.sin(th) * rad * R];
  });
}

function helix(n: number): Float32Array {
  return sample(n, (i) => {
    const strand = i % 3;
    const t = Math.random();
    const x = (t - 0.5) * 12;
    const a = t * TAU * 3 + (strand * TAU) / 3;
    const rad = 1.1 + gauss() * 0.06;
    return [x, Math.cos(a) * rad, Math.sin(a) * rad];
  });
}

function portal(n: number): Float32Array {
  return sample(n, () => {
    const a = rnd(0, TAU);
    const r = Math.random();
    if (r < 0.75) {
      const rad = 2.9 + gauss() * 0.12;
      return [Math.cos(a) * rad, Math.sin(a) * rad * 1.25, gauss() * 0.15];
    }
    // light pouring through toward the viewer
    const rad = Math.sqrt(Math.random()) * 2.6;
    return [Math.cos(a) * rad, Math.sin(a) * rad * 1.25, Math.random() * 4];
  });
}

/** Soft round dot for the particles. */
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,236,190,0.85)");
  grd.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Per chapter: where the shape sits (right of the text while the story reads on the left) and how bright it is. */
const OFFSET_X = [0, 2.8, 2.8, 2.8, 0, 0, 0];
const OPACITY = [0.95, 0.9, 0.85, 0.9, 0.4, 0.9, 0.95];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function startScene(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }) {
  const small = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
  const N = small ? 2600 : 6000;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  const shapes = [clock(N), spark(N), gears(N), world(N), helix(N), portal(N), clock(N)];
  const positions = new Float32Array(shapes[0]);
  const phase = new Float32Array(N).map(() => Math.random() * TAU);
  const colors = new Float32Array(N * 3);
  const gold = new THREE.Color("#e0a83e");
  const hi = new THREE.Color("#ffe2a6");
  const ember = new THREE.Color("#e2582b");
  for (let i = 0; i < N; i++) {
    const c = Math.random() < 0.12 ? ember : Math.random() < 0.55 ? gold : hi;
    colors.set([c.r, c.g, c.b], i * 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const tex = dotTexture();
  const mat = new THREE.PointsMaterial({
    size: small ? 0.07 : 0.055,
    map: tex,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait phones: step back so the shapes fit the width.
    camera.position.z = camera.aspect < 1 ? 9 / Math.max(camera.aspect, 0.5) : 9;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const pointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  let raf = 0;
  let last = performance.now();
  let time = 0;
  let shown = -1;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += opts.reducedMotion ? 0 : dt;

    const s = Math.min(Math.max(story.s, 0), shapes.length - 1);
    const i = Math.floor(s);
    const t = smooth(0.55, 1, s - i);
    // Nothing moves when the motion is off and the visitor is not scrolling.
    if (opts.reducedMotion && shown === s) return;
    shown = s;

    const A = shapes[i];
    const B = shapes[Math.min(i + 1, shapes.length - 1)];
    const wob = opts.reducedMotion ? 0 : 0.035;
    for (let k = 0; k < N; k++) {
      const p = k * 3;
      const ph = phase[k];
      positions[p] = A[p] + (B[p] - A[p]) * t + Math.sin(time * 0.9 + ph) * wob;
      positions[p + 1] = A[p + 1] + (B[p + 1] - A[p + 1]) * t + Math.cos(time * 0.7 + ph) * wob;
      positions[p + 2] = A[p + 2] + (B[p + 2] - A[p + 2]) * t;
    }
    geo.attributes.position.needsUpdate = true;

    const j = Math.min(i + 1, shapes.length - 1);
    points.position.x = small ? 0 : OFFSET_X[i] + (OFFSET_X[j] - OFFSET_X[i]) * t;
    mat.opacity = (OPACITY[i] + (OPACITY[j] - OPACITY[i]) * t) * (small ? 0.75 : 1);

    // Gears turn, the world spins, the helix drifts sideways; the clock just breathes.
    points.rotation.y = i === 3 ? time * 0.15 : Math.sin(time * 0.2) * 0.25;
    points.rotation.z = i === 2 ? time * 0.08 : 0;
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (-pointer.y * 0.4 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointer);
    geo.dispose();
    mat.dispose();
    tex.dispose();
    renderer.dispose();
  };
}
