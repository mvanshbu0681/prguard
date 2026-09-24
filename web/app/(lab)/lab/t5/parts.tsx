// OWNER: t5 (wave 2). Lab-only layout helpers for /lab/t5. Server components
// (same shape as t1c's specimens.tsx — Section index tags the region a section
// rule, Panel is one rung up the ink ladder with the milled inset, §3.6).
import type { ReactNode } from "react";

export function Section({ index, title, note, children }: { index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-1 pt-8 pb-12" aria-labelledby={`t5-${index}`}>
      <h2 id={`t5-${index}`} className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <div className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * A panel one rung up the ink ladder: hairline border, the milled inset highlight (§3.6).
 * `min-w-0`: as a CSS grid item (every use here sits in a `grid` wrapper), a block would
 * otherwise refuse to shrink below its widest descendant's content size — a 640px
 * ContributionBar table forcing the whole page wider at 375px is exactly that bug.
 */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative min-w-0 rounded-panel border border-rule-1 bg-ink-1 shadow-[inset_0_1px_0_var(--inset-hi)] ${className}`}>{children}</div>;
}
