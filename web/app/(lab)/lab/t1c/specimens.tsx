// OWNER: t1c (wave 1). Lab-only specimen helpers for /lab/t1c. Server components.
import type { ReactNode } from "react";
import { ARTBOARD_STROKE, ICON_SIZES, type Art, type Artboard } from "@/components/icons";

export function Section({ index, title, note, children }: { index: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-rule-1 pt-8 pb-12" aria-labelledby={`t1c-${index}`}>
      <h2 id={`t1c-${index}`} className="type-label text-text-dim">
        / {index} — {title}
      </h2>
      {note ? <div className="mt-2 max-w-(--measure-body) type-small text-text-body">{note}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A panel on the ink ladder: one rung up, 1px hairline, the milled inset (§3.6). */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-panel border border-rule-1 bg-ink-1 shadow-[inset_0_1px_0_var(--inset-hi)] ${className}`}>{children}</div>
  );
}

/** Column heads for a size table: the §6.3 scale. */
export function SizeHeads({ first, extra = [] }: { first: string; extra?: string[] }) {
  return (
    <tr className="border-b border-rule-1">
      <th scope="col" className="py-2 pr-6 text-left type-label font-medium text-text-dim">
        {first}
      </th>
      {ICON_SIZES.map((s) => (
        <th key={s} scope="col" className="w-12 py-2 text-center type-label font-medium text-text-dim">
          {s}
        </th>
      ))}
      {extra.map((e) => (
        <th key={e} scope="col" className="py-2 pl-6 text-left type-label font-medium text-text-dim">
          {e}
        </th>
      ))}
    </tr>
  );
}

/** One row: a name, then the icon at every size on the scale. */
export function SizeRow({ name, render, extra }: { name: ReactNode; render: (size: (typeof ICON_SIZES)[number]) => ReactNode; extra?: ReactNode[] }) {
  return (
    <tr className="border-b border-rule-hair">
      <th scope="row" className="py-2 pr-6 text-left font-normal type-data whitespace-nowrap text-text-body">
        {name}
      </th>
      {ICON_SIZES.map((s) => (
        <td key={s} className="h-12 w-12 text-center align-middle text-text-primary">
          {render(s)}
        </td>
      ))}
      {extra?.map((e, i) => (
        <td key={i} className="py-2 pl-6 align-middle">
          {e}
        </td>
      ))}
    </tr>
  );
}

/**
 * The construction view: one artboard magnified, strokes drawn at their true width, over
 * its unit grid (every 4th line stronger). This is where "integer coordinates, strokes on
 * the half pixel" can be checked by eye.
 */
export function Construction({ art, board, cell }: { art: Art; board: Artboard; cell: number }) {
  const px = board * cell;
  const lines: ReactNode[] = [];
  for (let i = 1; i < board; i++) {
    const strong = i % 4 === 0;
    const stroke = strong ? "var(--rule-2)" : "var(--rule-hair)";
    lines.push(<line key={`v${i}`} x1={i} y1={0} x2={i} y2={board} stroke={stroke} strokeWidth={1 / cell} />);
    lines.push(<line key={`h${i}`} x1={0} y1={i} x2={board} y2={i} stroke={stroke} strokeWidth={1 / cell} />);
  }
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${board} ${board}`}
      aria-hidden
      className="block rounded-data border border-rule-1 bg-ink-0 text-text-body"
    >
      {lines}
      <g fill="none" stroke="currentColor" strokeWidth={ARTBOARD_STROKE[board]} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4}>
        {art[board]}
      </g>
    </svg>
  );
}

/** A labelled specimen cell used in the chip sheets. */
export function Specimen({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <div className="flex min-h-5 flex-wrap items-center gap-2">{children}</div>
      <p className="type-data text-text-dim [overflow-wrap:anywhere]">{caption}</p>
    </div>
  );
}
