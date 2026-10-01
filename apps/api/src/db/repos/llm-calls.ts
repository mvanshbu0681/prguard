import { asc, eq } from "drizzle-orm";
import { db } from "../client.ts";
import { llmCalls } from "../schema.ts";

export type LlmCallRow = typeof llmCalls.$inferSelect;

export function listForReview(reviewId: number): LlmCallRow[] {
  return db.select().from(llmCalls).where(eq(llmCalls.reviewId, reviewId)).orderBy(asc(llmCalls.id)).all();
}

export type LlmCallInput = {
  reviewId: number | null;
  repositoryId: number | null;
  purpose: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  ms: number;
  ok: boolean;
  error: string | null;
  tools?: string[];
};

export function insert(input: LlmCallInput): void {
  db.insert(llmCalls).values({ ...input, createdAt: Date.now() }).run();
}
