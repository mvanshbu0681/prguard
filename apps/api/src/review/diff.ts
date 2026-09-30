import type { PrFile } from "../github/pr.ts";

export type DiffLine = { kind: "add" | "del" | "ctx"; text: string; oldNo: number | null; newNo: number | null };
export type Hunk = { header: string; oldStart: number; newStart: number; lines: DiffLine[] };

export type FileDiff = {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  hasPatch: boolean;
  hunks: Hunk[];
};

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

export function parsePatch(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      oldNo = Number(header[1]);
      newNo = Number(header[2]);
      current = { header: raw, oldStart: oldNo, newStart: newNo, lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current || raw.startsWith("\\")) continue;
    const marker = raw[0];
    const text = raw.slice(1);
    if (marker === "+") current.lines.push({ kind: "add", text, oldNo: null, newNo: newNo++ });
    else if (marker === "-") current.lines.push({ kind: "del", text, oldNo: oldNo++, newNo: null });
    else current.lines.push({ kind: "ctx", text, oldNo: oldNo++, newNo: newNo++ });
  }
  return hunks;
}

export function toFileDiffs(files: PrFile[]): FileDiff[] {
  return files.map((f) => ({
    path: f.filename,
    previousPath: f.previous_filename ?? null,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    hasPatch: Boolean(f.patch),
    hunks: f.patch ? parsePatch(f.patch) : [],
  }));
}

/** New-file line numbers inside the diff (added or context), mapped to their hunk index. */
export function commentableLines(file: FileDiff): Map<number, number> {
  const lines = new Map<number, number>();
  file.hunks.forEach((hunk, i) => {
    for (const line of hunk.lines) if (line.newNo !== null) lines.set(line.newNo, i);
  });
  return lines;
}

/** Text of each new-file line visible in the diff. */
export function newLineText(file: FileDiff): Map<number, string> {
  const text = new Map<number, string>();
  for (const hunk of file.hunks) for (const line of hunk.lines) if (line.newNo !== null) text.set(line.newNo, line.text);
  return text;
}

export function addedLines(file: FileDiff): Set<number> {
  const lines = new Set<number>();
  for (const hunk of file.hunks) for (const line of hunk.lines) if (line.kind === "add" && line.newNo !== null) lines.add(line.newNo);
  return lines;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Renders a file diff with the new-file line number on every kept line, which is what reviewers
 * cite. With `focus`, only added lines in the set are marked `+`; other added lines read as context.
 */
export function renderFile(file: FileDiff, opts: { hunks?: Hunk[]; focus?: Set<number> } = {}): string {
  const status = file.previousPath ? `renamed from ${file.previousPath}` : file.status;
  const out = [`FILE: ${file.path} (${status}, +${file.additions} -${file.deletions})`];
  for (const hunk of opts.hunks ?? file.hunks) {
    out.push(hunk.header);
    for (const line of hunk.lines) {
      const num = line.newNo === null ? "" : String(line.newNo);
      let marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
      if (marker === "+" && opts.focus && line.newNo !== null && !opts.focus.has(line.newNo)) marker = " ";
      out.push(`${marker}${num.padStart(6)} | ${line.text}`);
    }
  }
  return out.join("\n");
}
