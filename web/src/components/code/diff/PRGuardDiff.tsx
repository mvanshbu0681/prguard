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
// Swapping back (or to react-diff-view) touches this file only; nothing else in the
// codebase imports a diff library. package.json still lists @git-diff-view/react (frozen);
// nothing imports it.
// ────────────────────────────────────────────────────────────────────────────────────────
//
// Rows: added text --diff-add-text on the 8% --diff-add-bg, removed text --diff-del-text on
// the 9% --diff-del-bg, context --syn-plain. The +/− gutter glyph is MANDATORY: it is the
// semantic channel (add↔del hues are ΔE 3.6 apart under deuteranopia), drawn by CSS with
// alt text ("added" / "removed") so it is announced but never copied. Plain text inside
// rows: the row colour carries direction of edit, as §5.8 specifies. These greens and reds
// are quarantined to .prg-diff (code.css) and never style chrome.
//
// DOM contract:
//   .prg-diff[data-view]
//     div.prg-diff__header                 path · +N −M
//     div.prg-diff__viewport               role=region, tabIndex=0, the scroller (inline-size container)
//       div.prg-diff__sheet[data-view]
//         pre.prg-diff__pre[data-side] > code
//           span.prg-diff__row[data-kind=hunk|context|add|del|meta|empty][data-old][data-new][data-hl]
//             span.prg-diff__gutter > span.prg-diff__num[data-n] (aria-hidden) · span.prg-diff__marker
//         div.prg-diff__annotation[role=note]   hung beneath its line, pinned to the visible width
import { Fragment, useId, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { describeRange, inHighlight, type LineHighlight, type RailTone } from "../shared/types";
import { Viewport } from "../shared/Viewport";
import { pairRows, parseUnifiedDiff, type DiffRow, type SplitCell, type SplitPair } from "./parse";

export type DiffSide = "old" | "new";

/** A highlighted range on one side. FindingLocation.side: LEFT → "old", RIGHT → "new". */
export interface DiffHighlight extends LineHighlight {
  /** Default "new". */
  side?: DiffSide;
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

/** The line number `row` carries on `side`, or undefined when it has none there. */
export function lineOn(row: DiffRow, side: DiffSide): number | undefined {
  if (side === "new") return row.kind === "add" || row.kind === "context" ? row.newLine : undefined;
  return row.kind === "del" || row.kind === "context" ? row.oldLine : undefined;
}

function highlightOf(row: DiffRow, highlights: readonly DiffHighlight[] | undefined, only?: DiffSide): DiffHighlight | undefined {
  return highlights?.find((h) => {
    const side = h.side ?? "new";
    if (only && side !== only) return false;
    const line = lineOn(row, side);
    return line !== undefined && inHighlight(h, line);
  });
}

function annotationsAfter(row: DiffRow, annotations: readonly DiffAnnotation[] | undefined, only?: DiffSide): DiffAnnotation[] {
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

function Row({ cell, view, side, hl }: { cell: SplitCell; view: "unified" | "split"; side?: DiffSide; hl?: DiffHighlight }) {
  const columns = view === "unified" ? 2 : 1;
  if (cell.kind === "empty") {
    return (
      <span className="prg-diff__row" data-kind="empty">
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
  // In split view the hunk header prints once, on the old side; the new side keeps the band.
  const showText = !(view === "split" && side === "new" && cell.kind === "hunk");
  return (
    <span
      className="prg-diff__row"
      data-kind={cell.kind}
      data-old={cell.oldLine}
      data-new={cell.newLine}
      data-hl={hl?.tone}
    >
      <Gutter numbers={numbers} silent={cell.kind !== "add" && cell.kind !== "del"} />
      {showText ? cell.text : null}
    </span>
  );
}

function Annotation({ a }: { a: DiffAnnotation }) {
  return (
    <div className="prg-diff__annotation" role="note" aria-label={a.label} data-hl={a.tone}>
      {a.content}
    </div>
  );
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

  let body: ReactNode;
  if (view === "split") {
    const pairs = pairRows(parsed.rows);
    const segments = segment<SplitPair>(pairs, (p) => [
      ...(p.left.kind === "empty" ? [] : annotationsAfter(p.left, annotations, "old")),
      ...(p.right.kind === "empty" ? [] : annotationsAfter(p.right, annotations, "new")),
    ]);
    body = segments.map((seg, s) =>
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
  } else {
    const segments = segment<DiffRow>(parsed.rows, (row) => annotationsAfter(row, annotations));
    body = segments.map((seg, s) =>
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

  return (
    <div id={id} className={cn("prg-diff", className)} data-view={view}>
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
      <Viewport
        className="prg-diff__viewport"
        label={label ?? (path ? `Diff of ${path}` : "Diff")}
        describedBy={described ? descriptionId : undefined}
        height={height}
        maxHeight={maxHeight}
      >
        <div className="prg-diff__sheet" data-view={view}>
          {body}
        </div>
      </Viewport>
      {described ? (
        <p id={descriptionId} className="sr-only">
          Highlighted {described}.
        </p>
      ) : null}
    </div>
  );
}
