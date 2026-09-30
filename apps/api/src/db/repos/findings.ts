import { and, eq, inArray } from "drizzle-orm";
import { db } from "../client.ts";
import { findings, reviews } from "../schema.ts";
import type { Finding } from "../../review/types.ts";

export type FindingRow = typeof findings.$inferSelect;

export function insertMany(ids: { reviewId: number; pullRequestId: number; repositoryId: number }, items: Finding[]): void {
  if (items.length === 0) return;
  const now = Date.now();
  db.insert(findings)
    .values(
      items.map((f) => ({
        ...ids,
        reviewer: f.reviewer,
        path: f.path,
        line: f.line,
        startLine: f.startLine,
        severity: f.severity,
        category: f.category,
        title: f.title,
        body: f.body,
        suggestion: f.suggestion,
        confidence: f.confidence,
        fingerprint: f.fingerprint,
        placement: f.placement,
        createdAt: now,
      })),
    )
    .run();
}

export function listForReview(reviewId: number): FindingRow[] {
  return db.select().from(findings).where(eq(findings.reviewId, reviewId)).all();
}

export function listForReviews(reviewIds: number[]): FindingRow[] {
  if (reviewIds.length === 0) return [];
  return db.select().from(findings).where(inArray(findings.reviewId, reviewIds)).all();
}

/** Findings already shown on GitHub for a PR, by completed reviews. */
export function listPostedForPull(pullRequestId: number): FindingRow[] {
  return db
    .select({ f: findings })
    .from(findings)
    .innerJoin(reviews, eq(reviews.id, findings.reviewId))
    .where(and(eq(findings.pullRequestId, pullRequestId), eq(reviews.status, "completed"), inArray(findings.placement, ["inline", "body"])))
    .all()
    .map((r) => r.f);
}
