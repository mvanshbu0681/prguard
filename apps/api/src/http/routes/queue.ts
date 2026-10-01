import { Hono } from "hono";
import type { QueueItem, SeverityCounts } from "../../contracts.ts";
import * as findingsRepo from "../../db/repos/findings.ts";
import * as pullsRepo from "../../db/repos/pulls.ts";
import * as reviewsRepo from "../../db/repos/reviews.ts";
import { requireUser, visibleRepos, type AuthEnv } from "../session.ts";

export const queue = new Hono<AuthEnv>();

queue.use("*", requireUser);

/** Open, non-draft PRs of the user's repositories with their priority, risk and open findings. */
queue.get("/", (c) => {
  const repos = new Map(visibleRepos(c).map((r) => [r.id, r]));
  const pulls = pullsRepo.listOpen([...repos.keys()]);
  const ids = pulls.map((p) => p.id);
  const latest = reviewsRepo.latestByPulls(ids);
  const open = new Map<number, SeverityCounts>();
  const fixed = new Map<number, number>();
  for (const row of findingsRepo.statusCountsByPull(ids)) {
    if (row.status === "open") {
      const counts = open.get(row.pullRequestId) ?? { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };
      counts[row.severity] += row.n;
      open.set(row.pullRequestId, counts);
    } else if (row.status === "fixed") {
      fixed.set(row.pullRequestId, (fixed.get(row.pullRequestId) ?? 0) + row.n);
    }
  }
  const items: QueueItem[] = pulls.flatMap((pr) => {
    const repo = repos.get(pr.repositoryId);
    if (!repo) return [];
    const review = latest.get(pr.id);
    return [
      {
        repository: { id: repo.id, fullName: repo.fullName },
        pr: { number: pr.number, title: pr.title, url: pr.url, authorLogin: pr.authorLogin, authorAvatar: pr.authorAvatar, createdAt: pr.createdAt },
        priority: pr.priority ?? null,
        priorityReason: pr.priorityReason ?? null,
        risk: pr.risk ?? null,
        riskReasons: pr.riskReasons,
        open: open.get(pr.id) ?? { critical: 0, high: 0, medium: 0, low: 0, nit: 0 },
        fixed: fixed.get(pr.id) ?? 0,
        latestReview: review ? { id: review.id, status: review.status } : null,
      },
    ];
  });
  return c.json(items);
});
