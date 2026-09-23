// OWNER: t8a (wave 3). Stub from T0 — replace entirely.
// Keep data-surface="marketing" on the outermost wrapper (app/tokens/marketing.css
// scopes every marketing-only token to it) and keep the <main> landmark here:
// the frozen page.tsx renders its nine sections straight into it.
import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="marketing" className="min-h-dvh">
      <main id="main">{children}</main>
    </div>
  );
}
