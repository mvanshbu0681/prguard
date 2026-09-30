import { Hono } from "hono";
import type { Insights, ReviewerInsight, SeverityCounts } from "../../contracts.ts";
import * as findingsRepo from "../../db/repos/findings.ts";
import * as reviewsRepo from "../../db/repos/reviews.ts";
import { checks, reviewerRefs, reviewers } from "../../review/reviewers/index.ts";
import { requireUser, visibleRepos, type AuthEnv } from "../session.ts";

export const insights = new Hono<AuthEnv>();

insights.use("*", requireUser);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const VERIFIED_SEVERITIES = new Set(["critical", "high", "medium"]);

/** Review and reviewer metrics over the last `days` for the user's repositories, or one of them. */
insights.get("/", (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 1), 90);
  const visible = visibleRepos(c).map((r) => r.id);
  const repo = Number(c.req.query("repo"));
  const repositoryIds = repo ? visible.filter((id) => id === repo) : visible;
  const since = Date.now() - days * 86_400_000;

  const reviews = reviewsRepo.listCompletedSince(repositoryIds, since);
  const findings = findingsRepo.listForReviews(reviews.map((r) => r.id)).filter((f) => f.placement !== "hidden");
  const checkIds = new Set(checks(reviewers).map((p) => p.id));

  const byId = new Map<string, ReviewerInsight>();
  const bySeverity: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };
  let confirmed = 0;
  let unverified = 0;
  for (const f of findings) {
    bySeverity[f.severity]++;
    const ids = f.reviewer.split("+");
    if (VERIFIED_SEVERITIES.has(f.severity) && !ids.some((id) => checkIds.has(id))) {
      if (f.verified) confirmed++;
      else unverified++;
    }
    for (const ref of reviewerRefs(f.reviewer)) {
      const row = byId.get(ref.id) ?? { id: ref.id, name: ref.name, badge: ref.badge, posted: 0, fixed: 0, dismissed: 0, open: 0 };
      row.posted++;
      row[f.status]++;
      byId.set(ref.id, row);
    }
  }

  const body: Insights = {
    days,
    reviews: reviews.length,
    medianMinutes: median(reviews.filter((r) => r.finishedAt).map((r) => (r.finishedAt! - r.createdAt) / 60_000)),
    medianTokens: median(reviews.map((r) => r.tokensIn + r.tokensOut)),
    byReviewer: [...byId.values()].sort((a, b) => b.posted - a.posted),
    bySeverity,
    verification: { confirmed, rejected: reviews.reduce((n, r) => n + (r.trace.funnel?.rejected ?? 0), 0), unverified },
  };
  return c.json(body);
});
