import * as findingsRepo from "../db/repos/findings.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import type { PullRequest } from "../db/schema.ts";
import { log } from "../log.ts";
import { decidePriority } from "./priority.ts";

/**
 * Re-ranks a PR after its labels change, from the latest completed review's stored signals and the
 * findings on the PR. No model call. A PR that was never reviewed stays unranked.
 */
export function rerankFromLabels(pr: PullRequest): void {
  const latest = reviewsRepo.listForPull(pr.id).find((r) => r.status === "completed");
  if (!latest) return;
  const findings = findingsRepo.listPostedForPull(pr.id);
  const ranked = decidePriority({ signals: latest.signals ?? null, labels: pr.labels, findings, previous: null, incremental: false });
  pullsRepo.update(pr.id, { priority: ranked.priority, priorityReason: ranked.reason || null });
  log.info({ pr: pr.number, priority: ranked.priority, labels: pr.labels }, "pull request re-ranked");
}
