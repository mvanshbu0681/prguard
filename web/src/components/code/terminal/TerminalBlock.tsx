// OWNER: t1d (wave 1). <TerminalBlock>: one pane of captured stdout/stderr (design §5.7).
//
// The Proof Bench (T4) is built from this: pane A and pane B are two TerminalBlocks.
// It renders a captured artifact, it does not emulate a terminal (never xterm.js):
// real, selectable text in a <pre>, ANSI mapped to classes by anser (use_classes),
// Google Sans Code 13px on a 22px line (12/20 below 768px), tracking 0, no ligatures,
// horizontal scroll and NEVER a wrap, because wrapping destroys traceback alignment.
//
// Works in Server and Client Components alike (no state, no effects, no 'use client'); only
// the windowed viewport of a long capture is a client component.
//
// DOM contract (stable, for the bench's timeline and for tests):
//   .prg-terminal[data-bg][data-rail][data-gutter]
//                                        its own stacking context (isolation: isolate): the
//                                        z-indexes inside (gutter 1, rail 2, focus ring 3) stay
//                                        inside, so an overlay the bench mounts after the panes
//                                        (the scan line) paints over them at any z-index, auto
//                                        included, and never needs to outbid the gutter.
//     span.prg-terminal__rail            2px rail; the bench wipes it in with scaleY (origin top)
//     div.prg-terminal__viewport         role=region|log, aria-label, tabIndex=0, the scroller
//       pre.prg-terminal__pre > code
//         span.prg-terminal__group[data-row-group=0|1|2]   three stepped row-groups (motion §2.3).
//                                                  Inline boxes (a block wrapper would add
//                                                  newlines to a copy in some engines):
//                                                  animate their opacity, not transform.
//           span.prg-terminal__line[data-kind][data-tone][data-mark][data-line]
//             span.prg-terminal__gutter[data-ln]   aria-hidden; the number is CSS content,
//                                                  so a copy never picks it up (Safari included)
//             span[data-tone][data-mark].prg-ansi-* …   the text
//   Lines are separated by literal "\n" text nodes: pre.textContent === the captured text.
//
// Past 400 lines the viewport is <TerminalWindow> (a client component, shared/windowing.ts):
// only the lines near the view are rendered, between aria-hidden spacers, each line carrying
// data-index; the groups, classes and separators are the same. A copy inside the region is
// answered from the captured text and select-all inside it copies every line. Without a
// `height`/`maxHeight` a windowed viewport stops at min(70vh, 32 lines) and scrolls.
// Line numbers past 999 widen the gutter beyond 40px (--prg-digits) instead of overflowing it.
import { Fragment, useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { RailTone } from "../shared/types";
import { Viewport } from "../shared/Viewport";
import { digitsOf, shouldWindow } from "../shared/windowing";
import { Line } from "./Line";
import { buildTerminalLines, splitIntoGroups, type TerminalHighlightRule } from "./model";
import { TerminalWindow } from "./TerminalWindow";

export type TerminalBackground = "default" | "signal-tint-lo" | "alarm-tint-lo";

export interface TerminalBlockProps {
  /** Captured output. May contain ANSI SGR sequences; lines split on \n (CRLF accepted). */
  text: string;
  /** Accessible name of the region, e.g. "pytest at base 7c41a09". */
  label: string;
  /** Tone rules (pattern → tone), applied in order. None by default; see PYTEST_TONES. */
  highlight?: readonly TerminalHighlightRule[];
  /** 40px dimmed line-number gutter. Default false. */
  lineNumbers?: boolean;
  /** Number printed on the first line. Default 1. */
  startLine?: number;
  /** 2px left rail: base pane `signal-lo`, head pane `alarm`. Default none. */
  rail?: RailTone | "none";
  /** Pane surface: base pane `signal-tint-lo`, head pane `alarm-tint-lo`. Default --ink-1. */
  background?: TerminalBackground;
  /** Prompt prefix: the glyph renders --text-dim, the command --text-primary. `false` disables. */
  prompt?: string | false;
  /** Fixed viewport height in px (bench: 210 full / 160 compact); taller output scrolls. */
  height?: number;
  /** Maximum viewport height in px. */
  maxHeight?: number;
  /** Row groups for the bench's stepped reveal. Default 3. */
  rowGroups?: number;
  /** Live output: role="log" instead of role="region" (design §8.4). */
  live?: boolean;
  /** With `live`: aria-busy while a burst is landing. */
  busy?: boolean;
  id?: string;
  className?: string;
}

export function TerminalBlock({
  text,
  label,
  highlight,
  lineNumbers = false,
  startLine = 1,
  rail = "none",
  background = "default",
  prompt,
  height,
  maxHeight,
  rowGroups = 3,
  live = false,
  busy,
  id,
  className,
}: TerminalBlockProps) {
  const lines = useMemo(() => buildTerminalLines(text, { highlight, prompt, startLine }), [text, highlight, prompt, startLine]);
  const lastNumber = lines.length ? lines[lines.length - 1].number : startLine;
  const windowed = shouldWindow(lines.length);
  const digits = lineNumbers ? digitsOf(lastNumber) : 0;
  const role = live ? "log" : "region";

  return (
    <div
      id={id}
      className={cn("prg-terminal", className)}
      data-bg={background}
      data-rail={rail === "none" ? undefined : rail}
      data-gutter={lineNumbers ? "numbers" : undefined}
      style={digits > 3 ? ({ "--prg-digits": digits } as CSSProperties) : undefined}
    >
      {rail === "none" ? null : <span className="prg-terminal__rail" aria-hidden="true" />}
      {windowed ? (
        <TerminalWindow
          lines={lines}
          numbered={lineNumbers}
          label={label}
          role={role}
          busy={busy}
          height={height}
          maxHeight={maxHeight}
          rowGroups={rowGroups}
        />
      ) : (
        <Viewport className="prg-terminal__viewport" label={label} role={role} busy={busy} height={height} maxHeight={maxHeight}>
          <pre className="prg-terminal__pre">
            <code className="prg-terminal__code">
              {splitIntoGroups(lines, rowGroups).map((group, g) => (
                <span key={g} className="prg-terminal__group" data-row-group={g}>
                  {group.map((line) => (
                    <Fragment key={line.number}>
                      <Line line={line} numbered={lineNumbers} />
                      {line.number < lastNumber ? "\n" : null}
                    </Fragment>
                  ))}
                </span>
              ))}
            </code>
          </pre>
        </Viewport>
      )}
    </div>
  );
}
