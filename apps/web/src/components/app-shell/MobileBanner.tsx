// OWNER: t9a (wave 2). Brand-gaps §G "Dashboard on a phone": below 768px the
// shell states its own limitation instead of degrading silently. Rendered by
// the layout whenever the viewport is narrow (a CSS media query, not JS, so it
// is correct on first paint and under SSR); the layout also drops the palette
// and the keyboard chords at that width (useGlobalShortcuts' `enabled` prop),
// matching the copy here.
export const MOBILE_BANNER_TEXT = "PRGuard's dashboard is built for a keyboard and a wide screen. This is a read-only view.";

export function MobileBanner() {
  return (
    <div className="hidden min-h-8 items-center border-b border-marker bg-marker-tint px-4 py-1.5 max-[767px]:flex" data-mobile-banner="">
      <p className="type-data text-marker-text">{MOBILE_BANNER_TEXT}</p>
    </div>
  );
}
