"use client";

import { useEffect, useState } from "react";

/**
 * Install support. Chrome/Edge/Android fire `beforeinstallprompt` (caught early by the
 * script in layout.tsx and kept on window), which lets us show our own Install button.
 * iPhone/iPad Safari has no prompt, so we show the Share → Add to Home Screen steps.
 */

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallWindow = Window & { __chronosInstall?: PromptEvent | null };

/** Runs in <head>: keeps the install prompt for later instead of Chrome's own banner. */
export const INSTALL_BOOT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__chronosInstall=e;window.dispatchEvent(new Event("chronos-install"))});window.addEventListener("appinstalled",function(){window.__chronosInstall=null;window.dispatchEvent(new Event("chronos-install"))});`;

export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
  // The page has usually finished loading by the time React runs this.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function useInstall() {
  const [state, setState] = useState({ canPrompt: false, ios: false, installed: false });

  useEffect(() => {
    const w = window as InstallWindow;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const safari = ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const update = () => setState({ canPrompt: !!w.__chronosInstall, ios: safari && !standalone, installed: standalone });
    update();
    window.addEventListener("chronos-install", update);
    return () => window.removeEventListener("chronos-install", update);
  }, []);

  const prompt = async () => {
    const w = window as InstallWindow;
    const e = w.__chronosInstall;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    w.__chronosInstall = null;
    window.dispatchEvent(new Event("chronos-install"));
    return outcome === "accepted";
  };

  return { ...state, available: !state.installed && (state.canPrompt || state.ios), prompt };
}
