// OWNER: t9a (wave 3). Stub from T0 — replace entirely.
// Keep data-surface="app" on the outermost wrapper: it switches the dashboard
// token overrides in app/tokens/core.css (0.018 graticule, no grain, nothing
// above 180ms, 13px body). Keep the <main> landmark here; route pages render
// their content straight into it. GSAP may not be imported anywhere under
// app/(app)/ — ESLint enforces it.
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="app" className="min-h-dvh">
      <main id="main">{children}</main>
    </div>
  );
}
