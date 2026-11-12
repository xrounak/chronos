import { FESTIVAL } from "@/lib/festival";
import { getFestival, MAIN_SITE, SITE_URL, type ShowDay } from "@/lib/events";
import { World } from "@/components/game/World";

/** Re-read the programme from sic.gecp.in every five minutes. */
export const revalidate = 300;

/**
 * Structured data for search engines: the festival with every event as a sub-event (so
 * Google can show dates, place and free entry in results), plus who runs it and the site.
 */
function festivalLd(days: ShowDay[]) {
  const organizer = { "@type": "Organization", name: FESTIVAL.organiser, url: MAIN_SITE };
  // Entry is free; registration happens on sic.gecp.in
  const offers = (url: string) => ({
    "@type": "Offer",
    price: 0,
    priceCurrency: "INR",
    availability: "https://schema.org/InStock",
    url,
    validFrom: "2026-11-01T00:00:00+05:30",
  });
  const place = {
    "@type": "Place",
    name: "Government Engineering College, Palamu",
    address: { "@type": "PostalAddress", addressLocality: "Palamu", addressRegion: "Jharkhand", addressCountry: "IN" },
  };
  return {
    "@context": "https://schema.org",
    "@type": "Festival",
    name: `CHRONOS ${FESTIVAL.year}`,
    description: "Three days of exhibitions, a hackathon and robotics competitions at GEC Palamu.",
    url: SITE_URL,
    image: `${SITE_URL}/opengraph-image`,
    startDate: FESTIVAL.startsAt,
    endDate: FESTIVAL.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    organizer,
    offers: offers(SITE_URL),
    inLanguage: "en-IN",
    keywords: "Chronos 2026, GEC Palamu, tech fest, hackathon, robotics, Jharkhand",
    subEvent: days.flatMap((d) =>
      d.events.map((e) => ({
        "@type": "Event",
        name: `${e.name} · CHRONOS ${FESTIVAL.year}`,
        description: `${e.name} at ${e.venue}, GEC Palamu, on Day ${d.number} (${d.title}) of CHRONOS ${FESTIVAL.year}.`,
        startDate: e.startsAt ?? `${d.isoDate}T09:00:00+05:30`,
        endDate: `${d.isoDate}T18:00:00+05:30`,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { ...place, name: `${e.venue}, GEC Palamu` },
        image: `${SITE_URL}/opengraph-image`,
        organizer,
        offers: offers(e.registerUrl ?? SITE_URL),
        url: e.registerUrl ?? SITE_URL,
      })),
    ),
  };
}

const siteLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: FESTIVAL.organiser,
    alternateName: "SIC GEC Palamu",
    url: MAIN_SITE,
    logo: `${SITE_URL}/icons/icon-512.png`,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: `CHRONOS ${FESTIVAL.year}`,
    url: SITE_URL,
    inLanguage: "en-IN",
    publisher: { "@type": "Organization", name: FESTIVAL.organiser, url: MAIN_SITE },
  },
];

/** The 3D island. The same programme as plain text sits underneath for search engines and screen readers. */
export default async function ChronosGame() {
  const days = await getFestival();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(festivalLd(days)).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd).replace(/</g, "\\u003c") }} />
      <World days={days} />
      <section className="sr-only" aria-label="Programme">
        <p>
          {FESTIVAL.name} {FESTIVAL.year}: {FESTIVAL.tagline} {FESTIVAL.dates}, {FESTIVAL.place}. Organised by {FESTIVAL.organiser}.
        </p>
        {days.map((d) => (
          <div key={d.number}>
            <h2>
              Day {d.number}: {d.title}, {d.date}
            </h2>
            <p>{d.body}</p>
            <ul>
              {d.events.map((e) => (
                <li key={e.name}>
                  {e.name}, {e.venue}. {e.registerUrl ? <a href={e.registerUrl}>Register for {e.name}</a> : "Registration opens soon."}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <a href="/lite">Read the story version</a>
      </section>
    </>
  );
}
