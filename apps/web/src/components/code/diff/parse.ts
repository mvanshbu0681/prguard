// OWNER: t1d (wave 1). Unified diff text → rows. Pure: no React, no DOM.
//
// Input is ONE file's diff: `git diff` output (diff --git / index / --- / +++ headers are
// read for the paths) or GitHub's `patch` field (hunks only). A second `diff --git` ends
// the parse. Hunk bodies are consumed by their @@ counts, so a removed line whose text
// starts with "-- " is never mistaken for a header.

export type DiffRowKind = "hunk" | "context" | "add" | "del" | "meta";

export interface DiffHunkHeader {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** The section heading git prints after the second @@ (usually the enclosing function). */
  section: string;
}

export interface DiffRow {
  kind: DiffRowKind;
  /** Line number on the old side (context, del). */
  oldLine?: number;
  /** Line number on the new side (context, add). */
  newLine?: number;
  /** Line text without its +/−/space marker. For hunk rows, the whole @@ line. */
  text: string;
  /** For hunk rows. */
  hunk?: DiffHunkHeader;
}

export interface ParsedDiff {
  oldPath: string | null;
  newPath: string | null;
  rows: DiffRow[];
  additions: number;
  deletions: number;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

function stripPrefix(path: string): string | null {
  const p = path.replace(/\t.*$/, "").trim(); // `--- a/x.py\t2026-09-19 …` timestamps
  if (p === "/dev/null") return null;
  return p.replace(/^[ab]\//, "");
}

export function parseUnifiedDiff(input: string): ParsedDiff {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out: ParsedDiff = { oldPath: null, newPath: null, rows: [], additions: 0, deletions: 0 };
  let seenGitHeader = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) {
      if (seenGitHeader || out.rows.length) break; // a second file: this component renders one
      seenGitHeader = true;
      i++;
      continue;
    }
    if (line.startsWith("--- ") && !out.rows.length) {
      out.oldPath = stripPrefix(line.slice(4));
      i++;
      continue;
    }
    if (line.startsWith("+++ ") && !out.rows.length) {
      out.newPath = stripPrefix(line.slice(4));
      i++;
      continue;
    }
    const m = HUNK.exec(line);
    if (!m) {
      i++; // index / mode / similarity / rename lines, or noise between hunks
      continue;
    }
    const hunk: DiffHunkHeader = {
      oldStart: Number(m[1]),
      oldLines: m[2] === undefined ? 1 : Number(m[2]),
      newStart: Number(m[3]),
      newLines: m[4] === undefined ? 1 : Number(m[4]),
      section: m[5] ?? "",
    };
    out.rows.push({ kind: "hunk", text: line, hunk });
    i++;

    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    let oldLeft = hunk.oldLines;
    let newLeft = hunk.newLines;
    while (i < lines.length && (oldLeft > 0 || newLeft > 0 || lines[i].startsWith("\\"))) {
      const body = lines[i];
      const marker = body.charAt(0);
      if (marker === "\\") {
        out.rows.push({ kind: "meta", text: body });
      } else if (marker === "+") {
        out.rows.push({ kind: "add", newLine: newLine++, text: body.slice(1) });
        out.additions++;
        newLeft--;
      } else if (marker === "-") {
        out.rows.push({ kind: "del", oldLine: oldLine++, text: body.slice(1) });
        out.deletions++;
        oldLeft--;
      } else if (marker === " " || body === "") {
        // Some tools strip the single space of an empty context line.
        out.rows.push({ kind: "context", oldLine: oldLine++, newLine: newLine++, text: body.slice(1) });
        oldLeft--;
        newLeft--;
      } else {
        break; // malformed: counts promised more lines than the hunk has
      }
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- split view

export type SplitCell = DiffRow | { kind: "empty" };

export interface SplitPair {
  left: SplitCell;
  right: SplitCell;
}

const EMPTY: SplitCell = { kind: "empty" };

/** Pair rows for side-by-side display: context on both sides; within a change block the
 *  i-th removed line sits beside the i-th added line and the shorter side is padded.
 *  A "\ No newline" row stays on the side of the line it annotates. */
export function pairRows(rows: readonly DiffRow[]): SplitPair[] {
  const pairs: SplitPair[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind !== "del" && row.kind !== "add") {
      // hunk headers, context, and a meta row after context: both sides
      pairs.push({ left: row, right: row });
      i++;
      continue;
    }
    const left: DiffRow[] = [];
    const right: DiffRow[] = [];
    let side: DiffRow[] | null = null;
    for (; i < rows.length; i++) {
      const r = rows[i];
      if (r.kind === "del") side = left;
      else if (r.kind === "add") side = right;
      else if (r.kind !== "meta" || !side) break;
      side.push(r);
    }
    const n = Math.max(left.length, right.length);
    for (let k = 0; k < n; k++) pairs.push({ left: left[k] ?? EMPTY, right: right[k] ?? EMPTY });
  }
  return pairs;
}
