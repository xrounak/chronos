"use client";

import { useEffect, useRef } from "react";
import { CHAPTER_IDS, story } from "@/lib/story";
import { cue } from "./sound";

/** How strong the light leaks are in each chapter (warmest at the festival). */
const LEAK = [0.5, 0.35, 0.25, 0.6, 0.75, 0.55, 0.85];

/**
 * The film projector: smooth scrolling (Lenis), the GSAP scroll timeline that reveals
 * text, pins the three days sideways and tells the 3D scene which chapter is on
 * screen, plus the fixed backdrop layers. Renders only the backdrop; all text is
 * server-rendered in page.tsx so search engines and screen readers get it.
 */
export function Experience() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      // The particle scene loads on its own so text is never waiting for three.js.
      if (canvas.current) {
        import("./scene")
          .then(({ startScene }) => {
            if (!cancelled && canvas.current) cleanups.push(startScene(canvas.current, { reducedMotion: reduced }));
          })
          .catch(() => {});
      }

      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      if (!reduced) {
        const Lenis = (await import("lenis")).default;
        if (cancelled) return;
        const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
        lenis.on("scroll", ScrollTrigger.update);
        const tick = (t: number) => lenis.raf(t * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        story.scrollTo = (target) => lenis.scrollTo(target, { duration: 1.6 });
        cleanups.push(() => {
          gsap.ticker.remove(tick);
          lenis.destroy();
        });
      }

      const ctx = gsap.context(() => {
        if (!reduced) {
          // Words rise out of their masks: the hero on load, everything else on scroll.
          document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
            const words = el.querySelectorAll(".rw > span");
            const onLoad = el.dataset.reveal === "load";
            gsap.fromTo(
              words,
              // y: 0 cancels the CSS pre-hide offset, which GSAP would otherwise keep as pixels.
              { yPercent: 110, y: 0 },
              {
                yPercent: 0,
                y: 0,
                duration: onLoad ? 1.4 : 1.1,
                ease: "expo.out",
                stagger: onLoad ? 0.07 : 0.028,
                delay: onLoad ? 0.25 : 0,
                scrollTrigger: onLoad ? undefined : { trigger: el, start: "top 88%" },
              },
            );
          });

          // Scrapbook pieces land on the page: a little too big and twisted, then pressed flat.
          document.querySelectorAll<HTMLElement>("[data-piece]").forEach((el, n) => {
            gsap.from(el, {
              opacity: 0,
              scale: 1.35,
              rotation: (n % 2 ? 1 : -1) * (10 + (n % 4) * 4),
              y: -50,
              duration: 0.9,
              ease: "back.out(1.7)",
              delay: (n % 3) * 0.08,
              scrollTrigger: { trigger: el, start: "top 95%" },
            });
          });

          // Big chapter numbers drift slower than the text: depth without 3D models.
          document.querySelectorAll<HTMLElement>("[data-speed]").forEach((el) => {
            gsap.to(el, {
              yPercent: -Number(el.dataset.speed) * 100,
              ease: "none",
              scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
            });
          });

          // Three days travel sideways on wide screens.
          const mm = gsap.matchMedia();
          mm.add("(min-width: 900px)", () => {
            const pin = document.querySelector<HTMLElement>(".days-pin");
            const track = document.querySelector<HTMLElement>(".days-track");
            if (!pin || !track) return;
            const distance = () => track.scrollWidth - window.innerWidth;
            gsap.to(track, {
              x: () => -distance(),
              ease: "none",
              scrollTrigger: { trigger: pin, pin: true, scrub: 1, end: () => `+=${distance()}`, invalidateOnRefresh: true },
            });
          });
        }

        // Which chapter is on screen, and how far through it: drives the 3D scene.
        CHAPTER_IDS.forEach((id, i) => {
          const el = document.getElementById(id);
          if (!el) return;
          ScrollTrigger.create({
            trigger: el,
            start: "top 60%",
            end: "bottom 60%",
            onUpdate: (self) => {
              story.s = i + self.progress;
            },
            onToggle: (self) => {
              if (!self.isActive) return;
              story.setChapter(i);
              html.style.setProperty("--leak", String(LEAK[i]));
              cue(id === "arrival" ? "drum" : id === "final" ? "boom" : id === "epilogue" ? "riser" : "whoosh");
            },
          });
        });
      });
      cleanups.push(() => ctx.revert());
      html.classList.add("motion-ready");
      ScrollTrigger.refresh();
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
      story.scrollTo = null;
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="scene-canvas" aria-hidden="true" />
      <div className="leaks" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </>
  );
}
