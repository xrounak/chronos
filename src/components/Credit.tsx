"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/game/Icons";

/**
 * Site credit: "Developed by SIC", plus a "Contact developer" link that opens a small card
 * with the developer's profiles, for anyone who wants to contribute.
 */

const LINKS = [
  {
    label: "Instagram",
    handle: "@unknowngmr02",
    href: "https://www.instagram.com/unknowngmr02/",
    icon: "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM17.5 5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
  },
  {
    label: "LinkedIn",
    handle: "rounak-kumar-unknown",
    href: "https://www.linkedin.com/in/rounak-kumar-unknown/",
    icon: "M4 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-2 6h4v12H2V9Zm7 0h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V21H9V9Z",
  },
  {
    label: "GitHub",
    handle: "xrounak",
    href: "https://github.com/xrounak",
    icon: "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
  },
];

export function Credit({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (card.current && !card.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span className={`credit ${className}`} ref={card}>
      <span className="credit-by">Developed by SIC</span>
      <span className="credit-sep" aria-hidden="true">
        ·
      </span>
      <button type="button" className="credit-name" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        Contact developer
      </button>
      {open && (
        <span className="credit-card" role="dialog" aria-label="Contact the developer">
          <span className="credit-head">
            <span className="credit-avatar" aria-hidden="true">
              RK
            </span>
            <span className="flex flex-col">
              <span className="credit-title">Rounak Kumar</span>
              <span className="credit-role">Developer · want to contribute? Reach out</span>
            </span>
          </span>
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="credit-link">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={l.icon} fill="currentColor" />
              </svg>
              <span className="flex flex-col">
                <span className="credit-link-label">{l.label}</span>
                <span className="credit-link-handle">{l.handle}</span>
              </span>
              <Icon name="arrow" className="ml-auto credit-go" />
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
