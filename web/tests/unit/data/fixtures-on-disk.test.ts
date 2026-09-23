// @vitest-environment node
// OWNER: t2a (wave 1). The server loaders and the resolver against the corpus
// that is actually on disk — stubs before t2b's generator runs, the generated
// corpus after. Every assertion holds in both states.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELIVERY_MODES, GATE_CONCLUSIONS, PROOF_STATUSES } from "@/lib/contracts";
import { DEMO_IDS, DEMO_RUN_PATH, DEMO_SHORT } from "@/lib/demo-ids";
import { createFixtureResolver, FixtureMissingError } from "@/lib/fixture-resolver";
import { FIXTURE_FILES } from "@/lib/fixture-types";
import * as fx from "@/lib/fixtures";

const root = join(process.cwd(), "public", "fixtures");
const generated = fx.isCorpusGenerated();

describe("the canonical demo identifiers (plan A10)", () => {
  it("derive every short form from manifest.json", () => {
    expect(DEMO_SHORT).toEqual({
      review: "4e8b1d0",
      provenFinding: "a91f3c2e",
      disprovenFinding: DEMO_IDS.disproven_finding_id.slice(0, 8),
      inconclusiveFinding: DEMO_IDS.inconclusive_finding_id.slice(0, 8),
      baseSha: "7c41a09",
      headSha: "9c2d4b1",
      repository: "acme/checkout-service",
      pullRequest: "acme/checkout-service#4821",
    });
    expect(DEMO_IDS).toMatchObject({ repro_test_path: "tests/test_repro_7e3f1a.py", failing_test: "test_charge_uses_account_currency", pr_number: 4821 });
    expect(DEMO_RUN_PATH).toBe(`/runs/${DEMO_IDS.demo_review_id}`);
    expect(fx.getManifest().ids).toEqual(DEMO_IDS);
  });
});

describe.runIf(!generated)("server loaders before the corpus is generated", () => {
  it("each names the stub file it cannot read", () => {
    const cases: [() => unknown, string][] = [
      [fx.getDemoResult, FIXTURE_FILES.reviewResult(DEMO_IDS.demo_review_id)],
      [fx.getDemoStatus, FIXTURE_FILES.reviewStatus(DEMO_IDS.demo_review_id)],
      [fx.getDemoProvenFinding, FIXTURE_FILES.findingsIndex],
      [() => fx.getFinding(DEMO_IDS.proven_finding_id), FIXTURE_FILES.findingsIndex],
      [fx.getAuditChain, FIXTURE_FILES.auditEvents],
      [fx.getAccuracy, FIXTURE_FILES.accuracyReport],
      [fx.getAccuracySeries, FIXTURE_FILES.accuracySeries],
      [fx.getCostSummary, FIXTURE_FILES.costSummary],
      [fx.getSuppressions, FIXTURE_FILES.suppressionsIndex],
      [fx.getVectors, FIXTURE_FILES.auditVectors],
      [fx.getAuditEventsText, FIXTURE_FILES.auditEvents],
    ];
    for (const [load, file] of cases) {
      expect(load).toThrow(fx.FixtureUnavailableError);
      expect(load).toThrow(file);
    }
  });
});

describe.runIf(generated)("server loaders over the generated corpus", () => {
  it("load the demo story", () => {
    expect(fx.getDemoResult().review_id).toBe(DEMO_IDS.demo_review_id);
    expect(fx.getDemoStatus().status).toBe("succeeded");
    expect(fx.getDemoProvenFinding().proof?.status).toBe("proven");
    expect(fx.getDemoDisprovenFinding().proof?.status).toBe("disproven");
    expect(fx.getAuditChain().chain.verified).toBe(true);
    expect(fx.getAuditEventsText()).toBe(readFileSync(join(root, FIXTURE_FILES.auditEvents), "utf8"));
  });

  it("covers every ProofStatus, DeliveryMode and GateConclusion at least once (plan T2 VERIFY)", () => {
    const findings = fx.getFindings();
    const proof = new Set(findings.map((f) => f.proof?.status ?? "not_attempted"));
    const delivery = new Set(findings.map((f) => f.delivery?.mode).filter(Boolean));
    const gates = new Set(fx.getReviewsIndex().items.map((r) => r.gate_conclusion).filter(Boolean));
    expect([...PROOF_STATUSES].filter((s) => !proof.has(s))).toEqual([]);
    expect([...DELIVERY_MODES].filter((m) => !delivery.has(m))).toEqual([]);
    expect([...GATE_CONCLUSIONS].filter((g) => !gates.has(g))).toEqual([]);
  });
});

describe("the resolver over the files on disk", () => {
  const resolver = createFixtureResolver({
    latency: 0,
    storage: null,
    hasher: null,
    pageParams: () => new URLSearchParams(),
    load: async (path) => {
      try {
        return readFileSync(join(root, path), "utf8");
      } catch {
        throw new FixtureMissingError(path);
      }
    },
  });
  const get = async (path: string) => {
    const res = await resolver(new Request(`http://localhost:8000${path}`));
    return { status: res.status, body: await res.json() };
  };

  it("answers every list route with its page shape", async () => {
    for (const path of ["/v1/findings", "/v1/suppressions", "/v1/audit", "/v1/reviews"]) {
      const r = await get(path);
      expect(r.status, path).toBe(200);
      expect(Array.isArray(r.body.items), path).toBe(true);
    }
  });

  it("serves the demo run and its proven finding once generated, a 404 envelope before", async () => {
    const status = await get(`/v1/reviews/${DEMO_IDS.demo_review_id}`);
    const finding = await get(`/v1/findings/${DEMO_IDS.proven_finding_id}`);
    const accuracy = await get("/v1/accuracy");
    if (generated) {
      expect(status.body.review_id).toBe(DEMO_IDS.demo_review_id);
      expect(finding.body.proof.status).toBe("proven");
      expect(accuracy.status).toBe(200);
    } else {
      expect(status.body.error).toMatchObject({ code: "REVIEW_NOT_FOUND", details: { review_id: DEMO_IDS.demo_review_id, fixture_stub: true } });
      expect(finding.body.error.code).toBe("FINDING_NOT_FOUND");
      expect(accuracy.body.error).toMatchObject({ code: "INTERNAL_ERROR", details: { fixture_stub: true } });
    }
  });
});
