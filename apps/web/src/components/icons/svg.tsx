// OWNER: t1c (wave 1). The shared renderers for every icon PR Guard draws itself.
//
// Two families, one hand (docs/design/02-design-system.md §6):
//
//   MarkSvg   — pictograms on a fixed artboard: the four mechanic marks, the nine
//               station glyphs and the chip glyphs. Each drawing is authored on a
//               16px grid (1.25px stroke) and a 24px grid (1.5px stroke), and the
//               glyphs that live inside 20px chips also on a hinted 12px grid (1px
//               stroke). Integer coordinates, stroke centres on the half pixel, free
//               stroke ends on whole pixels, butt caps, miter joins, fill none,
//               stroke currentColor. `vector-effect: non-scaling-stroke` on every
//               shape, so a 16px drawing shown at 14px keeps its 1.25px stroke.
//
//   GlyphSvg  — text glyphs Google Sans Code does not have (↻ ▶ ✓ ✗ Σ ⋯ ‖ ⚠). They
//               are TYPE, not icons: one monospace cell wide (0.6em, the GSC advance)
//               and 1em tall, sitting on the text baseline via vertical-align
//               -0.125em, so a column of mono data keeps its alignment. Their stroke
//               scales with the text (0.0875em, measured from GSC's own stems) instead
//               of being fixed, because a 48px readout needs a 48px-weight glyph.
import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

/** §6.3 — the only sizes an icon renders at. */
export const ICON_SIZES = [12, 14, 16, 20, 24] as const;
export type IconSize = (typeof ICON_SIZES)[number];
/** §6.3 names: icon-xs … icon-xl. */
export const ICON_SIZE_NAMES = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 } as const;
export type IconSizeName = keyof typeof ICON_SIZE_NAMES;

export function iconPx(size: IconSize | IconSizeName): IconSize {
  return typeof size === "number" ? size : ICON_SIZE_NAMES[size];
}

/** Artboards and the stroke width authored on each (§6.4 rule 2; 12 is the chip hint). */
export const ARTBOARD_STROKE = { 12: 1, 16: 1.25, 24: 1.5 } as const;
export type Artboard = keyof typeof ARTBOARD_STROKE;

/** One drawing per artboard. 16 and 24 are mandatory; 12 exists only where a chip needs it. */
export type Art = { 12?: ReactNode; 16: ReactNode; 24: ReactNode };

/** Which artboard serves a rendered size: the hinted 12 when it exists, else 16 up to 16px, else 24. */
export function artboardFor(size: number, art: Pick<Art, 12>): Artboard {
  if (size <= 12 && art[12] !== undefined) return 12;
  return size <= 16 ? 16 : 24;
}

type A11y = {
  /** Accessible name. Omit for decorative use (the default): the SVG is then aria-hidden. */
  title?: string;
};

export type MarkSvgProps = Omit<SVGProps<SVGSVGElement>, "children" | "width" | "height" | "viewBox" | "ref"> &
  A11y & {
    size?: IconSize | IconSizeName;
    art: Art;
    /** Stable name for tests and the lab sheet, e.g. "vial-filled". */
    glyph: string;
  };

/** Renders one hand-drawn pictogram at a size from the §6.3 scale. */
export function MarkSvg({ size = 16, art, glyph, title, className, ...rest }: MarkSvgProps) {
  const px = iconPx(size);
  const board = artboardFor(px, art);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${board} ${board}`}
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={ARTBOARD_STROKE[board]}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit={4}
      focusable="false"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      data-glyph={glyph}
      data-artboard={board}
      className={cn("inline-block shrink-0 align-[-0.125em] [&_*]:[vector-effect:non-scaling-stroke]", className)}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {art[board]}
    </svg>
  );
}

/** The inline glyph cell: 12 × 20 units = 0.6em × 1em. Baseline sits at y 17.5. */
export const GLYPH_CELL = { width: 12, height: 20, baseline: 17.5, capTop: 3.18, capMid: 10.35, mathAxis: 11.2 } as const;
/** 0.0875em: Google Sans Code's own stems measure 0.085–0.096em at wght 400. */
export const GLYPH_STROKE = 1.75;

export type GlyphSvgProps = Omit<SVGProps<SVGSVGElement>, "children" | "width" | "height" | "viewBox" | "ref"> &
  A11y & {
    /** The Unicode character this glyph stands in for. */
    char: string;
    /**
     * Keep `char` in the text (visually hidden) so copy-paste and screen readers get the
     * real character, e.g. the ‖ in `sha256(prev_hash ‖ canonical_json)`. Off for glyphs
     * that decorate a label that already says the thing (▶ PLAY).
     */
    speak: boolean;
    glyph: string;
    children: ReactNode;
  };

/** Renders one text glyph at the surrounding font size, one mono cell wide. */
export function GlyphSvg({ char, speak, glyph, title, className, children, ...rest }: GlyphSvgProps) {
  const svg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${GLYPH_CELL.width} ${GLYPH_CELL.height}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STROKE}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit={4}
      focusable="false"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      data-glyph={glyph}
      className={cn("inline-block h-[1em] w-[0.6em] shrink-0 align-[-0.125em]", className)}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
  if (!speak || title) return svg;
  // The inline `relative` wrapper is the containing block for the visually hidden
  // character. Without it the absolutely positioned span resolves against the nearest
  // positioned ancestor, which can sit outside a horizontal scroller, and a glyph deep
  // in a scrolled table would widen the whole page.
  return (
    <span data-slot="glyph" className="relative">
      {svg}
      <span className="sr-only">{char}</span>
    </span>
  );
}
