// OWNER: t1d (wave 1). One terminal line, shared by <TerminalBlock> (every line in the DOM)
// and <TerminalWindow> (only the lines near the view). No hooks: server or client.
import type { ReactNode } from "react";
import type { TerminalLine, TerminalSegment } from "./model";

function Segment({ segment }: { segment: TerminalSegment }): ReactNode {
  const names = segment.role ? [...segment.classes, `prg-terminal__${segment.role}`] : segment.classes;
  const className = names.length ? names.join(" ") : undefined;
  if (!className && !segment.tone && !segment.mark) return segment.text;
  return (
    <span className={className} data-tone={segment.tone} data-mark={segment.mark}>
      {segment.text}
    </span>
  );
}

/** span.prg-terminal__line: the aria-hidden gutter (number drawn by CSS, never copied), then
 *  the text. `index` (0-based) is set by the windowed body, which resolves copies by it. */
export function Line({ line, numbered, index }: { line: TerminalLine; numbered: boolean; index?: number }) {
  return (
    <span
      className="prg-terminal__line"
      data-line={line.number}
      data-kind={line.kind}
      data-tone={line.tone}
      data-mark={line.marks.length ? line.marks.join(" ") : undefined}
      data-index={index}
    >
      <span className="prg-terminal__gutter" aria-hidden="true" data-ln={numbered ? line.number : undefined} />
      {line.segments.map((segment, i) => (
        <Segment key={i} segment={segment} />
      ))}
    </span>
  );
}
