// OWNER: d2 (wave 3). Pure logic behind /findings — no React, no DOM.
import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  buildRepoLookup,
  ellipsisTruncate,
  emptyStateMessage,
  findingScoreText,
  findingsProvenanceSource,
  locationText,
  middleTruncateLocation,
  relativeAge,
  repoPrLabel,
  shortFingerprint,
  toSeverityWeights,
  NO_VALUE,
} from "@/components/routes/findings-list/format";
import type { FindingUrlFilters } from "@/components/routes/findings-list/types";

const NO_FILTERS: FindingUrlFilters = {
  review_id: null,
  repository: null,
  pr_number: null,
  fingerprint: null,
  status: null,
  severity_min: null,
  blocking: null,
  proof_status: [],
};

describe("locationText / middleTruncateLocation", () => {
  it("joins file_path:start_line, or the bare path with no line", () => {
    expect(locationText("app/billing/charge.py", 41)).toBe("app/billing/charge.py:41");
    expect(locationText("app/billing/charge.py", null)).toBe("app/billing/charge.py");
  });

  it("returns the full string untouched when it already fits", () => {
    expect(middleTruncateLocation("a/b.py", 3, 34)).toBe("a/b.py:3");
  });

  it("keeps the filename:line whole and eats only the directory prefix", () => {
    const out = middleTruncateLocation("app/billing/very/deeply/nested/module/charge.py", 41, 34);
    expect(out.length).toBeLessThanOrEqual(34);
    expect(out.endsWith("charge.py:41")).toBe(true);
    expect(out).toContain("…");
  });

  it("falls back to a plain middle-ellipsis when even the filename:line overflows the budget", () => {
    const longName = "a".repeat(60) + ".py";
    const out = middleTruncateLocation(longName, 999, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out).toContain("…");
  });
});

describe("shortFingerprint / ellipsisTruncate", () => {
  it("prints the first 8 hex chars, no ellipsis — the table column's own rule", () => {
    expect(shortFingerprint("a91f3c2e4b7d4e19")).toBe("a91f3c2e");
    expect(shortFingerprint("a91f3c2e")).toBe("a91f3c2e");
    expect(shortFingerprint(null)).toBe(NO_VALUE);
    expect(shortFingerprint(undefined)).toBe(NO_VALUE);
  });

  it("ellipsisTruncate never bare-cuts a value printed as prose", () => {
    expect(ellipsisTruncate("doesnotexist12345", 8)).toBe("doesnote…");
    expect(ellipsisTruncate("short", 8)).toBe("short");
  });
});

describe("relativeAge", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");

  it("steps through the compact units", () => {
    expect(relativeAge(new Date(now - 30_000).toISOString(), now)).toBe("now");
    expect(relativeAge(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5m");
    expect(relativeAge(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3h");
    expect(relativeAge(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("2d");
    expect(relativeAge(new Date(now - 40 * 86_400_000).toISOString(), now)).toBe("1mo");
    expect(relativeAge(new Date(now - 400 * 86_400_000).toISOString(), now)).toBe("1y");
  });

  it("never invents a value for garbage input", () => {
    expect(relativeAge("not-a-date", now)).toBe(NO_VALUE);
  });
});

describe("repoPrLabel / buildRepoLookup — the review_id join (Finding carries no repository field)", () => {
  it("formats owner/name#pr", () => {
    expect(repoPrLabel({ owner: "acme", name: "checkout-service" }, 4821)).toBe("acme/checkout-service#4821");
  });

  it("keys the lookup by review_id, the only field Finding shares with a review", () => {
    const lookup = buildRepoLookup([
      { review_id: "rev-1", repository: { owner: "acme", name: "ledger" }, pull_request: { number: 33 } },
      { review_id: "rev-2", repository: { owner: "acme", name: "identity-gateway" }, pull_request: { number: 7 } },
    ]);
    expect(lookup.get("rev-1")).toEqual({ label: "acme/ledger#33", repository: "acme/ledger" });
    expect(lookup.get("rev-2")?.label).toBe("acme/identity-gateway#7");
    expect(lookup.get("missing")).toBeUndefined();
  });
});

describe("toSeverityWeights", () => {
  it("passes the weights object through (a type-level acknowledgement, not a runtime transform)", () => {
    const weights = { path_sensitivity: 0.25, reachability: 0.2, blast_radius: 0.15, coverage_gap: 0.15, proof_confidence: 0.15, churn: 0.1 };
    expect(toSeverityWeights(weights)).toBe(weights);
  });
});

describe("findingScoreText", () => {
  it("prints 3 decimals, or the dash for a finding never scored", () => {
    expect(findingScoreText({ severity: { score: 0.81 } as never })).toBe("0.810");
    expect(findingScoreText({ severity: null })).toBe(NO_VALUE);
  });
});

describe("activeFilterChips / emptyStateMessage — the URL is the only source of truth", () => {
  it("is empty when no filter is set", () => {
    expect(activeFilterChips(NO_FILTERS)).toEqual([]);
    expect(emptyStateMessage(NO_FILTERS)).toBe("No findings in this corpus.");
  });

  it("names every active filter, in a fixed order, each with a patch that clears only itself", () => {
    const filters: FindingUrlFilters = {
      ...NO_FILTERS,
      severity_min: "high",
      proof_status: ["proven"],
      blocking: true,
    };
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.key)).toEqual(["severity_min", "proof_status", "blocking"]);
    expect(chips[0]).toEqual({ key: "severity_min", text: "severity ≥ high", clear: { severity_min: null } });
    expect(chips[1].text).toBe("proof: proven");
    expect(chips[2].text).toBe("blocking only");
  });

  it("distinguishes blocking=false from blocking absent", () => {
    expect(activeFilterChips({ ...NO_FILTERS, blocking: false })[0].text).toBe("non-blocking only");
    expect(activeFilterChips({ ...NO_FILTERS, blocking: null })).toEqual([]);
  });

  it("matches the brief's own deep-link scenario end to end", () => {
    const filters: FindingUrlFilters = { ...NO_FILTERS, severity_min: "high", proof_status: ["proven"], blocking: true };
    expect(emptyStateMessage(filters)).toBe("No findings match severity ≥ high + proof: proven + blocking only.");
  });

  it("never double-punctuates a message ending in an ellipsis (a truncated fingerprint or run id)", () => {
    const filters: FindingUrlFilters = { ...NO_FILTERS, fingerprint: "doesnotexist12345" };
    const msg = emptyStateMessage(filters);
    expect(msg.endsWith("….")).toBe(false);
    expect(msg).toBe("No findings match fingerprint: doesnotexist…");
  });
});

describe("findingsProvenanceSource", () => {
  it("names the bare endpoint with no filters", () => {
    expect(findingsProvenanceSource(NO_FILTERS)).toBe("GET /v1/findings");
  });

  it("prints every active filter as a query param, proof_status repeated", () => {
    const filters: FindingUrlFilters = { ...NO_FILTERS, severity_min: "high", proof_status: ["proven", "disproven"], blocking: true };
    expect(findingsProvenanceSource(filters)).toBe("GET /v1/findings?severity_min=high&blocking=true&proof_status=proven&proof_status=disproven");
  });
});
