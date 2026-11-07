"use client";

import { track } from "@vercel/analytics";

/** Counts a click on a Register link in Vercel Analytics (event name, where it was clicked). */
export function trackRegister(event: string, from: string) {
  try {
    track("register_click", { event, from });
  } catch {}
}

/** A Register link that is counted. Plain link otherwise: works with scripts off. */
export function TrackedLink({ href, event, from, className, children }: { href: string; event: string; from: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} className={className} onClick={() => trackRegister(event, from)}>
      {children}
    </a>
  );
}
