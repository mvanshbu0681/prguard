"use client";
// OWNER: t1d (wave 1). <DiffWindow>: the viewport of a diff with more than 400 rows (unified)
// or row pairs (split), shared/windowing.ts. The same sheet as a full diff, only the rows near
// the view:
//   div.prg-diff__sheet[data-view][data-windowed] (style --prg-cols)
//     div.prg-diff__spacer                         aria-hidden, the height of what is above
//     pre.prg-diff__pre[data-side] > code > span.prg-diff__row[data-index] "\n" …
//     div.prg-diff__annotation[role=note][data-index]   measured, not assumed
//     div.prg-diff__spacer                         the height of what is below
// Rows are one line box tall; annotations are estimated at the collapsed card's 88px, then
// measured. A copy inside one side is answered from the diff text (annotation cards add
// nothing to it); select-all inside the focused region copies every row of the diff, in
// unified order, whichever view is showing.
import { Fragment, useCallback, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useWindow, useWindowCopy } from "../shared/useWindow";
import { Viewport } from "../shared/Viewport";
import { ROW_HEIGHT, WINDOW_ROWS, maxColumns, windowNote } from "../shared/windowing";
import { pairRows, type DiffRow, type SplitPair } from "./parse";
import { Annotation, annotationsAfter, cellText, highlightOf, Row, type DiffAnnotation, type DiffHighlight, type DiffSide } from "./rows";

export interface DiffWindowProps {
  rows: readonly DiffRow[];
  view: "unified" | "split";
  highlight?: readonly DiffHighlight[];
  annotations?: readonly DiffAnnotation[];
  label: string;
  describedBy?: string;
  height?: number;
  maxHeight?: number;
}

/** One windowed item: a row (unified), a row pair (split) or a note. `segment` counts the notes
 *  above it, so the pre a row renders in keeps its key while the window moves. */
type Item =
  | { kind: "row"; row: DiffRow; segment: number }
  | { kind: "pair"; pair: SplitPair; segment: number }
  | { kind: "note"; annotation: DiffAnnotation; segment: number; key: string };

function buildItems(rows: readonly DiffRow[], view: "unified" | "split", annotations: readonly DiffAnnotation[] | undefined): Item[] {
  const items: Item[] = [];
  let segment = 0;
  const pushNotes = (notes: DiffAnnotation[], at: number) => {
    notes.forEach((annotation, n) => items.push({ kind: "note", annotation, segment, key: `n${at}.${n}` }));
    if (notes.length) segment++;
  };
  if (view === "split") {
    pairRows(rows).forEach((pair, p) => {
      items.push({ kind: "pair", pair, segment });
      pushNotes(
        [
          ...(pair.left.kind === "empty" ? [] : annotationsAfter(pair.left, annotations, "old")),
          ...(pair.right.kind === "empty" ? [] : annotationsAfter(pair.right, annotations, "new")),
        ],
        p,
      );
    });
  } else {
    rows.forEach((row, r) => {
      items.push({ kind: "row", row, segment });
      pushNotes(annotationsAfter(row, annotations), r);
    });
  }
  return items;
}

function Spacer({ height }: { height: number }) {
  return <div className="prg-diff__spacer" aria-hidden="true" style={{ blockSize: height }} />;
}

export function DiffWindow({ rows, view, highlight, annotations, label, describedBy, height, maxHeight }: DiffWindowProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const noteId = useId();
  const items = useMemo(() => buildItems(rows, view, annotations), [rows, view, annotations]);
  const count = items.length;

  const textOf = useCallback(
    (index: number, scope: string | undefined): string | null => {
      const item = items[index];
      if (!item || item.kind === "note") return null;
      if (item.kind === "row") return item.row.text;
      const side: DiffSide = scope === "old" ? "old" : "new";
      return cellText(side === "old" ? item.pair.left : item.pair.right, "split", side);
    },
    [items],
  );
  const every = useCallback(() => rows.map((row) => row.text).join("\n"), [rows]);
  const { pinned, onKeyDown } = useWindowCopy({ bodyRef, count, textOf, allText: every });
  const isBlock = useCallback((index: number) => items[index]?.kind === "note", [items]);
  const getItemKey = useCallback((index: number) => {
    const item = items[index];
    return item?.kind === "note" ? item.key : index;
  }, [items]);
  const { layout, measureBlock } = useWindow({
    count,
    scrollRef: viewportRef,
    initialHeight: height ?? maxHeight ?? WINDOW_ROWS * ROW_HEIGHT,
    pinned,
    isBlock,
    getItemKey,
  });
  const columns = useMemo(() => maxColumns(rows.map((row) => row.text), 4), [rows]);

  const children: ReactNode[] = [<Spacer key="top" height={layout.runs[0]?.before ?? 0} />];
  const seen = new Map<number, number>();
  layout.runs.forEach((run, r) => {
    if (r > 0) children.push(<Spacer key={`gap-${run.from}`} height={run.before} />);
    let i = run.from;
    while (i <= run.to) {
      const item = items[i];
      if (item.kind === "note") {
        children.push(<Annotation key={item.key} a={item.annotation} index={i} measureRef={measureBlock} />);
        i++;
        continue;
      }
      // A block of consecutive rows in one segment: one pre (unified) or one pre per side.
      const from = i;
      while (i <= run.to && items[i].kind !== "note") i++;
      const to = i - 1;
      const ordinal = seen.get(item.segment) ?? 0;
      seen.set(item.segment, ordinal + 1);
      const key = `p${item.segment}.${ordinal}`;
      const indices = Array.from({ length: to - from + 1 }, (_, k) => from + k);
      if (view === "split") {
        for (const side of ["old", "new"] as const) {
          children.push(
            <pre key={`${key}.${side}`} className="prg-diff__pre" data-side={side}>
              <code className="prg-diff__code">
                {indices.map((index) => {
                  const pair = items[index] as Extract<Item, { kind: "pair" }>;
                  const cell = side === "old" ? pair.pair.left : pair.pair.right;
                  const hl = cell.kind === "empty" ? undefined : highlightOf(cell, highlight, side);
                  return (
                    <Fragment key={index}>
                      <Row cell={cell} view="split" side={side} hl={hl} index={index} />
                      {index < to ? "\n" : null}
                    </Fragment>
                  );
                })}
              </code>
            </pre>,
          );
        }
      } else {
        children.push(
          <pre key={key} className="prg-diff__pre">
            <code className="prg-diff__code">
              {indices.map((index) => {
                const row = (items[index] as Extract<Item, { kind: "row" }>).row;
                return (
                  <Fragment key={index}>
                    <Row cell={row} view="unified" hl={highlightOf(row, highlight)} index={index} />
                    {index < to ? "\n" : null}
                  </Fragment>
                );
              })}
            </code>
          </pre>,
        );
      }
    }
  });
  children.push(<Spacer key="bottom" height={layout.after} />);

  return (
    <>
      <Viewport
        ref={viewportRef}
        className="prg-diff__viewport"
        label={label}
        describedBy={[describedBy, noteId].filter(Boolean).join(" ")}
        height={height}
        maxHeight={maxHeight}
        windowed
        onKeyDown={onKeyDown}
      >
        <div ref={bodyRef} className="prg-diff__sheet" data-view={view} data-windowed="" style={{ "--prg-cols": columns } as CSSProperties}>
          {children}
        </div>
      </Viewport>
      <p id={noteId} className="sr-only">
        {windowNote(rows.length)}
      </p>
    </>
  );
}
