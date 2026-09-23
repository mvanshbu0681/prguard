// OWNER: t1d (wave 1). <PRGuardDiff>: THE diff component (design §5.8, dashboard §4).
//
// ── THE ONE-FILE DECISION ─────────────────────────────────────────────────────────────
// This wrapper was meant to sit over @git-diff-view/react@0.1.7. It does not: it is a
// lean unified/split renderer written against the same seams (read-only, dark, unified
// by default, finding lines highlighted, content hung beneath a line). Evaluated
// 2026-09-23 against the installed 0.1.7, the library cannot be held to the tokens:
//   1. Bundle. @git-diff-view/core imports @git-diff-view/lowlight, whose module scope runs
//      `createLowlight(all)`: every highlight.js grammar (~190) ships to the browser even
//      with highlighting off. It is a 'use client' module, so none of it can stay on the server.
//   2. Palette. Its stylesheet @imports highlight.js github.css + github-dark.css, hard-codes
//      GitHub's diff hexes, and sets `color: white` on every row (never #FFFFFF, §1.3).
//   3. Semantics. The context-line gutter is dimmed with opacity 0.5 (R4: state is never
//      opacity) and the removed marker is an ASCII hyphen, not U+2212.
//   4. SSR. Rows are built in useEffect, so the server renders an empty table unless a
//      pre-built DiffFile is threaded through.
// Swapping back (or to react-diff-view) touches this file only: parse.ts, rows.tsx and
// DiffWindow.tsx are this renderer's internals and would simply stop being imported; nothing
// else in the codebase imports a diff library. package.json still lists @git-diff-view/react
// (frozen); nothing imports it.
// ────────────────────────────────────────────────────────────────────────────────────────
//
// Rows: added text --diff-add-text on the 8% --diff-add-bg, removed text --diff-del-text on
// the 9% --diff-del-bg, context --syn-plain. The +/− gutter glyph is MANDATORY: it is the
// semantic channel (add↔del hues are ΔE 3.6 apart under deuteranopia), drawn by CSS with
// alt text ("added" / "removed") so it is announced but never copied. Plain text inside
// rows: the row colour carries direction of edit, as §5.8 specifies. These greens and reds
// are quarantined to .prg-diff (code.css) and never style chrome.
//
// A highlighted (accused) row: 2px rail in `tone`, the row one rung up, and the band colour
// (`fill`, default `tone`) at 10% in place of the diff tint (dashboard §4).
//
// Past 400 rows (unified) or row pairs (split) the viewport is <DiffWindow> (client,
// shared/windowing.ts): the same sheet, only the rows near the view, between aria-hidden
// spacers; rows carry data-index and annotations are measured. A copy inside one side is
// answered from the diff text and select-all inside the region copies every row.
// Line numbers past 999 widen the number columns (--prg-digits) instead of colliding.
//
// DOM contract (the root is its own stacking context, isolation: isolate, see code.css):
//   .prg-diff[data-view]
//     div.prg-diff__header                 path · +N −M
//     div.prg-diff__viewport               role=region, tabIndex=0, the scroller (inline-size container)
//       div.prg-diff__sheet[data-view]
//         pre.prg-diff__pre[data-side] > code
//           span.prg-diff__row[data-kind=hunk|context|add|del|meta|empty][data-old][data-new][data-hl][data-fill]
//             span.prg-diff__gutter > span.prg-diff__num[data-n] (aria-hidden) · span.prg-diff__marker
//             hunk rows: span.prg-diff__range (the @@ range, label style) + the section heading
//         div.prg-diff__annotation[role=note]   hung beneath its line, pinned to the visible width
import { Fragment, useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { describeRange } from "../shared/types";
import { Viewport } from "../shared/Viewport";
import { digitsOf, shouldWindow } from "../shared/windowing";
import { DiffWindow } from "./DiffWindow";
import { pairRows, parseUnifiedDiff, type DiffRow, type SplitPair } from "./parse";
import { Annotation, annotationsAfter, highlightOf, lineOn, Row, type DiffAnnotation, type DiffHighlight, type DiffSide } from "./rows";

export { lineOn, type DiffAnnotation, type DiffHighlight, type DiffSide };

export interface PRGuardDiffProps {
  /** One file's unified diff: `git diff` output or GitHub's `patch` field. */
  diff: string;
  /** Header path. Defaults to the +++ (else ---) path in the diff. */
  filePath?: string;
  /** Accessible name of the scroll region. Default "Diff of <path>" ("Diff" when no path is known). */
  label?: string;
  /** Default "unified". */
  view?: "unified" | "split";
  highlight?: readonly DiffHighlight[];
  annotations?: readonly DiffAnnotation[];
  /** The path · +N −M strip. Default true. */
  header?: boolean;
  height?: number;
  maxHeight?: number;
  id?: string;
  className?: string;
}

type Segment<T> = { kind: "rows"; items: T[] } | { kind: "note"; annotation: DiffAnnotation };

function segment<T>(items: readonly T[], notesAfter: (item: T) => DiffAnnotation[]): Segment<T>[] {
  const out: Segment<T>[] = [];
  let current: T[] = [];
  for (const item of items) {
    current.push(item);
    const notes = notesAfter(item);
    if (notes.length) {
      out.push({ kind: "rows", items: current });
      current = [];
      for (const annotation of notes) out.push({ kind: "note", annotation });
    }
  }
  if (current.length) out.push({ kind: "rows", items: current });
  return out;
}

function Lines({ children }: { children: ReactNode[] }) {
  return children.map((child, i) => (
    <Fragment key={i}>
      {child}
      {i < children.length - 1 ? "\n" : null}
    </Fragment>
  ));
}

/** The largest line number any row prints. */
function maxLineNumber(rows: readonly DiffRow[]): number {
  let max = 0;
  for (const row of rows) max = Math.max(max, row.oldLine ?? 0, row.newLine ?? 0);
  return max;
}

function fullSplit(pairs: readonly SplitPair[], highlight: readonly DiffHighlight[] | undefined, annotations: readonly DiffAnnotation[] | undefined) {
  const segments = segment<SplitPair>(pairs, (p) => [
    ...(p.left.kind === "empty" ? [] : annotationsAfter(p.left, annotations, "old")),
    ...(p.right.kind === "empty" ? [] : annotationsAfter(p.right, annotations, "new")),
  ]);
  return segments.map((seg, s) =>
    seg.kind === "note" ? (
      <Annotation key={s} a={seg.annotation} />
    ) : (
      <Fragment key={s}>
        {(["old", "new"] as const).map((side) => (
          <pre key={side} className="prg-diff__pre" data-side={side}>
            <code className="prg-diff__code">
              <Lines>
                {seg.items.map((p, i) => {
                  const cell = side === "old" ? p.left : p.right;
                  const hl = cell.kind === "empty" ? undefined : highlightOf(cell, highlight, side);
                  return <Row key={i} cell={cell} view="split" side={side} hl={hl} />;
                })}
              </Lines>
            </code>
          </pre>
        ))}
      </Fragment>
    ),
  );
}

function fullUnified(rows: readonly DiffRow[], highlight: readonly DiffHighlight[] | undefined, annotations: readonly DiffAnnotation[] | undefined) {
  const segments = segment<DiffRow>(rows, (row) => annotationsAfter(row, annotations));
  return segments.map((seg, s) =>
    seg.kind === "note" ? (
      <Annotation key={s} a={seg.annotation} />
    ) : (
      <pre key={s} className="prg-diff__pre">
        <code className="prg-diff__code">
          <Lines>
            {seg.items.map((row, i) => (
              <Row key={i} cell={row} view="unified" hl={highlightOf(row, highlight)} />
            ))}
          </Lines>
        </code>
      </pre>
    ),
  );
}

export function PRGuardDiff({
  diff,
  filePath,
  label,
  view = "unified",
  highlight,
  annotations,
  header = true,
  height,
  maxHeight,
  id,
  className,
}: PRGuardDiffProps) {
  const parsed = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const pairs = useMemo(() => (view === "split" ? pairRows(parsed.rows) : null), [parsed, view]);
  const descriptionId = useId();
  // A bare `patch` field names no file: then the header prints only the counts.
  const path = filePath ?? parsed.newPath ?? parsed.oldPath ?? null;
  const described = highlight?.length
    ? highlight
        .map((h) => {
          const where = `${h.side ?? "new"} ${describeRange(h)}`;
          return h.label ? `${where}: ${h.label}` : where;
        })
        .join("; ")
    : null;
  const regionLabel = label ?? (path ? `Diff of ${path}` : "Diff");
  const windowed = shouldWindow(pairs ? pairs.length : parsed.rows.length);
  const digits = digitsOf(maxLineNumber(parsed.rows));

  return (
    <div id={id} className={cn("prg-diff", className)} data-view={view} style={digits > 3 ? ({ "--prg-digits": digits } as CSSProperties) : undefined}>
      {header ? (
        <div className="prg-diff__header">
          <span className="prg-diff__path">{path ?? ""}</span>
          <span className="prg-diff__stat">
            <span aria-hidden="true">
              +{parsed.additions} {"−"}
              {parsed.deletions}
            </span>
            <span className="sr-only">
              {parsed.additions} added, {parsed.deletions} removed
            </span>
          </span>
        </div>
      ) : null}
      {windowed ? (
        <DiffWindow
          rows={parsed.rows}
          view={view}
          highlight={highlight}
          annotations={annotations}
          label={regionLabel}
          describedBy={described ? descriptionId : undefined}
          height={height}
          maxHeight={maxHeight}
        />
      ) : (
        <Viewport
          className="prg-diff__viewport"
          label={regionLabel}
          describedBy={described ? descriptionId : undefined}
          height={height}
          maxHeight={maxHeight}
        >
          <div className="prg-diff__sheet" data-view={view}>
            {pairs ? fullSplit(pairs, highlight, annotations) : fullUnified(parsed.rows, highlight, annotations)}
          </div>
        </Viewport>
      )}
      {described ? (
        <p id={descriptionId} className="sr-only">
          Highlighted {described}.
        </p>
      ) : null}
    </div>
  );
}
