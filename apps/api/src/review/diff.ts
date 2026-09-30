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

/** Cuts hunks down to windows of `radius` lines around the focus lines (for incremental reviews). */
export function windowHunks(hunks: Hunk[], focus: Set<number>, radius = 6): Hunk[] {
  const out: Hunk[] = [];
  for (const hunk of hunks) {
    const hits = hunk.lines.map((l, i) => (l.kind === "add" && l.newNo !== null && focus.has(l.newNo) ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) continue;
    const keep = hunk.lines.map((_, i) => hits.some((h) => Math.abs(h - i) <= radius));
    let start = -1;
    for (let i = 0; i <= hunk.lines.length; i++) {
      if (i < hunk.lines.length && keep[i]) {
        if (start < 0) start = i;
        continue;
      }
      if (start >= 0) {
        const lines = hunk.lines.slice(start, i);
        const first = lines.find((l) => l.newNo !== null)?.newNo ?? hunk.newStart;
        out.push({ header: `@@ excerpt from line ${first} @@`, oldStart: hunk.oldStart, newStart: first, lines });
        start = -1;
      }
    }
  }
  return out;
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

export type Chunk = { files: FileDiff[]; tokens: number };

function splitByHunks(file: FileDiff, maxTokens: number, focus: Set<number> | undefined, onCut: () => void): FileDiff[] {
  const pieces: FileDiff[] = [];
  let hunks: Hunk[] = [];
  let tokens = 0;
  for (const hunk of file.hunks) {
    let h = hunk;
    let t = estimateTokens(renderFile({ ...file, hunks: [h] }, { focus }));
    if (t > maxTokens) {
      // One hunk bigger than a whole chunk: review its start and report the file as partly unreviewed.
      const keep = Math.max(20, Math.floor((h.lines.length * maxTokens) / t));
      h = { ...h, lines: h.lines.slice(0, keep) };
      t = maxTokens;
      onCut();
    }
    if (tokens + t > maxTokens && hunks.length) {
      pieces.push({ ...file, hunks });
      hunks = [];
      tokens = 0;
    }
    hunks.push(h);
    tokens += t;
  }
  if (hunks.length) pieces.push({ ...file, hunks });
  return pieces;
}

/**
 * Packs files into chunks of at most `chunkTokens`, in the order given (callers sort by priority).
 * Files larger than a chunk are split at hunk boundaries. Files past `maxChunks` are returned as
 * not reviewed.
 */
export function packChunks(
  files: FileDiff[],
  opts: { chunkTokens: number; maxChunks: number; focus?: Map<string, Set<number>> },
): { chunks: Chunk[]; notReviewed: string[] } {
  const chunks: Chunk[] = [];
  const notReviewed: string[] = [];
  let current: Chunk = { files: [], tokens: 0 };

  for (const file of files) {
    const focus = opts.focus?.get(file.path);
    const whole = estimateTokens(renderFile(file, { focus }));
    const cut = () => {
      if (!notReviewed.includes(file.path)) notReviewed.push(file.path);
    };
    const pieces = whole > opts.chunkTokens ? splitByHunks(file, opts.chunkTokens, focus, cut) : [file];
    for (const piece of pieces) {
      const t = pieces.length === 1 ? whole : estimateTokens(renderFile(piece, { focus }));
      if (current.tokens + t > opts.chunkTokens && current.files.length) {
        chunks.push(current);
        current = { files: [], tokens: 0 };
      }
      if (chunks.length >= opts.maxChunks) {
        if (!notReviewed.includes(file.path)) notReviewed.push(file.path);
        continue;
      }
      current.files.push(piece);
      current.tokens += t;
    }
  }
  if (current.files.length && chunks.length < opts.maxChunks) chunks.push(current);
  return { chunks, notReviewed };
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
