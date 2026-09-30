import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.ts";
import { reviews, type Review, type ReviewStatus } from "../schema.ts";

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
