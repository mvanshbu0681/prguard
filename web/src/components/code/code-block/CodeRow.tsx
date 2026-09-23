// OWNER: t1d (wave 1). One source line, shared by <CodeFrame> (every line in the DOM) and
// <CodeWindow> (only the lines near the view). No hooks: server or client.
import { Fragment } from "react";
import type { RailTone } from "../shared/types";
import type { CodeLine } from "../shiki/tokens";

function Tokens({ line }: { line: CodeLine }) {
  return line.map((token, i) =>
    token.role === "plain" ? (
      <Fragment key={i}>{token.text}</Fragment>
    ) : (
      <span key={i} className={`prg-syn-${token.role}`}>
        {token.text}
      </span>
    ),
  );
}

/** The text a copy of this line yields. */
export function lineText(line: CodeLine): string {
  return line.map((token) => token.text).join("");
}

/** span.prg-code__line[data-line][data-hl]: the aria-hidden gutter (number drawn by CSS, never
 *  copied), then the tokens. `index` (0-based) is set by the windowed body. */
export function CodeRow({ line, number, numbered, tone, index }: { line: CodeLine; number: number; numbered: boolean; tone?: RailTone; index?: number }) {
  return (
    <span className="prg-code__line" data-line={number} data-hl={tone} data-index={index}>
      <span className="prg-code__gutter" aria-hidden="true" data-ln={numbered ? number : undefined} />
      <Tokens line={line} />
    </span>
  );
}
