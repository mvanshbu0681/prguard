// OWNER: t6 (wave 2). The rail row's actor glyph (dashboard-blueprint §3c row anatomy:
// "actor with a distinct glyph … glyph, never colour alone"). @/components/icons (t1c,
// wave 1) ships no actor-type glyph — the four mechanic marks, the nine station glyphs
// and the chip glyphs are all a different vocabulary — so this is a local, minimal
// addition, on the same hand (12px artboard, stroke currentColor,
// vector-effect: non-scaling-stroke, decorative unless given a title). Three shapes so
// the state never rides on colour alone, mirroring the mockup's ⬢ human / ▣ ai / ◇ system:
//   human   hexagon outline — a person is the one irregular (6-sided) shape
//   ai      filled square — the one solid mark, for the one non-human, non-infrastructure actor
//   system  diamond outline — a rotated square, the coldest, most mechanical shape
import type { ActorType } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface ActorGlyphProps {
  actor: ActorType;
  className?: string;
}

const SHARED = {
  xmlns: "http://www.w3.org/2000/svg" as const,
  viewBox: "0 0 12 12",
  width: 12,
  height: 12,
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1,
  focusable: "false" as const,
  "aria-hidden": true as const,
};

export function ActorGlyph({ actor, className }: ActorGlyphProps) {
  const cls = cn("inline-block shrink-0 align-[-0.125em] [&_*]:[vector-effect:non-scaling-stroke]", className);
  if (actor === "human") {
    return (
      <svg {...SHARED} data-glyph="actor-human" className={cls}>
        <path d="M6 1L10.5 3.5V8.5L6 11L1.5 8.5V3.5Z" />
      </svg>
    );
  }
  if (actor === "ai") {
    return (
      <svg {...SHARED} data-glyph="actor-ai" className={cls}>
        <rect x={2.5} y={2.5} width={7} height={7} fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...SHARED} data-glyph="actor-system" className={cls}>
      <path d="M6 1L11 6L6 11L1 6Z" />
    </svg>
  );
}
