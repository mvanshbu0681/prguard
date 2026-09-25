// OWNER: t1c (wave 1). The semantic chips: severity, proof, gate, finding status, stage
// and delivery mode (docs/design/02-design-system.md §1.6–§1.11, §5.4, §8.2).
//
//   <SeverityMeter score band density="inline" | "glyph" />   0.810 ▮▮▮▮▮ CRITICAL
//       score: severity.score (printed as received, 3 decimals) · band: severity.band (sets the
//       fill count, 1–5) · density: inline (in a line of text, default) | glyph (58×10, rows)
//   <ProofChip status caption? />                               PROVEN · DISPROVEN · …
//       status: proof.status (all six) · caption: true → the state's own (`refuted by
//       execution`), or any node
//   <GateChip conclusion />                                     ■ BLOCKED · — NEUTRAL · ○ CLEAR · ◉ RUNNING
//   <GateBlock conclusion blocking? delivery? reason? detail? announce? />
//       conclusion: gate.conclusion, or null while undecided · blocking: gate.blocking_finding_ids
//       .length · delivery: gate.delivery (right of the label) · reason: gate.reason (neutral)
//       · announce (default true): role="alert" on turning BLOCKED, role="status" otherwise
//   <StatusBadge status />                                      border style is the encoding
//   <StageDot state size? label? heartbeatMs? />                ○ ◉ ● ▲ ■  (8 | 10 | 12 px)
//   <DeliveryModeChip mode />                                   INLINE EXACT … NOT DELIVERED
//
// Every state carries a glyph, a border style or a fill count as well as its colour. No
// chip transitions its colour: a change re-mounts it with the class `stamp` (track t3's
// 180ms scale). The components are client components (the stamp has to see the previous
// value) and server-render like any other; the encodings in ./spec and the helpers in
// ./format are plain modules a server component can read. Every chip is the containing
// block of its own visually hidden prefix, so it can sit inside a horizontal scroller.
export { BAND_LETTER, NO_SCORE, SEVERITY_BANDS, bandForScore, bandRank, chipLabel, formatScore } from "./format";
export type { BandRank } from "./format";
export {
  CHIP_BASE,
  CHIP_LABEL,
  DELIVERY_MODE,
  FINDING_STATUS,
  GATE,
  PROOF_CHIP,
  SEVERITY_FILL,
  STAGE_DOT_COLOR,
  STAGE_DOT_SHAPE,
  STAGE_DOT_SIZES,
  STAMP_CLASS,
  gateDetail,
} from "./spec";
export type { GateDelivery, GateSpec, StageDotSize, StatusSpec } from "./spec";
export { useStamp } from "./use-stamp";

export { SeverityMeter } from "./severity-meter";
export type { SeverityMeterProps } from "./severity-meter";
export { ProofChip } from "./proof-chip";
export type { ProofChipProps } from "./proof-chip";
export { GateBlock, GateChip } from "./gate";
export type { GateBlockProps, GateChipProps, GateReading } from "./gate";
export { StatusBadge } from "./status-badge";
export type { StatusBadgeProps } from "./status-badge";
export { StageDot } from "./stage-dot";
export type { StageDotProps } from "./stage-dot";
export { DeliveryModeChip } from "./delivery-mode-chip";
export type { DeliveryModeChipProps } from "./delivery-mode-chip";
