// The PR Guard brand: THE PR GUARD EYE mark, the PR GUARD wordmark, the four
// lockups and the live-state favicon.
//
// Quick reference for consumers:
//   Landing:    <TrackingMark size={26} />                        the eye follows the pointer; colour from the parent
//   Nav:        <a href="/"><Lockup variant="A" /></a>           mark 20 · hairline · PR GUARD 15px
//   Footer:     <Lockup variant="B" size="footer" />             adds the --signal-lo rail (never the nav)
//   404/print:  <Lockup variant="C" />                           stacked, mark 32 over PR GUARD 15px
//   Mark only:  <Mark size={24} title="PR Guard" />               decorative without title
//   Live tab:   useLiveFavicon(running ? 'running' : gate === 'failure' ? 'blocked' : gate ? 'clear' : null)
// Renderers without CSS variables (OG card, canvas) use BRAND_HEX / FLAT_HEX / PRGUARD_HEX, test-locked to the tokens.
export { Mark, type MarkProps, type MarkTone } from './Mark';
export { TrackingMark, type TrackingMarkProps } from './TrackingMark';
export { Wordmark, type WordmarkProps } from './Wordmark';
export { Lockup, LOCKUP_SIZES, LOCKUP_STACKED, type LockupProps, type LockupSize, type LockupVariant } from './Lockup';
export {
  circlePath,
  MARK_ARTBOARD,
  MARK_FILL,
  MARK_FORMS,
  MARK_INK,
  MARK_LID,
  MARK_LID_POINTS,
  MARK_MIN,
  MARK_PUPIL,
  MARK_PUPIL_TRAVEL,
  MARK_SMALL_BELOW,
  MARK_STROKE,
  markClearSpace,
  markForm,
  markGeometry,
  markParts,
  markViewBox,
  TILE_RADIUS,
  type MarkForm,
  type MarkFrame,
  type MarkGeometry,
  type MarkLiveState,
  type MarkPart,
} from './geometry';
export { BRAND_HEX, FLAT_HEX, PRGUARD_HEX, flattenWhite } from './palette';
export {
  createLiveFavicon,
  HEARTBEAT_PERIOD_MS,
  LIVE_FAVICON_SIZE,
  paintLiveFavicon,
  type LiveFaviconController,
  type LiveFaviconState,
} from './live-favicon';
export { useLiveFavicon } from './useLiveFavicon';
