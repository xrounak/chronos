/**
 * Everything Chronos says, in one place. Change copy, dates or the programme here.
 * Events listed in `program` are matched to real events on sic.gecp.in (tagged
 * "Chronos 2026" there) to get their registration link; see lib/events.ts.
 */

export const FESTIVAL = {
  name: "CHRONOS",
  year: 2026,
  tagline: "Earned, Never Given.",
  dates: "11 — 13 December 2026",
  place: "GEC Palamu",
  /** First gate opens: 11 Dec 2026, 9:00 IST. */
  startsAt: "2026-12-11T09:00:00+05:30",
  endsAt: "2026-12-13T18:00:00+05:30",
  organiser: "Science & Innovation Club, GEC Palamu",
};

export type ProgramItem = {
  name: string;
  venue: string;
  kind: "talk" | "exhibition" | "competition" | "hackathon" | "experience";
  /** Words that identify the matching event on sic.gecp.in (compared case-insensitively). */
  match: string[];
  /** Photo in public/photos, shown beside the event. */
  photo?: string;
  /** What the 3D island builds at this event (a pitch, a water tank...); the name can change freely. */
  prop?: string;
};

export type Day = {
  number: string;
  date: string;
  /** yyyy-mm-dd in India time, to place events from the database on the right day. */
  isoDate: string;
  title: string;
  line: string;
  body: string;
  closer: string;
  program: ProgramItem[];
};

export const DAYS: Day[] = [
  {
    number: "01",
    date: "11 December 2026 · Friday",
    isoDate: "2026-12-11",
    title: "The Awakening",
    line: "Where ideas find their stage.",
    body: "The gates open. New perspectives emerge. The first sparks of inspiration turn into conversations, discoveries and possibilities.",
    closer: "The beginning of something bigger.",
    program: [
      { name: "Expert Talks & Inauguration", venue: "Auditorium", kind: "talk", match: ["expert talk", "inauguration"], photo: "speaker.webp" },
      { name: "Exhibition", venue: "Parking Lot", kind: "exhibition", match: ["exhibition"], photo: "exhibit-towers.webp" },
      { name: "Elytra Kick", venue: "Ground", kind: "competition", match: ["elytra kick", "robo soccer", "robosoccer"], photo: "robo-soccer.webp", prop: "robo soccer" },
      // runs across all three days: film the festival, submit one reel within a week
      { name: "Spectator Mode", venue: "Across the campus", kind: "competition", match: ["spectator mode", "reel"], prop: "reel contest" },
    ],
  },
  {
    number: "02",
    date: "12 December 2026 · Saturday",
    isoDate: "2026-12-12",
    title: "The Challenge",
    line: "Where imagination meets execution.",
    body: "This is where ideas are put to the test. Teams compete, technology comes alive and boundaries are challenged.",
    closer: "Think fast. Build smart. Push further.",
    program: [
      { name: "Trial Chambers", venue: "Seminar Hall 1", kind: "hackathon", match: ["trial chambers", "hackathon"], photo: "hackathon.webp", prop: "hackathon" },
      { name: "Fighter Jet Simulation Exhibition", venue: "With an Army officer", kind: "experience", match: ["fighter jet", "jet simulation"] },
      { name: "Pillager's Parkour", venue: "Ground", kind: "competition", match: ["pillager", "hurdle"], prop: "hurdle race" },
    ],
  },
  {
    number: "03",
    date: "13 December 2026 · Sunday",
    isoDate: "2026-12-13",
    title: "The Legacy",
    line: "Where effort becomes a memory.",
    body: "The final chapter isn't an ending. It's proof of what happens when people dare to build beyond limits.",
    closer: "Three days of ambition. One final call to make it count.",
    program: [
      { name: "Creative Mode", venue: "1st Floor Open Area", kind: "exhibition", match: ["creative mode", "build beyond limits"], photo: "farm-rover.webp", prop: "build beyond limits" },
      { name: "Marine Rush", venue: "Ground", kind: "competition", match: ["marine rush", "boat race"], photo: "boat-race.webp", prop: "boat race" },
      { name: "Nether Clash", venue: "Ground", kind: "competition", match: ["nether clash", "robo war", "robowar"], photo: "robo-war.webp", prop: "robo war" },
    ],
  },
];

/** The story, chapter by chapter. Each paragraph is revealed line by line on scroll. */
export const CHAPTERS = {
  prologue: {
    label: "Prologue",
    title: "Before the celebration",
    lead: "Nothing extraordinary begins extraordinary.",
    paragraphs: [
      "It begins with an idea. A question. A challenge that refuses to leave the mind.",
      "Somewhere, someone starts building. Someone experiments. Someone fails. Someone tries again.",
      "Because progress has never been about getting things right the first time.",
    ],
    closer: "It has always been about refusing to stop.",
  },
  grind: {
    label: "Chapter I",
    title: "The Grind",
    lead: "Behind every creation is a process nobody sees.",
    paragraphs: [
      "The hours spent learning. The machines that refuse to work. The designs that need rebuilding. The countless attempts that lead to one breakthrough.",
      "We believe innovation deserves more than recognition.",
    ],
    closer: "It deserves a celebration.",
  },
  arrival: {
    label: "Chapter II",
    title: "The Arrival",
    lead: "And then, the moment arrives.",
    paragraphs: [
      "The ideas leave the notebooks. The projects leave the workshops. The builders leave their corners.",
      "Different disciplines. Different perspectives. One common ground.",
      "Three days dedicated to curiosity, competition, creativity and the spirit of engineering.",
    ],
    closer: "Welcome to CHRONOS.",
  },
  epilogue: {
    label: "Epilogue",
    title: "Your chapter begins here.",
    paragraphs: [
      "You have seen the story. Now become a part of it.",
      "Whether you build, compete, explore, experiment, or simply want to witness what happens when innovation meets ambition, there is a place for you here.",
    ],
    closer: "The clock is ticking.",
  },
};

export const FINAL_FRAME = ["Time doesn't build legacies.", "People do."];
