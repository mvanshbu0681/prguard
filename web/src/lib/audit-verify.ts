// OWNER: t6 (wave 2).
//
// The browser-side chain verifier (plan A8/A9; dashboard-blueprint §3c). `crypto.subtle`
// is available in every browser over https/localhost and in Node ≥19 (this repo runs
// Node 26 in tests — plan A1), so `eventHash` and `verifyWindow` run unmodified in both
// places. Callers gate on `<ChainRail>`'s four guards (brand-gaps §G) before ever calling
// this module from a component; the guards live in the component, not here, so this file
// stays a pure, engine-free verifier that a vitest test can exercise directly.
import { canonicalJson } from "./canonical-json";

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `sha256(prev_hash ‖ canonical_json(doc))` as lowercase hex — `audit.compute_event_hash`,
 *  minus the document assembly (`auditHashDocument` does that). `prevHash` is `null` for
 *  the chain's first event; the backend hashes `prev_hash or ""`. */
export async function eventHash(prevHash: string | null, doc: unknown): Promise<string> {
  const material = (prevHash ?? "") + canonicalJson(doc);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return toHex(digest);
}

/** One event in a verification window: the exact document `audit.compute_event_hash`
 *  hashed (`auditHashDocument`'s output, or an edited stand-in from the tamper control),
 *  its own recorded `prev_hash`, and the `event_hash` it is expected to equal. */
export interface ChainVerifyItem {
  seq: number;
  prevHash: string | null;
  expectedHash: string;
  document: unknown;
}

export interface ChainVerifyRow {
  seq: number;
  /** The event's recorded `event_hash` — never edited by the tamper control. */
  expected: string;
  /** `eventHash(item.prevHash, item.document)`, recomputed in the browser. */
  computed: string;
  /** `true` when this row is not the array's first item and its `seq` is not a neighbour
   *  of the previous item's (`seq - 1`) — linkage is only ever asserted between
   *  contiguous seqs (brand-gaps §2 ruling 14; backend `verify_chain`'s `_are_neighbours`).
   *  `false` means this row's `prevHash` does not equal the previous row's `expected`
   *  hash — the row after the row whose canonical_json was edited fails here even
   *  though its own per-row hash still checks out, because the chain no longer links to
   *  it (dashboard-blueprint §3c: "those events' hashes no longer chain"). */
  linked: boolean;
}

export interface ChainVerifyResult {
  verified: boolean;
  checked: number;
  /** The `seq` of the first row whose own hash, or linkage to its predecessor, failed to
   *  recompute; `null` when the whole window is intact. */
  brokenAtSeq: number | null;
  /** One row per input item, in the same order — every row is always computed (not just
   *  up to the first break), so an already-broken window can still be expanded row by row. */
  results: ChainVerifyRow[];
}

/** Recompute every hash in `items` and check the linkage between seq-contiguous
 *  neighbours (never across a gap — a filtered or windowed listing is not a deletion).
 *  Mirrors the backend's `audit.verify_chain`: a row's own hash always has to match its
 *  recorded `event_hash`; if it does, and it neighbours the previous row, that row's
 *  `prevHash` also has to match the previous row's recorded hash. `checked` is
 *  `items.length` — the size of whatever window the caller asked to verify (plan A9
 *  keeps that window small: never the whole chain). */
export async function verifyWindow(items: readonly ChainVerifyItem[]): Promise<ChainVerifyResult> {
  const computedHashes = await Promise.all(items.map((item) => eventHash(item.prevHash, item.document)));

  const results: ChainVerifyRow[] = [];
  let brokenAtSeq: number | null = null;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const computed = computedHashes[i];
    const ownHashIntact = computed === item.expectedHash;

    // `linked` is independent of `ownHashIntact` on purpose: it answers "does this row's
    // prevHash still point at its neighbour's hash", not "is this row valid overall" —
    // conflating the two would make an edited PAYLOAD (own hash breaks, pointer is still
    // fine) misreport as "prev_hash no longer links to the row above", which is simply
    // false and would mislead whoever reads it.
    const previous = i > 0 ? items[i - 1] : null;
    const contiguous = previous !== null && item.seq === previous.seq + 1;
    const linked = !contiguous || item.prevHash === previous.expectedHash;
    const intact = ownHashIntact && linked;

    results.push({ seq: item.seq, expected: item.expectedHash, computed, linked });
    if (!intact && brokenAtSeq === null) brokenAtSeq = item.seq;
  }

  return { verified: brokenAtSeq === null, checked: items.length, brokenAtSeq, results };
}

/** The first hex nibble at which `a` and `b` differ, or `null` if they are equal (one is a
 *  prefix of the other counts as differing at that shorter length). Drives the "first
 *  differing nibble" highlight in the broken row's expected/computed diff. */
export function firstDifferingNibble(a: string, b: string): number | null {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return null;
}
