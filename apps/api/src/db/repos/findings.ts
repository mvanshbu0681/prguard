import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
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
        details: f.details ?? null,
        verified: f.verified ?? false,
        evidence: f.evidence ?? null,
        snippet: f.snippet ?? null,
        createdAt: now,
      })),
    )
    .run();
}

export function update(id: number, patch: Partial<Omit<FindingRow, "id" | "reviewId" | "pullRequestId" | "repositoryId" | "createdAt">>): void {
  db.update(findings).set(patch).where(eq(findings.id, id)).run();
}

export function get(id: number): FindingRow | undefined {
  return db.select().from(findings).where(eq(findings.id, id)).get();
}

export function getByCommentId(commentId: number): FindingRow | undefined {
  return db.select().from(findings).where(eq(findings.githubCommentId, commentId)).get();
}

/** Open findings on a PR that have a line comment on GitHub, from completed reviews. */
export function listOpenCommentedForPull(pullRequestId: number): FindingRow[] {
  return db
    .select({ f: findings })
    .from(findings)
    .innerJoin(reviews, eq(reviews.id, findings.reviewId))
    .where(and(eq(findings.pullRequestId, pullRequestId), eq(reviews.status, "completed"), eq(findings.status, "open"), isNotNull(findings.githubCommentId)))
    .all()
    .map((r) => r.f);
}

export function listForReview(reviewId: number): FindingRow[] {
  return db.select().from(findings).where(eq(findings.reviewId, reviewId)).all();
}

export function listForReviews(reviewIds: number[]): FindingRow[] {
  if (reviewIds.length === 0) return [];
  return db.select().from(findings).where(inArray(findings.reviewId, reviewIds)).all();
}

/** Visible (inline or in the review body) findings per review and severity. */
export function countsByReview(reviewIds: number[]): Map<number, Record<FindingRow["severity"], number>> {
  const out = new Map<number, Record<FindingRow["severity"], number>>();
  if (reviewIds.length === 0) return out;
  const rows = db
    .select({ reviewId: findings.reviewId, severity: findings.severity, n: sql<number>`count(*)` })
    .from(findings)
    .where(and(inArray(findings.reviewId, reviewIds), inArray(findings.placement, ["inline", "body"])))
    .groupBy(findings.reviewId, findings.severity)
    .all();
  for (const row of rows) {
    const counts = out.get(row.reviewId) ?? { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };
    counts[row.severity] = row.n;
    out.set(row.reviewId, counts);
  }
  return out;
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
