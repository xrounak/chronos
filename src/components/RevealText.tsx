import { Fragment, type ElementType } from "react";

/**
 * Text split into words, each in a mask, so Experience can slide them up into view.
 * Server-rendered: the words are real text, and without motion they simply show.
 */
export function RevealText({
  text,
  as: Tag = "p",
  className,
  onLoad = false,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  /** Reveal as soon as the page loads (the hero) rather than on scroll. */
  onLoad?: boolean;
}) {
  const words = text.split(" ");
  return (
    <Tag className={className} data-reveal={onLoad ? "load" : "scroll"}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="rw">
            <span>{w}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}
