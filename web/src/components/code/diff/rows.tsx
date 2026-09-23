// OWNER: t1d (wave 1). The diff's rows, gutter and annotation slot, shared by <PRGuardDiff>
// (every row in the DOM) and <DiffWindow> (only the rows near the view). No hooks.
import type { ReactNode, Ref } from "react";
import { inHighlight, type LineHighlight, type RailTone } from "../shared/types";
import type { DiffRow, SplitCell } from "./parse";

export type DiffSide = "old" | "new";

/** A highlighted range on one side. FindingLocation.side: LEFT → "old", RIGHT → "new".
 *  `tone` is the 2px rail; `fill` is the row fill at 10%, which replaces the diff tint
 *  (dashboard §4). For a finding: `fill` is its severity band, and `tone` is the same band,
 *  or `alarm` when the finding is blocking ("the rail is --alarm regardless of band"). */
export interface DiffHighlight extends LineHighlight {
  /** Default "new". */
  side?: DiffSide;
  /** Row fill tone, drawn at 10% alpha in place of the diff tint. Default: `tone`. */
  fill?: RailTone;
}

/** Content hung beneath a line: the inline finding card (T9) mounts here. */
export interface DiffAnnotation {
  /** Default "new". */
  side?: DiffSide;
  line: number;
  content: ReactNode;
  /** Optional 2px rail, usually the highlighted line's tone. */
  tone?: RailTone;
  /** Accessible name of the note, e.g. "finding a91f3c2e". */
  label?: string;
}

/** The line number `row` carries on `side`, or undefined when it has none there. */
export function lineOn(row: DiffRow, side: DiffSide): number | undefined {
  if (side === "new") return row.kind === "add" || row.kind === "context" ? row.newLine : undefined;
  return row.kind === "del" || row.kind === "context" ? row.oldLine : undefined;
}

export function highlightOf(row: DiffRow, highlights: readonly DiffHighlight[] | undefined, only?: DiffSide): DiffHighlight | undefined {
  return highlights?.find((h) => {
    const side = h.side ?? "new";
    if (only && side !== only) return false;
    const line = lineOn(row, side);
    return line !== undefined && inHighlight(h, line);
  });
}

export function annotationsAfter(row: DiffRow, annotations: readonly DiffAnnotation[] | undefined, only?: DiffSide): DiffAnnotation[] {
  if (!annotations?.length) return [];
  return annotations.filter((a) => {
    const side = a.side ?? "new";
    return (!only || side === only) && lineOn(row, side) === a.line;
  });
}

/** Number columns (two in unified view, one per side in split) + the 16px marker cell.
 *  Every row has the same gutter geometry; only add/del rows get a glyph (code.css). */
function Gutter({ numbers, silent }: { numbers: (number | undefined)[]; silent: boolean }) {
  return (
    <span className="prg-diff__gutter" aria-hidden={silent ? "true" : undefined}>
      {numbers.map((n, i) => (
        <span key={i} className="prg-diff__num" aria-hidden="true" data-n={n} />
      ))}
      <span className="prg-diff__marker" />
    </span>
  );
}

/** `@@ -32,11 +32,13 @@ def charge(…)`: the range is set as a label, the section heading
 *  stays code (code.css). Two spans, same characters: a copy still yields the line. */
function HunkText({ text }: { text: string }) {
  const close = text.indexOf("@@", 2);
  const cut = close === -1 ? text.length : close + 2;
  return (
    <>
      <span className="prg-diff__range">{text.slice(0, cut)}</span>
      {text.slice(cut)}
    </>
  );
}

/** The text a row shows (and a copy of it yields) on `side` in split view. */
export function cellText(cell: SplitCell, view: "unified" | "split", side?: DiffSide): string {
  if (cell.kind === "empty") return "";
  // In split view the hunk header prints once, on the old side; the new side keeps the band.
  if (view === "split" && side === "new" && cell.kind === "hunk") return "";
  return cell.text;
}

export function Row({ cell, view, side, hl, index }: { cell: SplitCell; view: "unified" | "split"; side?: DiffSide; hl?: DiffHighlight; index?: number }) {
  const columns = view === "unified" ? 2 : 1;
  if (cell.kind === "empty") {
    return (
      <span className="prg-diff__row" data-kind="empty" data-index={index}>
        <Gutter numbers={Array.from({ length: columns }, () => undefined)} silent />
      </span>
    );
  }
  const numbered = cell.kind === "context" || cell.kind === "add" || cell.kind === "del";
  const numbers = !numbered
    ? Array.from({ length: columns }, () => undefined)
    : view === "unified"
      ? [cell.oldLine, cell.newLine]
      : [side === "old" ? cell.oldLine : cell.newLine];
  const text = cellText(cell, view, side);
  return (
    <span
      className="prg-diff__row"
      data-kind={cell.kind}
      data-old={cell.oldLine}
      data-new={cell.newLine}
      data-hl={hl?.tone}
      data-fill={hl ? (hl.fill ?? hl.tone) : undefined}
      data-index={index}
    >
      <Gutter numbers={numbers} silent={cell.kind !== "add" && cell.kind !== "del"} />
      {text && cell.kind === "hunk" ? <HunkText text={text} /> : text || null}
    </span>
  );
}

/** div.prg-diff__annotation[role=note]. The windowed body passes `index` and `measureRef`:
 *  the note is the one thing between rows whose height is measured, not assumed. */
export function Annotation({ a, index, measureRef }: { a: DiffAnnotation; index?: number; measureRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={measureRef} className="prg-diff__annotation" role="note" aria-label={a.label} data-hl={a.tone} data-index={index}>
      {a.content}
    </div>
  );
}
