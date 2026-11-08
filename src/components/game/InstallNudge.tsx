"use client";

import { useEffect, useState } from "react";
import { useInstall } from "@/components/install";
import { cue } from "@/components/sound";
import { Babu } from "./Guide";
import { Icon } from "./Icons";

const SNOOZE_KEY = "chronos-install-snooze";
const SEEN_KEY = "chronos-install-seen";
/** How long someone plays before Babu mentions installing. */
const AFTER_MS = 45_000;
const SNOOZE_DAYS = 3;

/**
 * Babu pops up once, small and off to the side, to suggest installing the app. Never
 * during the tutorial, an event card, the menu or the finale; at most once per visit;
 * "Not now" (or ignoring it) keeps it away for a few days. On iPhone it shows the
 * Share → Add to Home Screen steps, since Safari has no install button.
 */
export function InstallNudge({ busy, request = 0 }: { busy: boolean; request?: number }) {
  const install = useInstall();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  // Wait until they've been playing a while.
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!ready || busy || open || !install.available) return;
    try {
      if (sessionStorage.getItem(SEEN_KEY) === "1") return;
      if (Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now()) return;
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setOpen(true);
    cue("click");
  }, [ready, busy, open, install.available]);

  // Opened from the menu: show it now, whatever the timers say.
  useEffect(() => {
    if (request > 0) setOpen(true);
  }, [request]);

  // It never lingers: gone by itself after a while.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), 14_000);
    return () => clearTimeout(id);
  }, [open]);

  const snooze = () => {
    setOpen(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {}
  };

  if (!open || busy) return null;
  return (
    <div className="nudge" role="dialog" aria-label="Install Chronos">
      <div className="nudge-bolt">
        <Babu mood="wave" />
      </div>
      <div className="nudge-card">
        <p className="nudge-title">Psst! Take Chronos with you</p>
        {install.canPrompt ? (
          <p className="nudge-text">Install it to play full screen and open it straight from your home screen. It&apos;s quick and free.</p>
        ) : (
          <p className="nudge-text">
            Tap <Icon name="share" className="inline-ico" /> <b>Share</b>, then <b>Add to Home Screen</b> to play full screen anytime.
          </p>
        )}
        <div className="nudge-actions">
          {install.canPrompt && (
            <button
              type="button"
              className="chip chip-solid"
              onClick={async () => {
                cue("click");
                const ok = await install.prompt();
                if (!ok) snooze();
                else setOpen(false);
              }}
            >
              <Icon name="download" className="inline-ico" /> Install
            </button>
          )}
          <button type="button" className="chip" onClick={snooze}>
            {install.canPrompt ? "Not now" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
