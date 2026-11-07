/**
 * Shared scroll state between the scroll controller (Experience) and the 3D scene.
 * `s` runs from 0 to the last chapter: the whole part is the chapter on screen, the
 * fraction is how far through it the visitor has scrolled.
 */
export const CHAPTER_IDS = ["opening", "prologue", "grind", "arrival", "days", "epilogue", "final"] as const;
export const CHAPTER_LABELS = ["Opening", "Prologue", "The Grind", "The Arrival", "Three Days", "Your Chapter", "Final Frame"];

type Listener = (chapter: number) => void;

export const story = {
  s: 0,
  chapter: 0,
  listeners: new Set<Listener>(),
  /** Smooth scroll to an element or selector; set by Experience once Lenis runs. */
  scrollTo: null as null | ((target: string | HTMLElement) => void),
  setChapter(i: number) {
    if (i === this.chapter) return;
    this.chapter = i;
    this.listeners.forEach((l) => l(i));
  },
  onChapter(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  },
};
