// OWNER: t6 (wave 2). Public surface of <ChainRail> (dashboard-blueprint §3c;
// landing-blueprint §07). See ChainRail.tsx for the full contract and the four guards.
export { ChainRail, type ChainRailComponentProps, type ChainRailOwnProps, type ChainRailSurface } from "./ChainRail";
export { ActorGlyph, type ActorGlyphProps } from "./actor-glyph";
export { formatAbsoluteUtc, formatRelativeDelta, hashShort } from "./format";
export { firstDifferingNibbleView, type NibbleDiff } from "./hash-diff";
export { useChainWindow, type ChainGuard, type ChainRowState, type LosslessAuditEvent, type UseChainWindowOptions, type UseChainWindowResult } from "./use-chain-window";
