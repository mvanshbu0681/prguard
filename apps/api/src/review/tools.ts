import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { log } from "../log.ts";

const MAX_OUTPUT = 12_000;
const MAX_READ_LINES = 300;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_MATCHES = 40;
const MAX_FILES_SCANNED = 6000;
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "vendor", "coverage", "__pycache__", ".venv"]);

function clip(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…(output truncated)` : text;
}

/** Resolves a model-supplied path inside the snapshot, or null when it escapes it. */
export function insideRoot(root: string, path: string): string | null {
  const cleaned = (path ?? "").replace(/^\/+/, "").replace(/\\/g, "/");
  const full = resolve(root, cleaned);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return full;
}

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function* walk(root: string, dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* walk(root, join(dir, e.name));
    } else if (e.isFile()) {
      yield join(dir, e.name);
    }
  }
}

export function readFile(root: string, path: string, start?: number | null, end?: number | null): string {
  const full = insideRoot(root, path);
  if (!full) {
    log.warn({ path }, "tool refused a path outside the repository");
    return "Refused: path is outside the repository.";
  }
  if (!existsSync(full) || !statSync(full).isFile()) return `Not found: ${path}`;
  const buf = readFileSync(full);
  if (buf.length > MAX_FILE_BYTES || isBinary(buf)) return `Skipped: ${path} is binary or too large.`;
  const lines = buf.toString("utf8").split("\n");
  const from = Math.max(1, start ?? 1);
  const to = Math.min(lines.length, end ?? from + MAX_READ_LINES - 1, from + MAX_READ_LINES - 1);
  const body = lines
    .slice(from - 1, to)
    .map((l, i) => `${String(from + i).padStart(6)} | ${l}`)
    .join("\n");
  return clip(`${path} (lines ${from}-${to} of ${lines.length})\n${body}`);
}

export function searchCode(root: string, query: string, path?: string | null): string {
  const base = path ? insideRoot(root, path) : root;
  if (!base) return "Refused: path is outside the repository.";
  const needle = query.toLowerCase();
  if (needle.length < 2) return "Query too short.";
  const matches: string[] = [];
  let scanned = 0;
  for (const file of walk(root, base)) {
    if (++scanned > MAX_FILES_SCANNED || matches.length >= MAX_MATCHES) break;
    let buf: Buffer;
    try {
      if (statSync(file).size > MAX_FILE_BYTES) continue;
      buf = readFileSync(file);
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    const lines = buf.toString("utf8").split("\n");
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
      if (lines[i]!.toLowerCase().includes(needle)) {
        matches.push(`${relative(root, file).replace(/\\/g, "/")}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
      }
    }
  }
  return matches.length ? clip(matches.join("\n")) : `No matches for "${query}".`;
}

export function listFiles(root: string, path?: string | null): string {
  const dir = path ? insideRoot(root, path) : root;
  if (!dir) return "Refused: path is outside the repository.";
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return `Not a directory: ${path}`;
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !SKIP.has(e.name))
    .slice(0, 200)
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  return clip(entries.join("\n") || "(empty)");
}

/** Read-only tools confined to a repository snapshot. */
export function repoTools(root: string) {
  return {
    read_file: tool({
      description: "Read a file from the repository at the pull request's head commit. Returns numbered lines (max 300 per call).",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the repository root"),
        start_line: z.number().int().nullish(),
        end_line: z.number().int().nullish(),
      }),
      execute: async ({ path, start_line, end_line }) => readFile(root, path, start_line, end_line),
    }),
    search_code: tool({
      description: "Case-insensitive text search across the repository. Returns up to 40 matching lines as path:line: text.",
      inputSchema: z.object({
        query: z.string().describe("Literal text to find, e.g. a function name"),
        path: z.string().nullish().describe("Optional folder to limit the search"),
      }),
      execute: async ({ query, path }) => searchCode(root, query, path),
    }),
    list_files: tool({
      description: "List files and folders in a repository folder.",
      inputSchema: z.object({ path: z.string().nullish().describe("Folder relative to the root; omit for the root") }),
      execute: async ({ path }) => listFiles(root, path),
    }),
  };
}
