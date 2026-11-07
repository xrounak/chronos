import { createClient } from "@supabase/supabase-js";
import { DAYS, type Day, type ProgramItem } from "./festival";

export const MAIN_SITE = (process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://sic.gecp.in").replace(/\/$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chronos.sic.gecp.in").replace(/\/$/, "");

/** Where the general "Register" buttons go when an event has no page of its own yet. */
export const ALL_EVENTS_URL = `${MAIN_SITE}/events?from=chronos`;

type DbEvent = {
  slug: string | null;
  title: string;
  summary: string | null;
  venue: string | null;
  starts_at: string | null;
  ends_at: string | null;
  event_type: string;
  participation: "individual" | "team";
  team_min: number | null;
  team_max: number | null;
  capacity: number | null;
  reg_closes_at: string | null;
};

export type ShowEvent = {
  name: string;
  venue: string;
  kind: ProgramItem["kind"] | string;
  summary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Registration on sic.gecp.in, or null while the event is not published there yet. */
  registerUrl: string | null;
  /** The event page's rule book on sic.gecp.in, or null while the event is not published there yet. */
  detailsUrl: string | null;
  team: string | null;
  photo: string | null;
};

export type ShowDay = Omit<Day, "program"> & { events: ShowEvent[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * Published Chronos events from the main site, read with the public key (only what
 * anyone may see). Never throws: without the database the programme still shows.
 */
async function fetchFestivalEvents(): Promise<DbEvent[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await supabase
      .from("events")
      .select("slug, title, summary, venue, starts_at, ends_at, event_type, participation, team_min, team_max, capacity, reg_closes_at")
      .eq("festival", "chronos")
      .eq("visibility", "public")
      .in("status", ["published", "completed"])
      .order("starts_at");
    return (data ?? []) as DbEvent[];
  } catch {
    return [];
  }
}

const registerUrl = (slug: string | null) => (slug ? `${MAIN_SITE}/events/${slug}?from=chronos` : null);
const detailsUrl = (slug: string | null) => (slug ? `${MAIN_SITE}/events/${slug}?from=chronos#rule-book` : null);
const teamLabel = (e: DbEvent) =>
  e.participation === "team" ? `Teams of ${e.team_min ?? 1}–${e.team_max ?? e.team_min ?? 1}` : null;

/**
 * The three days with their events. Each programme item takes the registration link
 * of the matching published event; published Chronos events that are not in the
 * programme are added to the day they happen on.
 */
export async function getFestival(): Promise<ShowDay[]> {
  const db = await fetchFestivalEvents();
  const used = new Set<DbEvent>();

  const days: ShowDay[] = DAYS.map(({ program, ...day }) => ({
    ...day,
    events: program.map((item) => {
      const found = db.find((e) => !used.has(e) && item.match.some((m) => norm(e.title).includes(norm(m))));
      if (found) used.add(found);
      return {
        name: item.name,
        venue: found?.venue ?? item.venue,
        kind: item.kind,
        summary: found?.summary ?? null,
        startsAt: found?.starts_at ?? null,
        endsAt: found?.ends_at ?? null,
        registerUrl: registerUrl(found?.slug ?? null),
        detailsUrl: detailsUrl(found?.slug ?? null),
        team: found ? teamLabel(found) : null,
        photo: item.photo ?? null,
      };
    }),
  }));

  for (const e of db) {
    if (used.has(e) || !e.starts_at) continue;
    const day = days.find((d) => d.isoDate === dayOf(e.starts_at!));
    if (!day) continue;
    day.events.push({
      name: e.title,
      venue: e.venue ?? "GEC Palamu",
      kind: e.event_type,
      summary: e.summary,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      registerUrl: registerUrl(e.slug),
      detailsUrl: detailsUrl(e.slug),
      team: teamLabel(e),
      photo: null,
    });
  }
  return days;
}
