// OWNER: T2 (wave 1) — t2a.
//
// The canonical demo identifiers (plan A10), typed. The single source is
// web/public/fixtures/manifest.json → ids (final and binding; t2b's generator uses
// them verbatim). Assigning the JSON to DemoIds makes `tsc` fail if an id is
// renamed or dropped. Short forms are derived here, never typed by hand.
import manifest from "@fixtures/manifest.json";
import type { DemoIds } from "./fixture-types";

export const DEMO_IDS: DemoIds = manifest.ids;

export const DEMO_SHORT = {
  /** `run 4e8b1d0` */
  review: DEMO_IDS.demo_review_id.slice(0, 7),
  /** `a91f3c2e` */
  provenFinding: DEMO_IDS.proven_finding_id.slice(0, 8),
  disprovenFinding: DEMO_IDS.disproven_finding_id.slice(0, 8),
  inconclusiveFinding: DEMO_IDS.inconclusive_finding_id.slice(0, 8),
  /** `7c41a09` */
  baseSha: DEMO_IDS.base_sha.slice(0, 7),
  /** `9c2d4b1` */
  headSha: DEMO_IDS.head_sha.slice(0, 7),
  /** `acme/checkout-service` */
  repository: `${DEMO_IDS.repository.owner}/${DEMO_IDS.repository.name}`,
  /** `acme/checkout-service#4821` */
  pullRequest: `${DEMO_IDS.repository.owner}/${DEMO_IDS.repository.name}#${DEMO_IDS.pr_number}`,
} as const;

/** The dashboard route of the demo run (plan A5: fixture-mode submissions land here). */
export const DEMO_RUN_PATH = `/runs/${DEMO_IDS.demo_review_id}`;
