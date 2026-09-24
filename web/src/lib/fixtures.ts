// OWNER: t2a (wave 1). SERVER-ONLY.
//
// Typed loaders over the fixture corpus for server components (the marketing
// sections render the demo story from these at build time). Every file is a
// static import from @fixtures/* (web/public/fixtures), so it is bundled into
// the server output only. Client code never imports this module: it reads the
// same corpus through the hooks and the fixture resolver.
//
// Guards: `import "server-only"` — Next implements it in the compiler (no
// package is installed; next/types/global.d.ts declares it), so a Client
// Component that imports this module fails the build instead of shipping the
// corpus. A runtime check backs it up. vitest cannot resolve the specifier:
// a test that imports this module adds `vi.mock("server-only", () => ({}))`
// (tests/unit/data/fixtures-on-disk.test.ts does).
//
// Stub files (`_stub: true`, before t2b's generator runs) make every loader
// throw FixtureUnavailableError naming the file: a page built on an ungenerated
// corpus must fail the build, not render an empty hero. isCorpusGenerated() lets
// a caller check first. Everything compiles against the stubs: each file is cast
// through its generated type.
//
// Numbers: a JSON import goes through JSON.parse, which drops Python's float
// lexemes (1.0 → 1). That is harmless for display and fatal for hash
// verification (plan A8). For the audit chain and the canonical-JSON vectors,
// use getAuditEventsText() / getVectorsText() and parse in the client with
// parseLosslessJson (src/api/lossless.ts) — LosslessNumber instances cannot cross
// the server → client component boundary, the raw text can.
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import accuracyReport from "@fixtures/accuracy/report.json";
import accuracySeries from "@fixtures/accuracy/series.json";
import auditEvents from "@fixtures/audit/events.json";
import auditVectors from "@fixtures/audit/vectors.json";
import costSummary from "@fixtures/cost/summary.json";
import findingsIndex from "@fixtures/findings/index.json";
import demoRun from "@fixtures/live/demo-run.json";
import manifest from "@fixtures/manifest.json";
import demoResult from "@fixtures/reviews/4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41.result.json";
import demoStatus from "@fixtures/reviews/4e8b1d0c-7a2f-4c1e-9b3d-5f6a8c0e2d41.status.json";
import reviewsIndex from "@fixtures/reviews/index.json";
import suppressionsIndex from "@fixtures/suppressions/index.json";
import type {
  AccuracyReport,
  AccuracySeries,
  AuditEventsFile,
  CanonicalVectorsFile,
  CostSummary,
  DemoRun,
  Finding,
  FindingsIndexFile,
  FixtureManifest,
  ReviewResult,
  ReviewsIndexFile,
  ReviewStatus,
  SuppressionsIndexFile,
} from "./api-types";
import { FIXTURE_FILES, isFixtureStub } from "./fixture-types";

if (typeof window !== "undefined") {
  throw new Error("src/lib/fixtures.ts is server-only. Client components read the corpus through @/lib/hooks (the fixture resolver).");
}

export class FixtureUnavailableError extends Error {
  constructor(
    readonly file: string,
    readonly reason: "stub" | "missing",
    detail = "",
  ) {
    super(
      reason === "stub"
        ? `web/public/fixtures/${file} is still a stub: run t2b's generator (scripts/fixtures/gen_fixtures.py).`
        : `web/public/fixtures/${file} does not contain ${detail}.`,
    );
    this.name = "FixtureUnavailableError";
  }
}

function real<T>(file: string, value: unknown): T {
  if (isFixtureStub(value)) throw new FixtureUnavailableError(file, "stub");
  return value as T;
}

/** manifest.json. Its ids are final even while the rest of the file is a stub (plan A10). */
export function getManifest(): FixtureManifest {
  return manifest as unknown as FixtureManifest;
}

const DEMO_REVIEW_ID = getManifest().ids.demo_review_id;
const DEMO_STATUS_FILE = FIXTURE_FILES.reviewStatus(DEMO_REVIEW_ID);
const DEMO_RESULT_FILE = FIXTURE_FILES.reviewResult(DEMO_REVIEW_ID);

/** True once t2b's generator has written every file these loaders read. */
export function isCorpusGenerated(): boolean {
  return ![accuracyReport, accuracySeries, auditEvents, auditVectors, costSummary, findingsIndex, demoRun, demoResult, demoStatus, reviewsIndex, suppressionsIndex].some(
    isFixtureStub,
  );
}

function checkDemoFile<T extends { review_id: string }>(file: string, value: T): T {
  if (value.review_id !== DEMO_REVIEW_ID) throw new FixtureUnavailableError(file, "missing", `review_id ${DEMO_REVIEW_ID}`);
  return value;
}

