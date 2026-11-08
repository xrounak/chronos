/**
 * Pixel-art icons for the Chronos game, drawn on a small grid so they match the blocky
 * fonts and paper-cut look (crisp edges, ink colour by default). Each icon is a list of
 * rows where "#" is a filled pixel.
 */

const ICONS = {
  camera: ["...###....", "##########", "#..####..#", "#.##..##.#", "#.##..##.#", "#..####..#", "##########"],
  trophy: ["##########", "#.######.#", "#.######.#", ".########.", "..######..", "....##....", "....##....", "..######..", "..######.."],
  help: [".####.", "##..##", "....##", "...##.", "..##..", "..##..", "......", "..##..", "..##.."],
  arrow: ["....#...", "....##..", "#######.", "########", "#######.", "....##..", "....#..."],
  close: ["##...##", ".##.##.", "..###..", "...#...", "..###..", ".##.##.", "##...##"],
  check: [".......#", "......##", "#....##.", "##..##..", ".####...", "..##...."],
  list: ["##.######", ".........", "##.######", ".........", "##.######"],
  home: ["...##...", "..####..", ".######.", "########", ".##..##.", ".##..##.", ".######."],
  page: ["#####..", "#...##.", "#....##", "#.###.#", "#.....#", "#.###.#", "#.....#", "#######"],
  share: ["...#...", "..###..", ".#####.", "...#...", "#..#..#", "#.....#", "#######"],
  download: ["...#...", "...#...", "...#...", ".#####.", "..###..", "...#...", "#.....#", "#######"],
  nitro: ["..####..", "...##...", ".######.", ".#....#.", ".#..#.#.", ".#.##.#.", ".#.#..#.", ".#....#.", ".######."],
  bolt: ["....##", "...##.", "..##..", ".#####", "..##..", ".##...", "##...."],
  sound: ["...#....", "..##.#..", "####..#.", "####.#.#", "####.#.#", "####..#.", "..##.#..", "...#...."],
} as const;

export type IconName = keyof typeof ICONS;

function pathOf(rows: readonly string[]) {
  let d = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") d += `M${x} ${y}h1v1h-1z`;
  });
  return d;
}

const PATHS = Object.fromEntries(Object.entries(ICONS).map(([k, rows]) => [k, { d: pathOf(rows), w: rows[0].length, h: rows.length }])) as Record<
  IconName,
  { d: string; w: number; h: number }
>;

export function Icon({ name, className = "", title }: { name: IconName; className?: string; title?: string }) {
  const p = PATHS[name];
  return (
    <svg
      viewBox={`-0.5 -0.5 ${p.w + 1} ${p.h + 1}`}
      className={`px-icon ${className}`}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={p.d} fill="currentColor" />
    </svg>
  );
}
