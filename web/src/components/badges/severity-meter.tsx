"use client";
// OWNER: t1c (wave 1). SeverityMeter — severity as a reading, not a badge
// (docs/design/02-design-system.md §1.6, §5.4 "Severity — NOT a badge", R3).
//
//   density "inline"  0.810 ▮▮▮▮▮ CRITICAL   the reading, set in a line of mono text
//   density "glyph"   ▮▮▮▮▮ C                 58 × 10px for dense rows; the score is in its name
//
// Three cues, in order: the FILL COUNT (band rank: info 1 … critical 5), the printed score
// (always 3 decimals), and — third, redundant — the band colour on the filled segments.
// Measured: medium vs high is ΔE 3.3 under protanopia, and the ramp's luminance rises then
// falls, so colour alone cannot carry a band.
//
// §5.4 type: the score in readout mono (500, tabular, --text-primary), the band label in 11px
// mono caps --text-dim. The glyph's band letter is --text-body because there it stands in for
// the missing score; it is never the band colour, since --sev-critical is --alarm and --alarm
// is fill-only (R2).
//
// This is the five-segment band meter. The six-segment weighted contribution bar is
// <ContributionBar> (track T5), a different component.
import type { ComponentProps } from "react";
import type { SeverityBand } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { BAND_LETTER, SEVERITY_BANDS, bandRank, chipLabel, formatScore } from "./format";
import { SEVERITY_FILL, STAMP_CLASS } from "./spec";
import { useStamp } from "./use-stamp";

/**
 * Segment geometry, whole pixels only: 4 × 9px inline (9px is the cap height of 12.5px data
 * text, and §5.4's 3px is a floor), 10 × 10px in the glyph (58 × 10 for five). Gap 2px.
 */
const SEGMENT = { inline: "h-[9px] w-[4px]", glyph: "size-[10px]" } as const;

// Forced colors paints every background as Canvas, which would erase the fill count — the
// one cue that must survive. Filled segments become solid CanvasText, empty ones an outline.
const FILLED_FORCED = "forced-colors:bg-[CanvasText]";
const EMPTY = "bg-ink-5 forced-colors:border forced-colors:border-[CanvasText] forced-colors:bg-transparent";

export type SeverityMeterProps = Omit<ComponentProps<"span">, "children"> & {
  /** The finding's severity.score (0..1). Printed as received, to 3 decimals. */
  score: number;
  /** The finding's severity.band — this, not the score, sets the fill count. */
  band: SeverityBand;
  density?: "inline" | "glyph";
};

export function SeverityMeter({ score, band, density = "inline", className, ...rest }: SeverityMeterProps) {
  const rank = bandRank(band);
  const reading = formatScore(score);
  const stamps = useStamp(band);
  return (
    <span
      key={stamps}
      role="img"
      aria-label={`severity ${reading}, ${band}`}
      title={density === "glyph" ? `${reading} · ${band}` : undefined}
      data-slot="severity-meter"
      data-band={band}
      data-density={density}
      data-fill={rank}
      className={cn(
        "inline-flex whitespace-nowrap transition-none",
        density === "inline" ? "items-baseline gap-2" : "items-center gap-1",
        stamps > 0 && STAMP_CLASS,
        className,
      )}
      {...rest}
    >
      {density === "inline" ? (
        <span data-slot="severity-score" className="font-mono font-medium text-text-primary tabular-nums">
          {reading}
        </span>
      ) : null}
      <span className="inline-flex gap-[2px]">
        {SEVERITY_BANDS.map((b, i) => {
          const filled = i < rank;
          return (
            <span
              key={b}
              data-segment={filled ? "filled" : "empty"}
              className={cn(
                "inline-block shrink-0 forced-color-adjust-none",
                SEGMENT[density],
                filled ? [SEVERITY_FILL[band], FILLED_FORCED] : EMPTY,
              )}
            />
          );
        })}
      </span>
      {/* -me cancels the label's trailing +0.12em, so the meter's box ends at the last letter */}
      <span data-slot="severity-band" className={cn("type-label -me-[0.12em]", density === "inline" ? "text-text-dim" : "text-text-body")}>
        {density === "inline" ? chipLabel(band) : BAND_LETTER[band]}
      </span>
    </span>
  );
}
