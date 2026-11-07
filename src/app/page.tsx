import { FESTIVAL } from "@/lib/festival";
import { getFestival, MAIN_SITE, SITE_URL, type ShowDay } from "@/lib/events";
import { World } from "@/components/game/World";

/** Re-read the programme from sic.gecp.in every five minutes. */
export const revalidate = 300;

function festivalLd(days: ShowDay[]) {
  const place = {
    "@type": "Place",
    name: "Government Engineering College, Palamu",
    address: { "@type": "PostalAddress", addressLocality: "Palamu", addressRegion: "Jharkhand", addressCountry: "IN" },
  };
  return {
    "@context": "https://schema.org",
    "@type": "Festival",
    name: `CHRONOS ${FESTIVAL.year}`,
    description: "Three days of expert talks, exhibitions, a hackathon and robotics competitions at GEC Palamu.",
    url: SITE_URL,
    image: `${SITE_URL}/opengraph-image`,
    startDate: FESTIVAL.startsAt,
    endDate: FESTIVAL.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    organizer: { "@type": "Organization", name: FESTIVAL.organiser, url: MAIN_SITE },
    subEvent: days.flatMap((d) =>
      d.events.map((e) => ({
        "@type": "Event",
        name: e.name,
        startDate: e.startsAt ?? d.isoDate,
        location: { ...place, name: `${e.venue}, GEC Palamu` },
        url: e.registerUrl ?? SITE_URL,
      })),
    ),
  };
}

/** The 3D island. The same programme as plain text sits underneath for search engines and screen readers. */
export default async function ChronosGame() {
  const days = await getFestival();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(festivalLd(days)).replace(/</g, "\\u003c") }} />
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
