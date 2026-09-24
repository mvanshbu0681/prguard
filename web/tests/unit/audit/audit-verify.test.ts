// OWNER: t6 (wave 2). eventHash / verifyWindow against the fixture corpus, and the
// tamper case the brief requires: "a one-character payload edit breaks at the right seq".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLosslessJson } from "@/api/lossless";
import { auditHashDocument } from "@/lib/canonical-json";
import { type ChainVerifyItem, eventHash, firstDifferingNibble, verifyWindow } from "@/lib/audit-verify";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "..", "public", "fixtures");

function readFixture(path: string): unknown {
  return parseLosslessJson(readFileSync(join(FIXTURES_DIR, path), "utf8"));
}

interface RawItem {
  seq: number;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  payload: unknown;
  created_at: string;
  tenant_id: string;
  event_hash: string;
  prev_hash: string | null;
}

function toVerifyItem(item: RawItem, overridePayload?: unknown): ChainVerifyItem {
  const document = auditHashDocument({ ...item, payload: (overridePayload ?? item.payload) as Record<string, unknown> });
  return { seq: item.seq, prevHash: item.prev_hash, expectedHash: item.event_hash, document };
}

describe("eventHash — cross-language vectors", () => {
  const vectors = readFixture("audit/vectors.json") as {
    items: { name: string; document: unknown; prev_hash: string | null; hash: string }[];
  };

  for (const vector of vectors.items) {
    it(`hashes: ${vector.name}`, async () => {
      expect(await eventHash(vector.prev_hash, vector.document)).toBe(vector.hash);
    });
  }

  it("treats a null prev_hash the same as an empty string (genesis)", async () => {
    const document = { a: 1 };
    expect(await eventHash(null, document)).toBe(await eventHash("", document));
  });
});

describe("verifyWindow — the full audit corpus (audit/events.json)", () => {
  const file = readFixture("audit/events.json") as { items: RawItem[]; chain: { checked: number; verified: boolean } };

  it("verifies every one of the 1,000+ events, matching the fixture's own chain verdict", async () => {
    const items = file.items.map((item) => toVerifyItem(item));
    const result = await verifyWindow(items);
    expect(result.checked).toBe(file.items.length);
    expect(result.verified).toBe(true);
    expect(result.brokenAtSeq).toBeNull();
    expect(result.checked).toBe(file.chain.checked);
    expect(result.verified).toBe(file.chain.verified);
  });

  it("recomputes every hash exactly", async () => {
    const items = file.items.slice(0, 25).map((item) => toVerifyItem(item));
    const result = await verifyWindow(items);
    for (let i = 0; i < items.length; i += 1) {
      expect(result.results[i].computed).toBe(items[i].expectedHash);
      expect(result.results[i].expected).toBe(items[i].expectedHash);
    }
  });

  it("verifies a short marketing-sized window around the tamper-demo seq (1428) on its own", async () => {
    const window = file.items.filter((item) => item.seq >= 1425 && item.seq <= 1430).map((item) => toVerifyItem(item));
    expect(window).toHaveLength(6);
    const result = await verifyWindow(window);
    expect(result.verified).toBe(true);
    expect(result.checked).toBe(6);
  });

  it("a one-character payload edit breaks at the right seq", async () => {
    const raw = file.items.find((item) => item.seq === 1428)!;
    const original = raw.payload as { severity_score: unknown };
    const editedPayload = { ...(raw.payload as Record<string, unknown>), severity_score: 0.8 };
    expect(String(original.severity_score)).not.toBe("0.8");

    const window = file.items
      .filter((item) => item.seq >= 1425 && item.seq <= 1430)
      .map((item) => toVerifyItem(item, item.seq === 1428 ? editedPayload : undefined));

    const result = await verifyWindow(window);
    expect(result.verified).toBe(false);
    expect(result.brokenAtSeq).toBe(1428);
    const row = result.results.find((r) => r.seq === 1428)!;
    expect(row.computed).not.toBe(row.expected);
  });

  it("editing a row leaves rows before it, and its own linkage-independent per-row check after it, unaffected", async () => {
    const raw = file.items.find((item) => item.seq === 1428)!;
    const editedPayload = { ...(raw.payload as Record<string, unknown>), severity_score: 0.8 };
    const window = file.items
      .filter((item) => item.seq >= 1425 && item.seq <= 1430)
      .map((item) => toVerifyItem(item, item.seq === 1428 ? editedPayload : undefined));

    const result = await verifyWindow(window);
    const before = result.results.filter((r) => r.seq < 1428);
    for (const row of before) expect(row.computed).toBe(row.expected);
  });

  it("an edited row's own broken hash does not falsely report a broken prev_hash link", async () => {
    // `linked` must answer "does this row's prevHash still point at its neighbour's hash"
    // independently of whether THIS row's own payload was tampered — editing only the
    // payload (never prev_hash) must never show "prev_hash no longer links to the row
    // above", because it didn't.
    const raw = file.items.find((item) => item.seq === 1428)!;
    const editedPayload = { ...(raw.payload as Record<string, unknown>), severity_score: 0.8 };
    const window = file.items
      .filter((item) => item.seq >= 1425 && item.seq <= 1430)
      .map((item) => toVerifyItem(item, item.seq === 1428 ? editedPayload : undefined));

    const result = await verifyWindow(window);
    const editedRow = result.results.find((r) => r.seq === 1428)!;
    expect(editedRow.computed).not.toBe(editedRow.expected); // its own hash is broken
    expect(editedRow.linked).toBe(true); // but its prev_hash pointer is still exactly right
    const nextRow = result.results.find((r) => r.seq === 1429)!;
    expect(nextRow.linked).toBe(true); // and the row after it still links to it correctly
  });

  it("no linkage is asserted across a gap (a filtered/non-contiguous window)", async () => {
    const window = [file.items.find((i) => i.seq === 10)!, file.items.find((i) => i.seq === 50)!].map((item) => toVerifyItem(item));
    const result = await verifyWindow(window);
    expect(result.verified).toBe(true);
    expect(result.results[1].linked).toBe(true); // vacuous: not a seq-adjacent neighbour
  });
});

describe("firstDifferingNibble", () => {
  it("finds the first differing hex character", () => {
    expect(firstDifferingNibble("a91f3c2e4d81b0c7", "a91f3c2e4d81b0c7")).toBeNull();
    expect(firstDifferingNibble("a91f3c2e4d81b0c7", "4d81b0c7a91f3c2e")).toBe(0);
    expect(firstDifferingNibble("a91f3c2e4d81b0c7", "a91f3c2f4d81b0c7")).toBe(7);
  });
});
