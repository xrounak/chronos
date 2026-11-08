"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "./install";

/** Registers the service worker that makes Chronos installable (production only). */
export function AppSetup() {
  useEffect(() => registerServiceWorker(), []);
  return null;
}
