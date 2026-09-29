// Pure logic behind /findings — no React, no DOM.
import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  applyLenses,
  buildRepoLookup,
  clearFiltersPatch,
  ellipsisTruncate,
  emptyStateMessage,
  foldRepeats,
  groupFindings,
  headline,
  locationText,
  matchesSearch,
  middleTruncateLocation,
  repoPrLabel,
  repositoriesOf,
  shortFingerprint,
  sortFindings,
  summarize,
  NO_VALUE,
} from "@/components/routes/findings-list/format";
import { lensActive, serverFilters } from "@/components/routes/findings-list/use-findings-view";
import type { FindingsView } from "@/components/routes/findings-list/types";
import { FINDINGS, F1, F2, F3, F4, F5, F6, F7 } from "../../data/sample-corpus";

const VIEW: FindingsView = {
  status: "published",
  severity_min: null,
  proof_status: [],
  blocking: null,
  repository: null,
  pr_number: null,
  review_id: null,
  fingerprint: null,
  q: null,
  specialist: null,
  sort: "newest",
  group: "none",
};

describe("locationText / middleTruncateLocation", () => {
  it("joins file_path:start_line, or the bare path with no line", () => {
    expect(locationText("app/billing/charge.py", 41)).toBe("app/billing/charge.py:41");
    expect(locationText("app/billing/charge.py", null)).toBe("app/billing/charge.py");
  });

  it("keeps the filename:line whole and eats only the directory prefix", () => {
    const out = middleTruncateLocation("app/billing/very/deeply/nested/module/charge.py", 41, 34);
    expect(out.length).toBeLessThanOrEqual(34);
    expect(out.endsWith("charge.py:41")).toBe(true);
    expect(out).toContain("…");
    expect(middleTruncateLocation("a/b.py", 3, 34)).toBe("a/b.py:3");
  });

  it("falls back to a plain middle-ellipsis when even the filename:line overflows", () => {
    const out = middleTruncateLocation("a".repeat(60) + ".py", 999, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toContain("…");
  });
});

describe("shortFingerprint / ellipsisTruncate", () => {
  it("prints the first 8 hex chars, or the dash", () => {
    expect(shortFingerprint("a91f3c2e4b7d4e19")).toBe("a91f3c2e");
    expect(shortFingerprint(null)).toBe(NO_VALUE);
  });
  it("never bare-cuts a value printed as prose", () => {
    expect(ellipsisTruncate("doesnotexist12345", 8)).toBe("doesnote…");
    expect(ellipsisTruncate("short", 8)).toBe("short");
  });
});

describe("the review join (a Finding carries no repository field)", () => {
  it("keys by review_id and carries the PR's number and title", () => {
    expect(repoPrLabel({ owner: "acme", name: "checkout-service" }, 4821)).toBe("acme/checkout-service#4821");
    const lookup = buildRepoLookup([
      { review_id: "rev-1", repository: { owner: "acme", name: "ledger" }, pull_request: { number: 33, title: "Round payouts" } },
      { review_id: "rev-2", repository: { owner: "acme", name: "identity-gateway" }, pull_request: { number: 7 } },
      { review_id: "rev-3", repository: { owner: "acme", name: "ledger" }, pull_request: { number: 34 } },
    ]);
    expect(lookup.get("rev-1")).toEqual({ label: "acme/ledger#33", repository: "acme/ledger", name: "ledger", prNumber: 33, prTitle: "Round payouts" });
    expect(lookup.get("rev-2")?.prTitle).toBeNull();
    expect(repositoriesOf(lookup)).toEqual(["acme/identity-gateway", "acme/ledger"]);
  });
});

describe("view → API filters", () => {
  it("status=all is the absence of a status; everything else passes through", () => {
    expect(serverFilters({ ...VIEW, status: "all" }).status).toBeNull();
    expect(serverFilters(VIEW).status).toBe("published");
    expect(serverFilters({ ...VIEW, proof_status: [] }).proof_status).toBeNull();
    expect(serverFilters({ ...VIEW, severity_min: "high", blocking: true })).toMatchObject({ severity_min: "high", blocking: true });
  });

  it("a lens is anything the API cannot do: search, specialist, a re-sort, a grouping", () => {
    expect(lensActive(VIEW)).toBe(false);
    expect(lensActive({ ...VIEW, q: "  " })).toBe(false);
    expect(lensActive({ ...VIEW, q: "charge" })).toBe(true);
    expect(lensActive({ ...VIEW, specialist: "bugs" })).toBe(true);
    expect(lensActive({ ...VIEW, sort: "severity" })).toBe(true);
    expect(lensActive({ ...VIEW, group: "file" })).toBe(true);
  });
});

describe("activeFilterChips / emptyStateMessage", () => {
  it("is empty with nothing set, and the empty state names the segment", () => {
    expect(activeFilterChips(VIEW)).toEqual([]);
    expect(emptyStateMessage(VIEW)).toBe("No published findings yet.");
    expect(emptyStateMessage({ ...VIEW, status: "all" })).toBe("Witness has not raised a finding yet.");
  });

  it("names every active filter in a fixed order, each with a patch that clears only itself", () => {
    const chips = activeFilterChips({ ...VIEW, blocking: true, proof_status: ["proven", "disproven"], severity_min: "high" });
    expect(chips.map((c) => c.key)).toEqual(["severity_min", "proof_status", "blocking"]);
    expect(chips[0]).toMatchObject({ text: "severity ≥ high", clear: { severity_min: null } });
    expect(chips[1].text).toBe("proof: proven, refuted");
    expect(emptyStateMessage({ ...VIEW, severity_min: "high", proof_status: ["proven"], blocking: true })).toBe("Nothing matches severity ≥ high + proof: proven + blocking only.");
  });

  it("marks deep-link identity filters as chip-only (they have no pill of their own)", () => {
    const chips = activeFilterChips({ ...VIEW, review_id: "4e8b1d0c-7a2f", pr_number: 42, fingerprint: "70f2459184", blocking: false });
    expect(chips.filter((c) => c.shownOn === "chip").map((c) => c.key)).toEqual(["blocking", "pr_number", "review_id", "fingerprint"]);
  });

  it("never double-punctuates a message ending in an ellipsis", () => {
    expect(emptyStateMessage({ ...VIEW, fingerprint: "doesnotexist12345" })).toBe("Nothing matches fingerprint doesnote…");
  });

  it("clearFiltersPatch clears every filter and lens but not the segment, sort or grouping", () => {
    const patch = clearFiltersPatch();
    expect(Object.values(patch).every((v) => v === null)).toBe(true);
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("sort");
  });
});

describe("headline", () => {
  it("is two sentences ending in periods, the second scoped to the first", () => {
    expect(headline("published", 89, 25)).toEqual({ title: "89 findings on your PRs.", soft: "25 of them proven." });
    expect(headline("published", 1, 0)).toEqual({ title: "1 finding on your PRs.", soft: "None of them proven yet." });
    expect(headline("published", 3, 3).soft).toBe("All of them proven.");
    expect(headline("disproven", 5, 0).title).toBe("5 claims Witness refuted.");
    expect(headline("all", 1284, undefined)).toEqual({ title: "1,284 findings raised.", soft: null });
  });

  it("says 'match' under a filter, so a search never claims the PRs have nothing on them", () => {
    expect(headline("published", 15, 15, true)).toEqual({ title: "15 published findings match.", soft: "All of them proven." });
    expect(headline("published", 0, 0, true)).toEqual({ title: "No published findings match.", soft: null });
    expect(headline("all", 1, 0, true).title).toBe("1 finding matches.");
  });
});

describe("foldRepeats — one row per fingerprint per repository", () => {
  const lookup = new Map([
    ["run-2", { label: "acme/web#1135", repository: "acme/web", name: "web", prNumber: 1135, prTitle: null }],
    ["run-1", { label: "acme/web#1135", repository: "acme/web", name: "web", prNumber: 1135, prTitle: null }],
    ["run-9", { label: "acme/api#7", repository: "acme/api", name: "api", prNumber: 7, prTitle: null }],
  ]);
  it("keeps the first (latest, in the API's newest-first order) occurrence of a fingerprint in a repository", () => {
    const latest = { ...F1, id: "latest", review_id: "run-2", fingerprint: "fp-a" };
    const older = { ...F1, id: "older", review_id: "run-1", fingerprint: "fp-a" };
    const otherRepo = { ...F1, id: "other-repo", review_id: "run-9", fingerprint: "fp-a" };
    expect(foldRepeats([latest, older, otherRepo], lookup).map((f) => f.id)).toEqual(["latest", "other-repo"]);
  });

  it("folds the same fingerprint raised again on a later PR of the same repository", () => {
    const next = new Map(lookup);
    next.set("run-3", { label: "acme/web#1136", repository: "acme/web", name: "web", prNumber: 1136, prTitle: null });
    const onNewer = { ...F1, id: "newer-pr", review_id: "run-3", fingerprint: "fp-b" };
    const onOlder = { ...F1, id: "older-pr", review_id: "run-1", fingerprint: "fp-b" };
    expect(foldRepeats([onNewer, onOlder], next).map((f) => f.id)).toEqual(["newer-pr"]);
  });
  it("never folds findings without a fingerprint", () => {
    const a = { ...F1, id: "a", review_id: "run-2", fingerprint: null };
    const b = { ...F1, id: "b", review_id: "run-1", fingerprint: null };
    expect(foldRepeats([a, b], lookup)).toHaveLength(2);
  });
});

describe("lenses", () => {
  it("search matches title, path, symbol, rule and fingerprint prefix, every term", () => {
    const f = { ...F1, title: "charge() dereferences a None currency" };
    expect(matchesSearch(f, "charge none")).toBe(true);
    expect(matchesSearch(f, "checkout.py")).toBe(true);
    expect(matchesSearch(f, "create_session")).toBe(true);
    expect(matchesSearch(f, "unguarded")).toBe(true);
    expect(matchesSearch(f, "ledger")).toBe(false);
    expect(matchesSearch(f, "")).toBe(true);
  });

  it("severity sort puts blocking first, then score; newest keeps the API order; oldest reverses it", () => {
    expect(sortFindings(FINDINGS, "severity").map((f) => f.id)).toEqual([F1, F3, F7, F4, F2, F5, F6].map((f) => f.id));
    expect(sortFindings(FINDINGS, "newest")).toEqual(FINDINGS);
    expect(sortFindings(FINDINGS, "oldest")[0]).toBe(F7);
  });

  it("specialist narrows; the result is sorted by the view's sort", () => {
    const rows = FINDINGS.map((f, i) => ({ ...f, specialist: i % 2 ? "security" : "bugs" }));
    expect(applyLenses(rows, { q: null, specialist: "security", sort: "newest" }).every((f) => f.specialist === "security")).toBe(true);
  });

  it("groups by PR or by file in first-appearance order", () => {
    const byFile = groupFindings([F1, F2, { ...F3, location: { ...F3.location, file_path: "app/other.py" } }], "file", new Map());
    expect(byFile.map((g) => [g.label, g.rows.length])).toEqual([
      ["app/checkout.py", 2],
      ["app/other.py", 1],
    ]);
    const byPr = groupFindings([F1, F4], "pr", new Map());
    expect(byPr).toHaveLength(2);
    expect(byPr[0].label).toBe(`Run ${F1.review_id.slice(0, 8)}`);
  });
});

describe("summarize", () => {
  it("counts bands, the proof split and blocking over a set of rows", () => {
    const s = summarize(FINDINGS);
    expect(s.total).toBe(7);
    expect(s.bands).toEqual({ critical: 1, high: 2, medium: 1, low: 1, info: 1 });
    expect(s.unscored).toBe(1);
    expect(s.proof).toEqual({ proven: 2, disproven: 1, inconclusive: 1, skipped_no_env: 1, not_attempted: 2, not_applicable: 0 });
    expect(s.blocking).toBe(1);
  });
});