/** The demo run's result document (reviews/<demo_review_id>.result.json). */
export function getDemoResult(): ReviewResult {
  return checkDemoFile(DEMO_RESULT_FILE, real<ReviewResult>(DEMO_RESULT_FILE, demoResult));
}

/** The demo run's final status (reviews/<demo_review_id>.status.json). */
export function getDemoStatus(): ReviewStatus {
  return checkDemoFile(DEMO_STATUS_FILE, real<ReviewStatus>(DEMO_STATUS_FILE, demoStatus));
}

/** reviews/index.json — the run list (Ext). */
export function getReviewsIndex(): ReviewsIndexFile {
  return real<ReviewsIndexFile>(FIXTURE_FILES.reviewsIndex, reviewsIndex);
}

/** live/demo-run.json — the simulated run's timing (Ext). */
export function getDemoRun(): DemoRun {
  return real<DemoRun>(FIXTURE_FILES.demoRun, demoRun);
}

/** Every finding in the corpus (findings/index.json). */
export function getFindings(): Finding[] {
  return real<FindingsIndexFile>(FIXTURE_FILES.findingsIndex, findingsIndex).items;
}

/** One finding by id, or null when the corpus has no such finding. */
export function getFinding(id: string): Finding | null {
  return getFindings().find((f) => f.id === id) ?? null;
}

function requireFinding(id: string, role: string): Finding {
  const finding = getFinding(id);
  if (!finding) throw new FixtureUnavailableError(FIXTURE_FILES.findingsIndex, "missing", `the ${role} finding ${id}`);
  return finding;
}

/** The hero's finding: proof_status proven (manifest ids.proven_finding_id). */
export function getDemoProvenFinding(): Finding {
  return requireFinding(getManifest().ids.proven_finding_id, "proven");
}

/** The counter-demo's finding: proof_status disproven (manifest ids.disproven_finding_id). */
export function getDemoDisprovenFinding(): Finding {
  return requireFinding(getManifest().ids.disproven_finding_id, "disproven");
}

/** manifest ids.inconclusive_finding_id. */
export function getDemoInconclusiveFinding(): Finding {
  return requireFinding(getManifest().ids.inconclusive_finding_id, "inconclusive");
}

/**
 * audit/events.json — the whole chain, ascending seq, items with tenant_id.
 * JSON-parsed: float lexemes are lost. For hash verification use getAuditEventsText().
 */
export function getAuditChain(): AuditEventsFile {
  return real<AuditEventsFile>(FIXTURE_FILES.auditEvents, auditEvents);
}

/** accuracy/report.json — the AccuracyReport (plan A6, A7). */
export function getAccuracy(): AccuracyReport {
  return real<AccuracyReport>(FIXTURE_FILES.accuracyReport, accuracyReport);
}

/** accuracy/series.json — weekly composition, dismissal by category, calibration (Ext). */
export function getAccuracySeries(): AccuracySeries {
  return real<AccuracySeries>(FIXTURE_FILES.accuracySeries, accuracySeries);
}

/** cost/summary.json — per-stage latency, the cost histogram, cache hits (Ext). */
export function getCostSummary(): CostSummary {
  return real<CostSummary>(FIXTURE_FILES.costSummary, costSummary);
}

/** suppressions/index.json — the ledger with its totals. */
export function getSuppressions(): SuppressionsIndexFile {
  return real<SuppressionsIndexFile>(FIXTURE_FILES.suppressionsIndex, suppressionsIndex);
}

/**
 * audit/vectors.json — the cross-language canonical-JSON vectors (plan A8).
 * JSON-parsed: `document` loses its float lexemes. For the canonicaliser's own
 * tests, read getVectorsText() and parse with parseLosslessJson.
 */
export function getVectors(): CanonicalVectorsFile {
  return real<CanonicalVectorsFile>(FIXTURE_FILES.auditVectors, auditVectors);
}

function readText(file: string): string {
  const text = readFileSync(join(process.cwd(), "public", "fixtures", file), "utf8");
  if (isFixtureStub(JSON.parse(text))) throw new FixtureUnavailableError(file, "stub");
  return text;
}

/** The raw text of audit/events.json, number lexemes intact — pass it to a client component as a string. */
export function getAuditEventsText(): string {
  return readText(FIXTURE_FILES.auditEvents);
}

/** The raw text of audit/vectors.json, number lexemes intact. */
export function getVectorsText(): string {
  return readText(FIXTURE_FILES.auditVectors);
}
