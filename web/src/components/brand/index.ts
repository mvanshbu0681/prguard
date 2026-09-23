// OWNER: t1a (wave 1). The PRGuard brand: THE BENCH mark, the PRGUARD wordmark,
// the four lockups and the live-state favicon (docs/design/06-brand-gaps-and-corrections.md §A–§C).
export { Mark, type MarkProps, type MarkTone } from './Mark';
export { Wordmark, type WordmarkProps } from './Wordmark';
export { Lockup, LOCKUP_SIZES, LOCKUP_STACKED, type LockupProps, type LockupSize, type LockupVariant } from './Lockup';
export {
  CIRCLE_BAR_WIDTH,
  MARK_LADDER,
  MARK_MIN,
  markClearSpace,
  markForm,
  markGeometry,
  markParts,
  scaleGeometry,
  type MarkCrop,
  type MarkForm,
  type MarkGeometry,
  type MarkLiveState,
  type MarkPart,
} from './geometry';
export { BRAND_HEX, FLAT_HEX, flattenWhite } from './palette';
export {
  createLiveFavicon,
  HEARTBEAT_PERIOD_MS,
  LIVE_FAVICON_SIZE,
  paintLiveFavicon,
  type LiveFaviconController,
  type LiveFaviconState,
} from './live-favicon';
export { useLiveFavicon } from './useLiveFavicon';
