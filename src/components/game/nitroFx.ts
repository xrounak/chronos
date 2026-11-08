/**
 * Picking up a nitro can: a flame orb pops out of the can, arcs across the screen and
 * merges into the nitro gauge (the NITRO button on touch, the dock on desktop), which
 * flares and says what the nitro is for. Plain DOM + Web Animations, so React never
 * re-renders for it and it costs nothing when no can is being picked up.
 */

/** The first few pickups explain what nitro does; after that just the amount. */
const EXPLAIN_TIMES = 3;
let pickups = 0;

const target = () =>
  document.querySelector<HTMLElement>(".game.has-touch .boost") ?? document.querySelector<HTMLElement>(".nitro-dock-ico");

function bezier(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, steps: number) {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return pts;
}

function orb(className: string, x: number, y: number) {
  const el = document.createElement("div");
  el.className = className;
  el.setAttribute("aria-hidden", "true");
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  return el;
}

export function flyNitro(x: number, y: number, tank: number) {
  const to = target();
  if (!to) return;
  pickups++;
  const r = to.getBoundingClientRect();
  const tx = r.left + r.width / 2;
  const ty = r.top + r.height / 2;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onScreen = x > -40 && y > -40 && x < innerWidth + 40 && y < innerHeight + 40;

  const land = () => {
    to.classList.remove("nitro-gain");
    void to.offsetWidth; // restart the flare
    to.classList.add("nitro-gain");
    window.setTimeout(() => to.classList.remove("nitro-gain"), 700);
    // The label sits over the whole gauge (the desktop dial), not just its icon
    const anchor = document.querySelector<HTMLElement>(".nitro-dial") ?? to;
    anchor.classList.remove("nitro-gain");
    void anchor.offsetWidth;
    anchor.classList.add("nitro-gain");
    window.setTimeout(() => anchor.classList.remove("nitro-gain"), 700);
    tip(anchor.getBoundingClientRect(), tank);
  };

  if (reduced || !onScreen) {
    land();
    return;
  }

  // Pop: the orb bursts up out of the can, then arcs to the gauge.
  const popY = y - 46;
  const cx = (x + tx) / 2 + (tx < x ? -1 : 1) * 60;
  const cy = Math.min(popY, ty) - 140;
  const path = bezier(x, popY, cx, cy, tx, ty, 14);
  const frames: Keyframe[] = [
    { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.2)`, opacity: 0, offset: 0 },
    { transform: `translate(${x}px, ${popY}px) translate(-50%, -50%) scale(1.5)`, opacity: 1, offset: 0.18 },
    ...path.slice(1).map(([px, py], i, all) => ({
      transform: `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${1.25 - ((i + 1) / all.length) * 0.65})`,
      opacity: 1,
      offset: 0.26 + ((i + 1) / all.length) * 0.74,
    })),
  ];
  // Hold a moment after the pop so it reads as "something came out of the can"
  frames.splice(2, 0, { transform: `translate(${x}px, ${popY}px) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: 0.26 });

  const duration = 900;
  const main = orb("nitro-orb", 0, 0);
  const trails = [0, 1, 2].map((i) => orb(`nitro-orb nitro-orb-trail t${i}`, 0, 0));
  const anim = main.animate(frames, { duration, easing: "cubic-bezier(0.45, 0, 0.3, 1)", fill: "forwards" });
  trails.forEach((el, i) => {
    el.animate(frames, { duration, delay: 45 * (i + 1), easing: "cubic-bezier(0.45, 0, 0.3, 1)", fill: "forwards" }).finished.then(
      () => el.remove(),
      () => el.remove(),
    );
  });
  anim.finished.then(
    () => {
      main.remove();
      land();
    },
    () => main.remove(),
  );
}

/** A small label over the gauge: the amount, and (the first few times) what nitro does. */
function tip(r: DOMRect, tank: number) {
  const touch = !!document.querySelector(".game.has-touch");
  const explain = pickups <= EXPLAIN_TIMES;
  const el = document.createElement("div");
  el.className = `nitro-tip ${touch ? "is-touch" : ""}`;
  el.setAttribute("role", "status");
  const head = document.createElement("b");
  head.textContent = tank > 0.99 ? "Tank full!" : "+33% Nitro";
  el.appendChild(head);
  if (explain) {
    const line = document.createElement("span");
    line.textContent = touch ? "Hold NITRO for a speed burst" : "Hold Shift for a speed burst";
    el.appendChild(line);
  }
  document.body.appendChild(el);
  // Above the gauge, kept on screen
  const w = el.offsetWidth;
  const cx = r.left + r.width / 2;
  const left = Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2));
  el.style.left = `${left}px`;
  // The little pointer under the label stays over the gauge even when the label is nudged in
  el.style.setProperty("--arrow-x", `${Math.max(14, Math.min(w - 14, cx - left))}px`);
  el.style.top = `${r.top - el.offsetHeight - 12}px`;
  window.setTimeout(() => el.remove(), explain ? 2800 : 1400);
}
