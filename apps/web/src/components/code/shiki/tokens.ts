// OWNER: t1d (wave 1). The token model shared by the server and client code blocks.
// Pure, dependency-free: importing it never pulls Shiki into a bundle.
import type { SyntaxRole } from "./theme";

export interface CodeToken {
  text: string;
  role: SyntaxRole;
}

/** One rendered line: its tokens in order. An empty array is an empty line. */
export type CodeLine = CodeToken[];

/** CRLF → LF, and a single trailing newline does not produce an empty last line. */
export function normaliseCode(code: string): string {
  const lf = code.replace(/\r\n?/g, "\n");
  return lf.endsWith("\n") ? lf.slice(0, -1) : lf;
}

/** The unhighlighted rendering: every line one plain token. Same line count as highlightCode. */
export function plainLines(code: string): CodeLine[] {
  return normaliseCode(code)
    .split("\n")
    .map((text) => (text ? [{ text, role: "plain" as const }] : []));
}
