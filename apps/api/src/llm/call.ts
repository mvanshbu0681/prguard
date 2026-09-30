import { APICallError, generateText, NoObjectGeneratedError, Output, type LanguageModelUsage } from "ai";
import type { z } from "zod";
import { config } from "../config.ts";
import * as llmCallsRepo from "../db/repos/llm-calls.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import { errMessage, log } from "../log.ts";
import { resolveRole, type ResolvedModel, type Role } from "./models.ts";

export type CallMeta = {
  purpose: string;
  role: Role;
  reviewId?: number;
  repositoryId?: number;
  signal?: AbortSignal;
};

// A small semaphore so bursts of parallel reviews do not stampede the provider.
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= config.llm.concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export function record(meta: CallMeta, m: ResolvedModel, started: number, usage: LanguageModelUsage | undefined, error?: unknown): void {
  const tokensIn = usage?.inputTokens ?? 0;
  const tokensOut = usage?.outputTokens ?? 0;
  llmCallsRepo.insert({
    reviewId: meta.reviewId ?? null,
    repositoryId: meta.repositoryId ?? null,
    purpose: meta.purpose,
    provider: m.provider,
    model: m.modelId,
    tokensIn,
    tokensOut,
    ms: Date.now() - started,
    ok: !error,
    error: error ? errMessage(error).slice(0, 500) : null,
  });
  if (meta.reviewId) reviewsRepo.addUsage(meta.reviewId, tokensIn, tokensOut);
  const fields = { purpose: meta.purpose, model: m.modelId, tokensIn, tokensOut, ms: Date.now() - started };
  if (error) log.warn({ ...fields, err: errMessage(error) }, "llm call failed");
  else log.debug(fields, "llm call");
}

/** Errors a second attempt with a nudge can fix: bad JSON, or a provider rejecting malformed output. */
export function isRepairable(err: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(err)) return true;
  if (APICallError.isInstance(err)) return err.statusCode === 400;
  return false;
}

function usageOf(err: unknown): LanguageModelUsage | undefined {
  return NoObjectGeneratedError.isInstance(err) ? err.usage : undefined;
}

const REPAIR_NOTE =
  "\n\nYour previous answer was not valid for the required JSON schema. Answer again with JSON that matches the schema exactly.";

/** One call that must return an object matching `schema`. One repair attempt on bad output. */
export async function structured<T>(meta: CallMeta & { system: string; prompt: string; schema: z.ZodType<T> }): Promise<T> {
  const m = resolveRole(meta.role);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const res = await limited(() =>
        generateText({
          model: m.model,
          system: meta.system,
          prompt: attempt === 0 ? meta.prompt : meta.prompt + REPAIR_NOTE,
          output: Output.object({ schema: meta.schema }),
          providerOptions: m.providerOptions,
          maxRetries: 4,
          abortSignal: meta.signal,
        }),
      );
      record(meta, m, started, res.totalUsage);
      return res.output as T;
    } catch (err) {
      record(meta, m, started, usageOf(err), err);
      lastError = err;
      if (!isRepairable(err)) break;
    }
  }
  throw lastError;
}

/** One call returning plain text (markdown). */
export async function text(meta: CallMeta & { system: string; prompt: string }): Promise<string> {
  const m = resolveRole(meta.role);
  const started = Date.now();
  try {
    const res = await limited(() =>
      generateText({
        model: m.model,
        system: meta.system,
        prompt: meta.prompt,
        providerOptions: m.providerOptions,
        maxRetries: 4,
        abortSignal: meta.signal,
      }),
    );
    record(meta, m, started, res.totalUsage);
    return res.text.trim();
  } catch (err) {
    record(meta, m, started, undefined, err);
    throw err;
  }
}

export { limited };
