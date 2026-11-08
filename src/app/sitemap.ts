import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/events";

/** Chronos is one page; its events live (and are listed) on sic.gecp.in. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // the build date, so search engines see when the programme last changed
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/lite`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  ];
}
