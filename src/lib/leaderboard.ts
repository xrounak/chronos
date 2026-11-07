import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The time-trial board, kept on sic.gecp.in's database. Posting and reading go through
 * two public functions (submit_chronos_run, chronos_leaderboard); the table is closed.
 */

export type Run = { place: number; name: string; seconds: number; gears: number };

let client: SupabaseClient | null = null;
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export async function topRuns(limit = 10): Promise<Run[] | null> {
  const c = db();
  if (!c) return null;
  const { data, error } = await c.rpc("chronos_leaderboard", { p_limit: limit });
  if (error) return null;
  return (data as Array<{ place: number; name: string; seconds: number | string; gears: number }>).map((r) => ({
    place: Number(r.place),
    name: r.name,
    seconds: Number(r.seconds),
    gears: r.gears,
  }));
}

const MESSAGES: Record<string, string> = {
  NAME_LENGTH: "Use 2 to 24 characters for your name.",
  TIME_OUT_OF_RANGE: "That time can't go on the board.",
  TOO_MANY_RUNS: "Lots of runs right now. Try again in a minute.",
};

/** Posts a run; returns its place, or an error message to show. */
export async function submitRun(name: string, seconds: number, gears: number): Promise<{ place: number } | { error: string }> {
  const c = db();
  if (!c) return { error: "The leaderboard isn't available right now." };
  const { data, error } = await c.rpc("submit_chronos_run", { p_name: name, p_seconds: seconds, p_gears: gears });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: code ? MESSAGES[code] : "Couldn't save your run. Try again." };
  }
  return { place: Number(data) };
}

export const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
};
