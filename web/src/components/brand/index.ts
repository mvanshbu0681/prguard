// OWNER: t1a (wave 1). The PRGuard brand: THE BENCH mark, the PRGUARD wordmark,
// the four lockups and the live-state favicon (docs/design/06-brand-gaps-and-corrections.md §A–§C).
//
// Quick reference for consumers:
//   Nav:        <a href="/"><Lockup variant="A" /></a>           mark 20 · hairline · PRGUARD 15px
//   Footer:     <Lockup variant="B" size="footer" />             adds the --signal-lo rail (never the nav)
//   404/print:  <Lockup variant="C" />                           stacked, mark 32 over PRGUARD 15px
//   Mark only:  <Mark size={24} title="PRGuard" />               size drives the ladder; decorative without title
//   Live tab:   useLiveFavicon(running ? 'running' : gate === 'failure' ? 'blocked' : gate ? 'clear' : null)
// The mark never animates in the nav, footer or a loading state; `live` is for the favicon.
// Renderers without CSS variables (OG card, canvas) use BRAND_HEX / FLAT_HEX, test-locked to the tokens.
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
