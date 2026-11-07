# CHRONOS 2026

The storytelling site for Chronos, the three-day festival of the Science & Innovation
Club, GEC Palamu. It lives at `chronos.sic.gecp.in`. Registration, team-making and
event management stay on the SIC website (`sic.gecp.in`); every "Register" here
links to the event's page there with `?from=chronos`.

## How the programme gets its links
`src/lib/festival.ts` holds the copy, the three days and their events.
`src/lib/events.ts` reads published, public events tagged **Chronos 2026** on the
SIC website (event form, "Part of a festival") and matches them to the programme by
name (`match` words). Matched events get a "Register" link; others show "Opens soon".
Chronos events that are not in the programme are added to the day they happen on.
The page refreshes this every five minutes.

## Run it
```
cp .env.example .env.local   # same Supabase URL and publishable key as sic.gecp.in
npm install
npm run dev                  # http://localhost:3300
```

## Deploy (Vercel)
1. New Vercel project from this folder.
2. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `NEXT_PUBLIC_MAIN_SITE_URL=https://sic.gecp.in`, `NEXT_PUBLIC_SITE_URL=https://chronos.sic.gecp.in`.
3. Domains: add `chronos.sic.gecp.in`; at the DNS for `gecp.in` add the CNAME Vercel shows
   (name `chronos.sic`).

## What is inside
- Story in chapters with words rising out of masks (GSAP ScrollTrigger), smooth
  scrolling (Lenis), and the three days moving sideways on wide screens.
- One field of particles (three.js) that becomes a clock, a spark, three gears, a
  world, a helix of time and a portal as you scroll. Fewer particles on phones.
- Film grain, light leaks, vignette, an optional sound track (SFX Kit, CC0).
- Reduced motion: no smooth scroll or reveals; the days stack; the scene holds still.
- SEO: real HTML text, Festival structured data with every event, share image,
  sitemap, robots.

## Scrapbook pieces
`public/collage/` holds the paper, tape, blueprint, sticky-note and stamp cut-outs
(WebP and SVG). They are placed per chapter in `src/app/page.tsx` with `<Piece>`
(`src/components/Collage.tsx`): position, width, angle, depth (parallax) and an
optional handwritten `note`. On phones only the pieces without `desktopOnly` show.
New photos go in the same folder; convert big PNGs to WebP first (about 1000 px).

