// OWNER: t8a (wave 3). Design §3.4: a keyboard route straight to `<main id="main">`
// (set by app/(marketing)/layout.tsx), before the nav's own anchors. Visually
// hidden until focused — sr-only / focus:not-sr-only, not display:none, so it
// stays in the tab order. The 2px --signal-hi ring is the global
// :focus-visible rule (app/globals.css); nothing here needs to redeclare it.
export function SkipLink() {
  return (
    <a
      href="#main"
      className="type-label sr-only z-[100] rounded-data border border-rule-2 bg-ink-1 px-3 py-2 text-text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      Skip to content
    </a>
  );
}
