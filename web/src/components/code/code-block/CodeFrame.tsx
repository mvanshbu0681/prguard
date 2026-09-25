// OWNER: t1d (wave 1). The code block's markup, shared by <CodeBlock> (server) and
// <CodeBlockClient> (client fallback) so both render the identical DOM (design §5.6).
//
//   .prg-code[data-gutter][data-state=plain|highlighted][data-lang]
//                                   its own stacking context (isolation: isolate, code.css)
//     div.prg-code__header          32px --ink-2 strip: title left, language (or the
//                                   "syntax highlighting unavailable for .ex" note) right;
//                                   the meta takes a second row when both cannot fit
//     div.prg-code__viewport        role=region, aria-label, tabIndex=0, the scroller
//       pre.prg-code__pre > code
//         span.prg-code__line[data-line][data-hl=<RailTone>]
//           span.prg-code__gutter[data-ln]   aria-hidden, number drawn by CSS (never copied)
//           span.prg-syn-<role> …            the tokens
//     p.sr-only                     the highlighted lines, read to assistive technology
// Highlighted finding lines: a 2px left rail in the caller's tone + an --ink-3 row.
// Past 400 lines the viewport is <CodeWindow> (client, shared/windowing.ts): the same rows,
// only those near the view, each with data-index; copy and select-all answer from the source.
// Line numbers past 999 widen the gutter (--prg-digits) instead of overflowing it.
import { Fragment, useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { describeRange, highlightFor, type LineHighlight } from "../shared/types";
import { Viewport } from "../shared/Viewport";
import { digitsOf, shouldWindow } from "../shared/windowing";
import { LANGUAGE_LABEL, type SupportedLanguage } from "../shiki/languages";
import type { CodeLine } from "../shiki/tokens";
import { CodeRow } from "./CodeRow";
import { CodeWindow } from "./CodeWindow";

export interface CodeFrameProps {
  lines: readonly CodeLine[];
  label: string;
  title?: ReactNode;
  language: SupportedLanguage | null;
  /** When highlighting was wanted and is not available: what for (".ex", "elixir"). */
  unavailable?: string | null;
  startLine?: number;
  lineNumbers?: boolean;
  highlight?: readonly LineHighlight[];
  /** Header slot, right-aligned after the language label (copy / download controls). */
  actions?: ReactNode;
  /** Force the header on or off. Default: shown when there is anything to put in it. */
  header?: boolean;
  height?: number;
  maxHeight?: number;
  state: "plain" | "highlighted";
  id?: string;
  className?: string;
}

export function CodeFrame({
  lines,
  label,
  title,
  language,
  unavailable,
  startLine = 1,
  lineNumbers = true,
  highlight,
  actions,
  header,
  height,
  maxHeight,
  state,
  id,
  className,
}: CodeFrameProps) {
  const descriptionId = useId();
  const showHeader = header ?? Boolean(title || language || unavailable || actions);
  const described = highlight?.length
    ? highlight.map((h) => (h.label ? `${describeRange(h)}: ${h.label}` : describeRange(h))).join("; ")
    : null;
  const lastIndex = lines.length - 1;
  const digits = lineNumbers ? digitsOf(startLine + lastIndex) : 0;

  return (
    <div
      id={id}
      className={cn("prg-code", className)}
      data-gutter={lineNumbers ? "numbers" : undefined}
      data-state={state}
      data-lang={language ?? undefined}
      style={digits > 3 ? ({ "--prg-digits": digits } as CSSProperties) : undefined}
    >
      {showHeader ? (
        <div className="prg-code__header">
          <span className="prg-code__title">{title}</span>
          <span className="prg-code__meta">
            {unavailable ? (
              <span className="prg-code__note">syntax highlighting unavailable for {unavailable}</span>
            ) : language ? (
              <span className="prg-code__lang">{LANGUAGE_LABEL[language]}</span>
            ) : null}
            {actions}
          </span>
        </div>
      ) : null}
      {shouldWindow(lines.length) ? (
        <CodeWindow
          lines={lines}
          startLine={startLine}
          numbered={lineNumbers}
          highlight={highlight}
          label={label}
          describedBy={described ? descriptionId : undefined}
          height={height}
          maxHeight={maxHeight}
        />
      ) : (
        <Viewport
          className="prg-code__viewport"
          label={label}
          describedBy={described ? descriptionId : undefined}
          height={height}
          maxHeight={maxHeight}
        >
          <pre className="prg-code__pre">
            <code className="prg-code__code">
              {lines.map((line, i) => {
                const number = startLine + i;
                return (
                  <Fragment key={number}>
                    <CodeRow line={line} number={number} numbered={lineNumbers} tone={highlightFor(highlight, number)?.tone} />
                    {i < lastIndex ? "\n" : null}
                  </Fragment>
                );
              })}
            </code>
          </pre>
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
