// OWNER: t5 (wave 2). Public surface of <ContributionBar> — see ContributionBar.tsx
// for the component itself and geometry.ts / ramp.ts for the pure logic behind it.
export { ContributionBar } from "./ContributionBar";
export type { ContributionBarProps } from "./ContributionBar";

export {
  bandForScore,
  bandRuleText,
  contributionPercent,
  contributionRows,
  explanationClauses,
  flooredSegmentWidthPx,
  phraseFor,
  promotedTick,
  rawSegmentWidthPx,
  readoutSnapMs,
  segmentSchedule,
  sumContributions,
  tickForBand,
  toSeverityValues,
  SEGMENT_MIN_PX,
  TICK_LABEL,
  TICKS,
} from "./geometry";
export type { ContributionRow, ExplanationClause, SegmentSchedule, SeverityInputName, SeverityValues, TickKey } from "./geometry";

export { BAND_FILL_CLASS, BAND_TEXT_CLASS, PROOF_CONFIDENCE_HATCH, segmentColor, segmentColorHover } from "./ramp";
