/**
 * The island's shape, shared by the 3D world, its minimap and the flat map in the lite
 * version: an oval with a wavy, hand-cut shoreline (bays and headlands), not a perfect
 * ellipse.
 */

/** Half-width (x) and half-length (z) of the oval before the shoreline wobble. */
export const ISLAND_A = 145;
export const ISLAND_B = 210;

/** How far the shore pushes out (+) or pulls in (-) at each angle round the island. */
export function wobble(theta: number) {
  return 0.045 * Math.sin(3 * theta + 0.7) + 0.03 * Math.sin(5 * theta + 2.1) + 0.02 * Math.sin(8 * theta + 4);
}

/** 0 at the centre, 1 on the waterline. */
export function shore(x: number, z: number) {
  const u = x / ISLAND_A;
  const v = z / ISLAND_B;
  return Math.hypot(u, v) / (1 + wobble(Math.atan2(v, u)));
}

/** Points along the shoreline scaled by `k` (1 = waterline), for drawing. */
export function shorePoints(k = 1, n = 120): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = (1 + wobble(t)) * k;
    return [Math.cos(t) * ISLAND_A * r, Math.sin(t) * ISLAND_B * r];
  });
}

/** The shoreline as an SVG path. */
export function shorePath(k = 1) {
  return shorePoints(k).map(([x, z], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${z.toFixed(1)}`).join(" ") + " Z";
}
