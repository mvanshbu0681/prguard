// The ledger's joins and posture summary (pure, no React).
import { describe, expect, it } from "vitest";
import { buildEntries, findingsBySuppression, indexAudit, matchesSearch, summarize } from "@/components/routes/suppressions/ledger-model";
import type { Finding, SuppressionItem } from "@/lib/api-types";
import { F5, SUPPRESSIONS } from "@/lib/fixture-sample";

const NOW = Date.parse("2026-09-20T00:00:00Z");

describe("findingsBySuppression", () => {
  it("keeps the newest finding per suppression and counts every occurrence", () => {
    const older: Finding = { ...F5, id: "older", title: "old title", created_at: "2026-09-01T00:00:00Z" };
    const map = findingsBySuppression([older, F5]);
    const joined = map.get("s1000000-0000-4000-8000-000000000001")!;
    expect(joined.id).toBe(F5.id);
    expect(joined.title).toBe(F5.title);
    expect(joined.occurrences).toBe(2);
    expect(joined.fingerprint).toBe(F5.fingerprint);
  });
  it("ignores findings that were never suppressed", () => {
    expect(findingsBySuppression([{ ...F5, suppression: null }]).size).toBe(0);
  });
});

describe("indexAudit", () => {
  it("maps suppression ids to the seq that created, revoked or break-glassed them", () => {
    const index = indexAudit([
      { seq: 22, event_type: "suppression.created", actor_id: "dmitri-k", payload: { suppression_id: "a" }, created_at: "2026-09-01T00:00:00Z" },
      { seq: 804, event_type: "suppression.revoked", actor_id: "sana-q", payload: { suppression_id: "a" }, created_at: "2026-09-10T00:00:00Z" },
      { seq: 1384, event_type: "override.break_glass", actor_id: "sana-q", payload: { suppression_id: "b" }, created_at: "2026-09-22T00:00:00Z" },
      { seq: 9, event_type: "gate.evaluated", actor_id: "gate", payload: { conclusion: "success" }, created_at: "2026-09-01T00:00:00Z" },
    ]);
    expect(index.created.get("a")?.seq).toBe(22);
    expect(index.revoked.get("a")).toEqual({ seq: 804, actor: "sana-q", at: "2026-09-10T00:00:00Z" });
    expect(index.breakGlass.get("b")?.seq).toBe(1384);
    expect(index.created.size + index.revoked.size + index.breakGlass.size).toBe(3);
  });
});

describe("summarize", () => {
  const withExpiry: SuppressionItem = { ...SUPPRESSIONS[0]!, suppression_id: "soon", expires_at: "2026-10-01T00:00:00Z", category: "security", created_at: "2026-09-19T00:00:00Z" };
  const entries = buildEntries([...SUPPRESSIONS, withExpiry], NOW);
  const s = summarize(entries, NOW);

  it("counts states and the findings silenced, overall and right now", () => {
    expect([s.active, s.expired, s.revoked]).toEqual([3, 1, 1]);
    expect(s.silenced).toBe(1 + 4 + 0 + 9 + 1);
    expect(s.silencedNow).toBe(1 + 9 + 1);
  });
  it("flags open-ended suppressions and the ones about to lapse, soonest first", () => {
    expect(s.openEnded).toBe(2);
    expect(s.expiringSoon.map((e) => e.item.suppression_id)).toEqual(["soon"]);
    expect(s.expiringSoon[0]!.expiresInDays).toBe(11);
    expect(s.securityActive).toBe(1);
  });
  it("lists every scope narrowest first, zero or not", () => {
    expect(s.byScope.map((c) => c.key)).toEqual(["line", "file", "pattern", "repo", "tenant"]);
    expect(s.byScope.find((c) => c.key === "tenant")!.count).toBe(1);
    expect(s.byScope.find((c) => c.key === "line")!.count).toBe(0); // the line row is revoked
  });
  it("bins creations into weeks ending now, oldest first", () => {
    // Created 09-19 and 09-16 (this week), 09-10 (last week), 09-05 and 09-01 (two weeks back), seen from 09-20.
    expect(s.weekly).toEqual([0, 0, 0, 2, 1, 2]);
  });
  it("ranks suppressors by how many they created", () => {
    expect(s.suppressors[0]).toEqual({ key: "vansh.m", count: 4 });
  });
});

describe("matchesSearch", () => {
  const [entry] = buildEntries([SUPPRESSIONS[0]!], NOW, { findings: findingsBySuppression([F5]) });
  it("matches the reason, the rule, the path, the person and the joined finding", () => {
    for (const q of ["vendored", "UNGUARDED_none", "vendor/**", "vansh", F5.title.slice(0, 10)]) expect(matchesSearch(entry!, q)).toBe(true);
    expect(matchesSearch(entry!, "nothing-like-this")).toBe(false);
    expect(matchesSearch(entry!, "   ")).toBe(true);
  });
});
