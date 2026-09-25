// OWNER: t1d (wave 1). Shared vocabulary of the three code surfaces.
//
// Two kinds of colour ever reach a code surface, and they are typed apart so a
// fill-only token can never end up as text (design §1.5, R2):
//   TextTone  a TEXT token. `alarm` is --alarm-text (Lc −76.7), never --alarm.
//   RailTone  a 2px FILL. `alarm` is --alarm, which is exactly what a rail is.
import type { SeverityBand } from "@/lib/contracts";

/** Text tones → signal: --signal-text · alarm: --alarm-text · marker: --marker-text ·
 *  primary: --text-primary · body: --text-body · dim: --text-dim (non-body only). */
export type TextTone = "signal" | "alarm" | "marker" | "primary" | "body" | "dim";

export const TEXT_TONES = ["signal", "alarm", "marker", "primary", "body", "dim"] as const satisfies readonly TextTone[];

/** Rail tones (2px fills) → signal: --signal · signal-lo: --signal-lo · alarm: --alarm ·
 *  marker: --marker · critical/high/medium/low/info: --sev-*. A blocking finding's rail is
 *  `alarm` whatever its band (dashboard §4). */
export type RailTone = "signal" | "signal-lo" | "alarm" | "marker" | SeverityBand;

export const RAIL_TONES = [
  "signal",
  "signal-lo",
  "alarm",
  "marker",
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const satisfies readonly RailTone[];

/** A highlighted range of lines. `start`/`end` are absolute line numbers (the same numbers
 *  the gutter prints, so FindingLocation.start_line / end_line pass straight through). */
export interface LineHighlight {
  start: number;
  /** Inclusive. Defaults to `start`. */
  end?: number;
  tone: RailTone;
  /** Read to assistive technology (the rail itself is visual), e.g. "finding a91f3c2e". */
  label?: string;
}

/** True when `line` falls inside `h` (inclusive). */
export function inHighlight(h: LineHighlight, line: number): boolean {
  const end = h.end ?? h.start;
  return line >= Math.min(h.start, end) && line <= Math.max(h.start, end);
}

/** The first highlight covering `line` wins, so callers control precedence by order. */
export function highlightFor(highlights: readonly LineHighlight[] | undefined, line: number): LineHighlight | undefined {
  return highlights?.find((h) => inHighlight(h, line));
}

/** "41" or "40–41", for the screen-reader description of highlighted lines. */
export function describeRange(h: LineHighlight): string {
  const end = h.end ?? h.start;
  const lo = Math.min(h.start, end);
  const hi = Math.max(h.start, end);
  return lo === hi ? `line ${lo}` : `lines ${lo}–${hi}`;
}
