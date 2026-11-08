import type { MetadataRoute } from "next";

/** Makes Chronos installable: it opens full screen from the home screen like a game. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CHRONOS 2026 · Earned, Never Given",
    short_name: "Chronos",
    description: "Drive the 3D Chronos island and explore every event of the fest at GEC Palamu, 11–13 Dec 2026.",
    start_url: "/?source=app",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#07070a",
    theme_color: "#e2452b",
    categories: ["games", "education", "events"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Lite version", short_name: "Lite", url: "/lite?source=app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
