// OWNER: T1b (wave 1). The /lab/t1b logic: hash and SHA forms (brand-gaps §D numeric
// style), the readout's parsing of computed styles, and the specimen data, which
// must come from the fixture manifest and the API contract — never typed by hand.
import { describe, expect, it } from "vitest";
import manifest from "@fixtures/manifest.json";
import { shortHash, shortSha } from "../../../app/(lab)/lab/t1b/format";
import { buildLabData, firstSuppressionId, responseCodes } from "../../../app/(lab)/lab/t1b/lab-data";
import { easeKey, splitList, toMs } from "../../../app/(lab)/lab/t1b/readout";

describe("hash and SHA forms", () => {
  it("prints a hash first-8 … last-4 and leaves short values alone", () => {
    expect(shortHash("a91f3c2e-4b7d-4e19-8c35-0d6f2a9b8b4d")).toBe("a91f3c2e…8b4d");
    expect(shortHash("7c41a09")).toBe("7c41a09");
  });

  it("prints a SHA at seven characters", () => {
    expect(shortSha("9c2d4b1f6a8e3c5d7b9f1a2e4c6d8b0f3a5c7e92")).toBe("9c2d4b1");
  });
});

describe("readout parsing", () => {
  it("compares timing functions by value, whatever the spelling", () => {
    expect(easeKey("cubic-bezier(0.2, 0, 0, 1)")).toBe(easeKey("cubic-bezier(.2,0,0,1)"));
    expect(easeKey(" LINEAR ")).toBe("linear");
  });

  it("splits a computed list on top-level commas only", () => {
    expect(splitList("background-color, cubic-bezier(0.2, 0, 0, 1), transform")).toEqual(["background-color", "cubic-bezier(0.2, 0, 0, 1)", "transform"]);
  });

  it("reads durations in either unit", () => {
    expect(toMs("0.12s")).toBe(120);
    expect(toMs("90ms")).toBe(90);
    expect(toMs("0.18s")).toBe(180);
  });
});

describe("specimen data", () => {
  const data = buildLabData();

  it("tells the one demo story from the binding ids (plan A10)", () => {
    expect(data.ids.provenFindingId).toBe(manifest.ids.proven_finding_id);
    expect(data.ids.baseSha.startsWith("7c41a09")).toBe(true);
    expect(data.ids.headSha.startsWith("9c2d4b1")).toBe(true);
    expect(data.ids.reproTestPath).toBe("tests/test_repro_7e3f1a.py");
    expect(data.ids.failingTest).toBe("test_charge_uses_account_currency");
  });

  it("takes enum values and status codes from the API contract", () => {
    expect(data.suppressScopes).toEqual(["line", "file", "pattern", "repo", "tenant"]);
    expect(data.filters.bands).toEqual(["critical", "high", "medium", "low", "info"]);
    expect(data.filters.proofStatuses).toContain("proven");
    expect(responseCodes("POST", "/v1/findings/{finding_id}/suppress")).toEqual([201, 422]);
    expect(data.endpoints.suppressCreated).toEqual({ method: "POST", path: `/v1/findings/${manifest.ids.proven_finding_id}/suppress`, status: 201 });
    expect(data.endpoints.suppressRejected.status).toBe(422);
    expect(data.endpoints.rerunAccepted.status).toBe(202);
    expect(data.endpoints.revoke.status).toBe(200);
  });

  it("throws rather than inventing a status for an undocumented operation", () => {
    expect(() => responseCodes("PATCH", "/v1/findings")).toThrow(/openapi.json has no PATCH/);
  });

  it("uses a real suppression id once the corpus has one, and the template until then", () => {
    expect(firstSuppressionId({ _stub: true, items: [] })).toBeNull();
    expect(firstSuppressionId(null)).toBeNull();
    expect(firstSuppressionId({ items: [{ suppression_id: "s-01" }] })).toBe("s-01");
    expect(data.endpoints.revoke.path).toMatch(/^\/v1\/suppressions\/(\{suppression_id\}|[\w-]+)$/);
  });

  it("derives every row's short form from its value", () => {
    const form = (field: string) => data.rows.find((r) => r.field === field)?.form;
    expect(form("head_sha")).toBe(shortSha(manifest.ids.head_sha));
    expect(form("proven_finding_id")).toBe(shortHash(manifest.ids.proven_finding_id));
    expect(form("pr_number")).toBe(`#${manifest.ids.pr_number}`);
    expect(form("repository")).toBe(`${manifest.ids.repository.owner}/${manifest.ids.repository.name}`);
  });
});
