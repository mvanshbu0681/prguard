"use client";
// OWNER: t1d (wave 1). <CodeWindow>: the viewport of a code block with more than 400 lines
// (shared/windowing.ts). The same rows as a full block, only those near the view:
//   pre.prg-code__pre[data-windowed] (style --prg-cols) > code
//     span.prg-code__spacer · span.prg-code__line[data-index] "\n" … · span.prg-code__spacer
// A copy inside the region is answered from the source, and select-all inside the focused
// region copies every line.
import { Fragment, useCallback, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { highlightFor, type LineHighlight } from "../shared/types";
import { useWindow, useWindowCopy } from "../shared/useWindow";
import { Viewport } from "../shared/Viewport";
import { ROW_HEIGHT, WINDOW_ROWS, maxColumns, windowNote } from "../shared/windowing";
import type { CodeLine } from "../shiki/tokens";
import { CodeRow, lineText } from "./CodeRow";

export interface CodeWindowProps {
  lines: readonly CodeLine[];
  startLine: number;
  numbered: boolean;
  highlight?: readonly LineHighlight[];
  label: string;
  /** The highlighted-lines description, when there is one. */
  describedBy?: string;
  height?: number;
  maxHeight?: number;
}

function Spacer({ height }: { height: number }) {
  return <span className="prg-code__spacer" aria-hidden="true" style={{ blockSize: height }} />;
}

export function CodeWindow({ lines, startLine, numbered, highlight, label, describedBy, height, maxHeight }: CodeWindowProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const noteId = useId();
  const count = lines.length;
  const texts = useMemo(() => lines.map(lineText), [lines]);
  const textOf = useCallback((index: number) => texts[index] ?? null, [texts]);
  const { pinned, onKeyDown } = useWindowCopy({ bodyRef, count, textOf });
  const { layout } = useWindow({ count, scrollRef: viewportRef, initialHeight: height ?? maxHeight ?? WINDOW_ROWS * ROW_HEIGHT, pinned });
  const columns = useMemo(() => maxColumns(texts, 4), [texts]);

  const children: ReactNode[] = [<Spacer key="top" height={layout.runs[0]?.before ?? 0} />];
  layout.runs.forEach((run, r) => {
    if (r > 0) children.push(<Spacer key={`gap-${run.from}`} height={run.before} />);
    for (let i = run.from; i <= run.to; i++) {
      const number = startLine + i;
      children.push(
        <Fragment key={i}>
          <CodeRow line={lines[i]} number={number} numbered={numbered} tone={highlightFor(highlight, number)?.tone} index={i} />
          {i < run.to ? "\n" : null}
        </Fragment>,
      );
    }
  });
  children.push(<Spacer key="bottom" height={layout.after} />);

  return (
    <>
      <Viewport
        ref={viewportRef}
        className="prg-code__viewport"
        label={label}
        describedBy={[describedBy, noteId].filter(Boolean).join(" ")}
        height={height}
        maxHeight={maxHeight}
        windowed
        onKeyDown={onKeyDown}
      >
        <pre className="prg-code__pre" data-windowed="" style={{ "--prg-cols": columns } as CSSProperties}>
          <code ref={bodyRef} className="prg-code__code">
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
