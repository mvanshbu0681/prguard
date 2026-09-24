"use client";
// OWNER: t1d (wave 1). <TerminalWindow>: the viewport of a <TerminalBlock> with more than 400
// lines (shared/windowing.ts). The same DOM as a full pane, minus the lines far from the view:
//   pre.prg-terminal__pre[data-windowed] (style --prg-cols: the widest line, so the sheet
//   keeps its width while that line is not rendered) > code
//     span.prg-terminal__spacer            aria-hidden block, the height of the lines above
//     span.prg-terminal__group[data-row-group] > span.prg-terminal__line[data-index] "\n" …
//     span.prg-terminal__spacer            (between runs only while a selection end is pinned)
//     span.prg-terminal__spacer            the lines below
// A copy inside the region is answered from the captured text, the lines under a selection's
// ends stay rendered while it scrolls, and select-all inside the focused region copies every
// line. Assistive technology is told the line count and how to copy all of it.
import { Fragment, useCallback, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useWindow, useWindowCopy } from "../shared/useWindow";
import { Viewport } from "../shared/Viewport";
import { ROW_HEIGHT, WINDOW_ROWS, maxColumns, windowNote } from "../shared/windowing";
import { Line } from "./Line";
import type { TerminalLine } from "./model";

export interface TerminalWindowProps {
  lines: readonly TerminalLine[];
  numbered: boolean;
  label: string;
  role: "region" | "log";
  busy?: boolean;
  height?: number;
  maxHeight?: number;
  rowGroups: number;
}

function Spacer({ height }: { height: number }) {
  return <span className="prg-terminal__spacer" aria-hidden="true" style={{ blockSize: height }} />;
}

export function TerminalWindow({ lines, numbered, label, role, busy, height, maxHeight, rowGroups }: TerminalWindowProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const noteId = useId();
  const count = lines.length;
  const textOf = useCallback((index: number) => lines[index]?.text ?? null, [lines]);
  const { pinned, onKeyDown } = useWindowCopy({ bodyRef, count, textOf });
  const { layout } = useWindow({ count, scrollRef: viewportRef, initialHeight: height ?? maxHeight ?? WINDOW_ROWS * ROW_HEIGHT, pinned });
  const columns = useMemo(() => maxColumns(lines.map((line) => line.text), 8), [lines]);

  // The same three stepped groups as a full pane (TerminalBlock's splitIntoGroups), so the
  // bench's selectors still apply to whatever is rendered.
  const groups = Math.max(1, Math.min(Math.floor(rowGroups) || 1, count));
  const groupOf = (index: number) => Math.floor((index * groups) / count);

  const children: ReactNode[] = [<Spacer key="top" height={layout.runs[0]?.before ?? 0} />];
  const seen = new Map<number, number>();
  layout.runs.forEach((run, r) => {
    if (r > 0) children.push(<Spacer key={`gap-${run.from}`} height={run.before} />);
    let i = run.from;
    while (i <= run.to) {
      const group = groupOf(i);
      const ordinal = seen.get(group) ?? 0;
      seen.set(group, ordinal + 1);
      const rows: ReactNode[] = [];
      for (; i <= run.to && groupOf(i) === group; i++) {
        rows.push(
          <Fragment key={i}>
            <Line line={lines[i]} numbered={numbered} index={i} />
            {i < run.to ? "\n" : null}
          </Fragment>,
        );
      }
      children.push(
        <span key={`g${group}.${ordinal}`} className="prg-terminal__group" data-row-group={group}>
          {rows}
        </span>,
      );
    }
  });
  children.push(<Spacer key="bottom" height={layout.after} />);

  return (
    <>
      <Viewport
        ref={viewportRef}
        className="prg-terminal__viewport"
        label={label}
        role={role}
        busy={busy}
        height={height}
        maxHeight={maxHeight}
        describedBy={noteId}
        windowed
        onKeyDown={onKeyDown}
      >
        <pre className="prg-terminal__pre" data-windowed="" style={{ "--prg-cols": columns } as CSSProperties}>
          <code ref={bodyRef} className="prg-terminal__code">
            {children}
          </code>
        </pre>
      </Viewport>
      <p id={noteId} className="sr-only">
        {windowNote(count)}
      </p>
    </>
  );
}
