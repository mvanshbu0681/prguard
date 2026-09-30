import { db } from "../client.ts";
import { llmCalls } from "../schema.ts";

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
};

export function insert(input: LlmCallInput): void {
  db.insert(llmCalls).values({ ...input, createdAt: Date.now() }).run();
}
