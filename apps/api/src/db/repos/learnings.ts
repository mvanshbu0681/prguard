import { and, desc, eq } from "drizzle-orm";
import { db } from "../client.ts";
import { learnings, type LearningRow } from "../schema.ts";

export type NewLearning = Omit<LearningRow, "id" | "enabled" | "createdAt">;

export function create(input: NewLearning): LearningRow {
  return db
    .insert(learnings)
    .values({ ...input, enabled: true, createdAt: Date.now() })
    .returning()
    .get();
}

/** Newest first. */
export function list(repositoryId: number): LearningRow[] {
  return db.select().from(learnings).where(eq(learnings.repositoryId, repositoryId)).orderBy(desc(learnings.id)).all();
}

export function listEnabled(repositoryId: number): LearningRow[] {
  return db
    .select()
    .from(learnings)
    .where(and(eq(learnings.repositoryId, repositoryId), eq(learnings.enabled, true)))
    .orderBy(desc(learnings.id))
    .all();
}

export function get(id: number): LearningRow | undefined {
  return db.select().from(learnings).where(eq(learnings.id, id)).get();
}

export function update(id: number, patch: Partial<Pick<LearningRow, "text" | "enabled">>): LearningRow | undefined {
  return db.update(learnings).set(patch).where(eq(learnings.id, id)).returning().get();
}

export function remove(id: number): void {
  db.delete(learnings).where(eq(learnings.id, id)).run();
}
