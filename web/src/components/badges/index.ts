// OWNER: t1c (wave 1). The semantic chips: severity, proof, gate, finding status, stage
// and delivery mode (docs/design/02-design-system.md §1.6–§1.11, §5.4, §8.2).
//
//   <SeverityMeter score band density="inline" | "glyph" />   0.810 ▮▮▮▮▮ CRITICAL
//   <ProofChip status caption? />                               PROVEN · DISPROVEN · …
//   <GateChip conclusion />  <GateBlock conclusion … />         BLOCKED · NEUTRAL · CLEAR · RUNNING
//   <StatusBadge status />                                      border style is the encoding
//   <StageDot state />                                          ○ ◉ ● ▲ ■
//   <DeliveryModeChip mode />                                   INLINE EXACT … NOT DELIVERED
//
// Every state carries a glyph, a border style or a fill count as well as its colour. No
// chip transitions its colour: a change re-mounts it with the class `stamp` (track t3's
// 180ms scale). The components are client components (the stamp has to see the previous
// value) and server-render like any other; the encodings in ./spec and the helpers in
// ./format are plain modules a server component can read.
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
