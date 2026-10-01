import {
  APICallError,
  generateText,
  hasToolCall,
  isStepCount,
  NoObjectGeneratedError,
  Output,
  RetryError,
  tool,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { z } from "zod";
import { config } from "../config.ts";
import * as llmCallsRepo from "../db/repos/llm-calls.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import { errMessage, log } from "../log.ts";
import { redactSecrets } from "../review/checks/secrets.ts";
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

export function record(
  meta: CallMeta,
  m: ResolvedModel,
  started: number,
  usage: LanguageModelUsage | undefined,
  error?: unknown,
  tools: string[] = [],
): void {
  const tokensIn = usage?.inputTokens ?? 0;
  const tokensOut = usage?.outputTokens ?? 0;
  llmCallsRepo.insert({
    tools,
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
  if (RetryError.isInstance(err)) return isRepairable(err.lastError);
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

type Step = { toolCalls: { toolName: string; input: unknown }[] };

/** The repository tools a call used, as `name first-argument`, for the review trace. */
function toolsUsed(steps: Step[], answerName: string): string[] {
  return steps
    .flatMap((s) => s.toolCalls)
    .filter((c) => c.toolName !== answerName)
    .map((c) => {
      const input = (c.input ?? {}) as Record<string, unknown>;
      const first = Object.values(input).find((v) => typeof v === "string") as string | undefined;
      return first ? `${c.toolName} ${redactSecrets(first).slice(0, 80)}` : c.toolName;
    });
}

function findAnswer<T>(steps: Step[], name: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const call = [...steps[i]!.toolCalls].reverse().find((c) => c.toolName === name);
    if (!call) continue;
    const parsed = schema.safeParse(call.input);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.message.slice(0, 800) };
  }
  return null;
}

function withoutAnswerCalls(messages: ModelMessage[], name: string): ModelMessage[] {
  return messages.filter((msg) => {
    if (!Array.isArray(msg.content)) return true;
    return !msg.content.some(
      (part) => (part.type === "tool-call" || part.type === "tool-result") && "toolName" in part && part.toolName === name,
    );
  });
}

/**
 * A tool loop whose final answer is a call to the `answer` tool (Groq cannot combine tools with JSON
 * output). If the loop ends without a valid answer, the model is made to call the answer tool.
 */
export async function agent<T>(
  meta: CallMeta & {
    system: string;
    prompt: string;
    tools: ToolSet;
    answer: { name: string; description: string; schema: z.ZodType<T> };
    maxSteps: number;
  },
): Promise<T | null> {
  const m = resolveRole(meta.role);
  const { name, description, schema } = meta.answer;
  const answerTool = tool({ description, inputSchema: schema as z.ZodType<T & object> });

  let history: ModelMessage[] = [{ role: "user", content: meta.prompt }];
  let problem: string | null = null;

  const started = Date.now();
  try {
    const res = await limited(() =>
      generateText({
        model: m.model,
        system: meta.system,
        messages: history,
        tools: { ...meta.tools, [name]: answerTool },
        toolChoice: "auto",
        stopWhen: [isStepCount(meta.maxSteps), hasToolCall(name)],
        providerOptions: m.providerOptions,
        maxRetries: 4,
        abortSignal: meta.signal,
      }),
    );
    record(meta, m, started, res.totalUsage, undefined, toolsUsed(res.steps as unknown as Step[], name));
    const found = findAnswer(res.steps as unknown as Step[], name, schema);
    if (found?.ok) return found.value;
    if (found) problem = found.error;
    history = [...history, ...withoutAnswerCalls(res.responseMessages as ModelMessage[], name)];
  } catch (err) {
    record(meta, m, started, undefined, err);
    if (!isRepairable(err)) throw err;
    problem = errMessage(err).slice(0, 400);
  }

  // The model sometimes keeps searching after being told to answer; Groq rejects a call to a tool the
  // request does not list, so the tools stay listed but only say to answer.
  const closed: ToolSet = Object.fromEntries(
    Object.entries(meta.tools).map(([toolName, t]) => [
      toolName,
      tool({ description: t.description ?? toolName, inputSchema: t.inputSchema, execute: async () => `Searching is over. Call ${name} now.` }),
    ]),
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const nudge = problem
      ? `Your ${name} call was invalid (${problem}). Call ${name} again now with input that matches its schema exactly.`
      : `Stop exploring. Call ${name} now with your final answer.`;
    const startedForced = Date.now();
    try {
      const res = await limited(() =>
        generateText({
          model: m.model,
          system: meta.system,
          messages: [...history, { role: "user", content: nudge }],
          tools: { ...closed, [name]: answerTool },
          toolChoice: { type: "tool", toolName: name },
          stopWhen: [isStepCount(2), hasToolCall(name)],
          providerOptions: m.providerOptions,
          maxRetries: 3,
          abortSignal: meta.signal,
        }),
      );
      record({ ...meta, purpose: `${meta.purpose}:final` }, m, startedForced, res.totalUsage);
      const found = findAnswer(res.steps as unknown as Step[], name, schema);
      if (found?.ok) return found.value;
      problem = found ? found.error : "no answer";
    } catch (err) {
      record({ ...meta, purpose: `${meta.purpose}:final` }, m, startedForced, undefined, err);
      if (!isRepairable(err)) throw err;
      problem = errMessage(err).slice(0, 400);
    }
  }
  log.warn({ purpose: meta.purpose, problem }, "no valid answer from the model");
  return null;
}

export { limited };
