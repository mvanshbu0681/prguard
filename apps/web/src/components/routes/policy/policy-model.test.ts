// The policy draft's pure logic: the gate recomputation must agree with the
// backend's own `blocking` flag, env export must be what config.py parses, and
// validation must reject exactly what config.py's startup validators reject.
import { describe, expect, it } from "vitest";
import findingsIndex from "@fixtures/findings/index.json";
import type { Finding } from "@/lib/api-types";
import {
  CONFIG_DEFAULTS,
  DRAFT_STORAGE_KEY,
  changedKeys,
  diff,
  envLines,
  formatWeight,
  gateImpact,
  livePolicy,
  readStoredDraft,
  sanitizeDraft,
  scoreUnder,
  validate,
  weightSum,
  writeStoredDraft,
} from "./policy-model";

const FINDINGS = (findingsIndex as unknown as { items: Finding[] }).items;

describe("gate recomputation", () => {
  it("with the live policy, reproduces every fixture finding's own blocking flag", () => {
    const live = livePolicy(null);
    const mismatched = FINDINGS.filter((f) => gateImpact([f], live).findings === 1 !== Boolean(f.blocking));
    expect(mismatched).toEqual([]);
    expect(gateImpact(FINDINGS, live).findings).toBe(FINDINGS.filter((f) => f.blocking).length);
  });

  it("recomputes every scored finding's score from its inputs and the weights", () => {
    for (const f of FINDINGS) {
      if (!f.severity) continue;
      expect(scoreUnder(f.severity.inputs as Record<string, number>, CONFIG_DEFAULTS.SEVERITY_WEIGHTS)).toBeCloseTo(f.severity.score, 3);
    }
  });

  it("lowering the block threshold can only add blocking findings", () => {
    const at = (b: "critical" | "high" | "medium") => gateImpact(FINDINGS, { ...CONFIG_DEFAULTS, BLOCK_MIN_SEVERITY: b }).findings;
    expect(at("critical")).toBeLessThanOrEqual(at("high"));
    expect(at("high")).toBeLessThanOrEqual(at("medium"));
  });
});

describe("validation mirrors config.py", () => {
  it("the defaults are valid", () => {
    expect(validate(CONFIG_DEFAULTS)).toEqual([]);
    expect(weightSum(CONFIG_DEFAULTS.SEVERITY_WEIGHTS)).toBe(1);
  });

  it("weights that do not sum to 1.0 are rejected", () => {
    const p = { ...CONFIG_DEFAULTS, SEVERITY_WEIGHTS: { ...CONFIG_DEFAULTS.SEVERITY_WEIGHTS, churn: 0.2 } };
    expect(validate(p).map((i) => i.key)).toContain("SEVERITY_WEIGHTS");
  });

  it("thresholds that do not rise strictly are rejected", () => {
    const p = { ...CONFIG_DEFAULTS, SEVERITY_BANDS: { low: 0.15, medium: 0.55, high: 0.55, critical: 0.75 } };
    expect(validate(p).map((i) => i.key)).toContain("SEVERITY_BANDS");
  });
});

describe("drafts and env export", () => {
  it("only changed keys count as changes", () => {
    const draft = { ...CONFIG_DEFAULTS, BLOCK_MIN_SEVERITY: "medium" as const, REVIEW_DRAFT_PRS: true };
    expect(changedKeys(CONFIG_DEFAULTS, draft)).toEqual(["BLOCK_MIN_SEVERITY", "REVIEW_DRAFT_PRS"]);
    expect(diff(CONFIG_DEFAULTS, draft)).toEqual({ BLOCK_MIN_SEVERITY: "medium", REVIEW_DRAFT_PRS: true });
  });

  it("exports the env var names and value forms config.py reads", () => {
    const draft = { ...CONFIG_DEFAULTS, PROOF_REQUIRE_BASELINE: false, GITHUB_DELIVERY_MODE: "dry_run" as const };
    expect(envLines(draft, ["PROOF_REQUIRE_BASELINE", "GITHUB_DELIVERY_MODE", "SEVERITY_WEIGHTS", "SEVERITY_BANDS"])).toEqual([
      "PROOF_REQUIRE_BASELINE=false",
      "GITHUB_DELIVERY_MODE=dry_run",
      'SEVERITY_WEIGHTS={"reachability":0.2,"blast_radius":0.15,"path_sensitivity":0.25,"coverage_gap":0.15,"churn":0.1,"proof_confidence":0.15}',
      'SEVERITY_BANDS={"critical":0.75,"high":0.55,"medium":0.35,"low":0.15}',
    ]);
  });

  it("live weights come from the finding, not the defaults", () => {
    const live = livePolicy({ reachability: 0.3, blast_radius: 0.1, path_sensitivity: 0.2, coverage_gap: 0.15, churn: 0.1, proof_confidence: 0.15 });
    expect(live.SEVERITY_WEIGHTS.reachability).toBe(0.3);
    expect(changedKeys(CONFIG_DEFAULTS, live)).toEqual(["SEVERITY_WEIGHTS"]);
  });

  it("formats weights with two decimals unless a third is real", () => {
    expect(formatWeight(0.25)).toBe("0.25");
    expect(formatWeight(0.417)).toBe("0.417");
  });
});

describe("the stored draft", () => {
  it("keeps only known keys with well-formed values", () => {
    expect(
      sanitizeDraft({
        BLOCK_MIN_SEVERITY: "medium",
        REVIEW_DRAFT_PRS: "yes",
        PROOF_TIMEOUT: 120,
        SEVERITY_BANDS: { low: 0.1, medium: 0.3 },
        EVIL: 1,
      }),
    ).toEqual({ BLOCK_MIN_SEVERITY: "medium", PROOF_TIMEOUT: 120 });
  });

  it("round-trips through storage, and clears the entry when there is nothing to keep", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    writeStoredDraft(storage, { saved: { REVIEW_DRAFT_PRS: true }, pending: { BLOCK_MIN_SEVERITY: "critical" } });
    expect(readStoredDraft(storage)).toEqual({ saved: { REVIEW_DRAFT_PRS: true }, pending: { BLOCK_MIN_SEVERITY: "critical" } });
    writeStoredDraft(storage, { saved: {}, pending: {} });
    expect(mem.has(DRAFT_STORAGE_KEY)).toBe(false);
  });

  it("a corrupt entry reads as no draft", () => {
    expect(readStoredDraft({ getItem: () => "{not json" })).toEqual({ saved: {}, pending: {} });
  });
});
