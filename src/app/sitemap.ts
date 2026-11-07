import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/events";

/** Chronos is one page; its events live (and are listed) on sic.gecp.in. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, lastModified: "2026-11-07", changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/lite`, lastModified: "2026-11-07", changeFrequency: "weekly", priority: 0.8 },
  ];
}
