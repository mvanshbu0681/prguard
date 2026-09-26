// OWNER: t10 (wave 2). /lab/t10 page-local layout, same shape as the other
// wave-1 lab pages' Section/Panel (t1c, t1d specimens.tsx) — not shared,
// because those files are frozen wave-1 chrome, not a public component.
import type { ReactNode } from "react";

export function Section({ index, title, note, children }: { index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-1 pt-8 pb-12" aria-labelledby={`t10-${index}`}>
      <h2 id={`t10-${index}`} className="type-label text-text-dim">
        {`/ ${index} — ${title}`}
      </h2>
      {note ? <div className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
