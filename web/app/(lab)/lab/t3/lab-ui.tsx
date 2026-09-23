// OWNER: T3 (wave 1). Presentational pieces for /lab/t3. No hooks and no "use client",
// so the server page and the client demos can both render them. Lab-only chrome: the
// product's buttons and chips are track t1b's and t1c's; the lab imports neither (T3
// imports nothing from T1 or T2).
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function LabSection({ id, index, title, note, children }: { id: string; index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-t border-rule-1 py-10">
      <h2 id={`${id}-title`} className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <div className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A lab control: ghost, 2px radius, colour-only hover on --dur-1 / --ease-snap. */
export function LabButton({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-data border border-rule-2 bg-transparent px-3 type-label text-text-body transition-colors duration-(--dur-1) ease-snap hover:border-rule-3 hover:bg-ink-3 hover:text-text-primary aria-pressed:border-rule-3 aria-pressed:bg-ink-4 aria-pressed:text-text-primary disabled:cursor-not-allowed disabled:text-text-disabled ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-data border border-rule-2 bg-ink-2 px-1 type-chip text-text-primary">{children}</kbd>;
}

/** Label / value pairs in the data face, wrapping at narrow widths. */
export function Readouts({ items, className = "" }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={`flex flex-wrap gap-x-6 gap-y-2 type-data ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 items-baseline gap-2">
          <dt className="text-text-dim">{item.label}</dt>
          <dd className="min-w-0 text-text-primary [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The instrument frame the demos sit in: one ink rung, a hairline, the milled top edge. */
export function Frame({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-panel border border-rule-1 bg-ink-1 inset-shadow-hi ${className}`}>{children}</div>;
}

/** ms as a whole number with its unit, tabular. */
export function ms(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)}ms`;
}
