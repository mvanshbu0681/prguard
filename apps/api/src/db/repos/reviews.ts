import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.ts";
import { reviews, type Priority, type Review, type ReviewStatus } from "../schema.ts";

export type NewReview = Pick<Review, "pullRequestId" | "repositoryId" | "headSha" | "baseSha" | "trigger">;

export function create(input: NewReview): Review {
  return db
    .insert(reviews)
    .values({ ...input, status: "queued", stage: "queued", createdAt: Date.now() })
    .returning()
    .get();
}

export function get(id: number): Review | undefined {
  return db.select().from(reviews).where(eq(reviews.id, id)).get();
}

export function update(id: number, patch: Partial<Omit<Review, "id" | "pullRequestId" | "repositoryId" | "createdAt">>): void {
  db.update(reviews).set(patch).where(eq(reviews.id, id)).run();
}

export function addUsage(id: number, tokensIn: number, tokensOut: number): void {
  db.update(reviews)
    .set({
      tokensIn: sql`${reviews.tokensIn} + ${tokensIn}`,
      tokensOut: sql`${reviews.tokensOut} + ${tokensOut}`,
      llmCalls: sql`${reviews.llmCalls} + 1`,
    })
    .where(eq(reviews.id, id))
    .run();
}

export function list(filter: { repositoryIds: number[]; statuses?: ReviewStatus[]; priorities?: Priority[]; limit: number }): Review[] {
  if (filter.repositoryIds.length === 0) return [];
  const conditions = [inArray(reviews.repositoryId, filter.repositoryIds)];
  if (filter.statuses?.length) conditions.push(inArray(reviews.status, filter.statuses));
  if (filter.priorities?.length) conditions.push(inArray(reviews.priority, filter.priorities));
  return db
    .select()
    .from(reviews)
    .where(and(...conditions))
    .orderBy(desc(reviews.id))
    .limit(filter.limit)
    .all();
}

/** The newest review of each repository. */
export function latestByRepos(repositoryIds: number[]): Map<number, Review> {
  if (repositoryIds.length === 0) return new Map();
  const ids = db
    .select({ id: sql<number>`max(${reviews.id})` })
    .from(reviews)
    .where(inArray(reviews.repositoryId, repositoryIds))
    .groupBy(reviews.repositoryId)
    .all()
    .map((r) => r.id);
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select()
      .from(reviews)
      .where(inArray(reviews.id, ids))
      .all()
      .map((r) => [r.repositoryId, r]),
  );
}

export function listForPull(pullRequestId: number): Review[] {
  return db.select().from(reviews).where(eq(reviews.pullRequestId, pullRequestId)).orderBy(desc(reviews.id)).all();
}

export function listOpenForPull(pullRequestId: number): Review[] {
  return db
    .select()
    .from(reviews)
    .where(and(eq(reviews.pullRequestId, pullRequestId), inArray(reviews.status, ["queued", "running"] as ReviewStatus[])))
    .all();
}

export function listOpenForRepos(repositoryIds: number[]): Review[] {
  if (repositoryIds.length === 0) return [];
  return db
    .select()
    .from(reviews)
    .where(and(inArray(reviews.repositoryId, repositoryIds), inArray(reviews.status, ["queued", "running"] as ReviewStatus[])))
    .all();
}
