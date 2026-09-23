// OWNER: t2a (wave 1). Hand-written — not produced by `npm run api:gen`.
//
// Opaque list cursors, byte-compatible with the backend (api/pagination.py at
// eeb1be8): urlsafe base64, padding stripped, of a small key document written
// with sorted keys and no whitespace. `eyJpZCI6ImYtOWMyZSJ9` is `{"id":"f-9c2e"}`.
// Pagination is keyset, not offset: a cursor names the last row of the previous
// page and the next page is every matching row that sorts after it, so a row that
// stops matching between two pages (a finding suppressed mid-scroll) neither
// skips nor repeats anything.

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Accepts the urlsafe and the standard alphabet, padded or not. */
function fromBase64(encoded: string): string {
  const normalised = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export type CursorKey = string | number;

/** Python's json.dumps(key, sort_keys=True, separators=(",", ":")), then urlsafe base64 without padding. */
export function encodeCursor(anchor: Record<string, CursorKey>): string {
  const sorted = Object.fromEntries(Object.entries(anchor).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return toBase64Url(JSON.stringify(sorted));
}

/** The decoded anchor, or null when the cursor is not base64 JSON of an object. */
export function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(fromBase64(cursor));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface KeysetPage<T> {
  items: T[];
  hasMore: boolean;
  /** Key of the last returned row when there is a next page. */
  nextKey: CursorKey | null;
}

/**
 * One page of `matching` (a subsequence of `ordered`, same order) after the row
 * keyed `after`. Returns null when `after` names no row in `ordered` — the
 * caller answers 422, as the backend does for a cursor whose anchor it cannot
 * find (findings, suppressions).
 */
export function keysetPage<T>(
  ordered: readonly T[],
  matching: readonly T[],
  keyOf: (row: T) => CursorKey,
  after: CursorKey | null,
  limit: number,
): KeysetPage<T> | null {
  let start = 0;
  if (after !== null) {
    const position = new Map<CursorKey, number>();
    ordered.forEach((row, i) => position.set(keyOf(row), i));
    const anchor = position.get(after);
    if (anchor === undefined) return null;
    start = matching.findIndex((row) => (position.get(keyOf(row)) ?? -1) > anchor);
    if (start === -1) start = matching.length;
  }
  return pageFrom(matching, start, limit, keyOf);
}

/** The audit trail's keyset: every row whose seq is greater than the cursor's (no anchor lookup, like the backend). */
export function seqPage<T extends { seq: number }>(matching: readonly T[], afterSeq: number | null, limit: number): KeysetPage<T> {
  const start = afterSeq === null ? 0 : matching.findIndex((row) => row.seq > afterSeq);
  return pageFrom(matching, start === -1 ? matching.length : start, limit, (row) => row.seq);
}

function pageFrom<T>(matching: readonly T[], start: number, limit: number, keyOf: (row: T) => CursorKey): KeysetPage<T> {
  const items = matching.slice(start, start + limit);
  const hasMore = start + limit < matching.length;
  return { items, hasMore, nextKey: hasMore && items.length ? keyOf(items[items.length - 1]!) : null };
}
