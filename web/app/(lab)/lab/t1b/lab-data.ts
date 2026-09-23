// OWNER: T1b (wave 1). Everything the /lab/t1b specimens print comes from here:
// the binding demo ids (public/fixtures/manifest.json, plan A10) and the API
// contract (openapi/openapi.json). Nothing in the specimens is typed by hand
// that a fixture or the API already provides.
import manifest from "@fixtures/manifest.json";
import openapi from "../../../../openapi/openapi.json";
import { shortHash, shortSha } from "./format";

type Operation = { responses?: Record<string, unknown> };
type OpenApiDoc = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
};

const api = openapi as unknown as OpenApiDoc;
const ids = manifest.ids;

/** The status codes the contract documents for one operation, in the order the spec lists them. */
export function responseCodes(method: string, path: string): number[] {
  const op = api.paths[path]?.[method.toLowerCase()];
  if (!op?.responses) throw new Error(`openapi.json has no ${method} ${path}`);
  return Object.keys(op.responses).map(Number);
}

function firstCode(method: string, path: string, predicate: (code: number) => boolean): number {
  const code = responseCodes(method, path).find(predicate);
  if (code === undefined) throw new Error(`openapi.json documents no matching status for ${method} ${path}`);
  return code;
}

export interface LabRow {
  field: string;
  value: string;
  form: string;
}

export interface LabEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  status: number;
}

export interface LabData {
  ids: {
    provenFindingId: string;
    reviewId: string;
    baseSha: string;
    headSha: string;
    repository: string;
    prNumber: number;
    reproTestPath: string;
    failingTest: string;
  };
  rows: LabRow[];
  suppressScopes: string[];
  filters: { bands: string[]; proofStatuses: string[] };
  categories: string[];
  endpoints: {
    suppressCreated: LabEndpoint;
    suppressRejected: LabEndpoint;
    rerunAccepted: LabEndpoint;
    revoke: LabEndpoint;
  };
  operations: string[];
}

export function buildLabData(): LabData {
  const suppressPath = "/v1/findings/{finding_id}/suppress";
  const rerunPath = "/v1/reviews/{review_id}/rerun";
  const revokePath = "/v1/suppressions/{suppression_id}";
  const repository = `${ids.repository.owner}/${ids.repository.name}`;
  const suppressAt = suppressPath.replace("{finding_id}", ids.proven_finding_id);

  const enumOf = (schema: string, property: string): string[] => {
    const values = api.components.schemas[schema]?.properties?.[property]?.enum;
    if (!values?.length) throw new Error(`openapi.json: ${schema}.${property} has no enum`);
    return values;
  };
  const scopes = enumOf("SuppressRequest", "scope");

  return {
    ids: {
      provenFindingId: ids.proven_finding_id,
      reviewId: ids.demo_review_id,
      baseSha: ids.base_sha,
      headSha: ids.head_sha,
      repository,
      prNumber: ids.pr_number,
      reproTestPath: ids.repro_test_path,
      failingTest: ids.failing_test,
    },
    rows: [
      { field: "tenant_id", value: ids.tenant_id, form: shortHash(ids.tenant_id) },
      { field: "demo_review_id", value: ids.demo_review_id, form: shortHash(ids.demo_review_id) },
      { field: "proven_finding_id", value: ids.proven_finding_id, form: shortHash(ids.proven_finding_id) },
      { field: "disproven_finding_id", value: ids.disproven_finding_id, form: shortHash(ids.disproven_finding_id) },
      { field: "inconclusive_finding_id", value: ids.inconclusive_finding_id, form: shortHash(ids.inconclusive_finding_id) },
      { field: "base_sha", value: ids.base_sha, form: shortSha(ids.base_sha) },
      { field: "head_sha", value: ids.head_sha, form: shortSha(ids.head_sha) },
      { field: "repository", value: repository, form: repository },
      { field: "pr_number", value: String(ids.pr_number), form: `#${ids.pr_number}` },
      { field: "repro_test_path", value: ids.repro_test_path, form: ids.repro_test_path },
      { field: "failing_test", value: ids.failing_test, form: ids.failing_test },
      { field: "tamper_demo_seq", value: String(ids.tamper_demo_seq), form: String(ids.tamper_demo_seq) },
    ],
    suppressScopes: scopes,
    filters: { bands: enumOf("FindingSeverity", "band"), proofStatuses: enumOf("FindingProof", "status") },
    categories: enumOf("Finding", "category"),
    endpoints: {
      suppressCreated: { method: "POST", path: suppressAt, status: firstCode("POST", suppressPath, (c) => c >= 200 && c < 300) },
      suppressRejected: { method: "POST", path: suppressAt, status: firstCode("POST", suppressPath, (c) => c >= 400) },
      rerunAccepted: {
        method: "POST",
        path: rerunPath.replace("{review_id}", ids.demo_review_id),
        status: firstCode("POST", rerunPath, (c) => c >= 200 && c < 300),
      },
      revoke: { method: "DELETE", path: revokePath, status: firstCode("DELETE", revokePath, (c) => c >= 200 && c < 300) },
    },
    operations: Object.entries(api.paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`)),
  };
}
