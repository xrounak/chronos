/* eslint-disable @next/next/no-img-element -- decorative cut-outs; sized by CSS, lazy-loaded */
import type { CSSProperties, ReactNode } from "react";

/**
 * Scrapbook pieces (paper, tape, blueprints, stamps, sticky notes) pinned around a
 * chapter. Purely decorative: hidden from screen readers, never catch clicks. Each one
 * is slapped onto the page as it scrolls in and drifts at its own depth (Experience).
 */
export type PieceProps = {
  src: string;
  /** Width, e.g. "22vw" or "11rem". */
  w: string;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  /** Resting angle in degrees. */
  rot?: number;
  /** Parallax: 0 = moves with the page, 0.4 = noticeably slower. */
  depth?: number;
  z?: number;
  /** Hide below 768px wide, so phones stay readable. */
  desktopOnly?: boolean;
  /** Hide below 1280px wide: for pieces that would crowd the text on laptops. */
  wideOnly?: boolean;
  /** Handwritten note on top of the piece (sticky notes, paper strips). */
  note?: ReactNode;
  noteClassName?: string;
};

export function Piece({ src, w, top, left, right, bottom, rot = 0, depth = 0, z = 0, desktopOnly, wideOnly, note, noteClassName }: PieceProps) {
  const style = { width: w, top, left, right, bottom, zIndex: z, "--rot": `${rot}deg` } as CSSProperties;
  return (
    <div className={`piece ${desktopOnly ? "max-md:hidden" : ""} ${wideOnly ? "max-xl:hidden" : ""}`} style={style} data-piece data-speed={depth || undefined}>
      <div className="piece-inner">
        <img src={`/collage/${src}`} alt="" loading="lazy" decoding="async" draggable={false} />
        {note && <span className={`hand ${noteClassName ?? ""}`}>{note}</span>}
      </div>
    </div>
  );
}

export function Collage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`collage ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}

/**
 * A photo printed like a polaroid: white border, handwritten caption, a strip of tape
 * on top. Same placement and motion as Piece. Photos live in public/photos.
 */
export function Print({
  src,
  caption,
  tape = "tape-01.webp",
  ...piece
}: Omit<PieceProps, "src" | "note" | "noteClassName"> & { src: string; caption?: string; tape?: string }) {
  const { w, top, left, right, bottom, rot = 0, depth = 0, z = 0, desktopOnly, wideOnly } = piece;
  const style = { width: w, top, left, right, bottom, zIndex: z, "--rot": `${rot}deg` } as CSSProperties;
  return (
    <div className={`piece ${desktopOnly ? "max-md:hidden" : ""} ${wideOnly ? "max-xl:hidden" : ""}`} style={style} data-piece data-speed={depth || undefined}>
      <div className="piece-inner print">
        <img src={`/photos/${src}`} alt="" loading="lazy" decoding="async" draggable={false} className="print-photo" />
        {caption && <span className="print-caption">{caption}</span>}
        <img src={`/collage/${tape}`} alt="" loading="lazy" draggable={false} className="print-tape" />
      </div>
    </div>
  );
}
