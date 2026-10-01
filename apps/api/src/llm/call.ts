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
import { z } from "zod";
import * as llmCallsRepo from "../db/repos/llm-calls.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import { errMessage, log } from "../log.ts";
import { redactSecrets, secretsOf } from "../review/checks/secrets.ts";
import { resolveRole, type ResolvedModel, type Role } from "./models.ts";
import { estimateCall, limited } from "./rate.ts";

export type CallMeta = {
  purpose: string;
  role: Role;
  reviewId?: number;
  repositoryId?: number;
  signal?: AbortSignal;
};

export function record(
  meta: CallMeta,
  m: ResolvedModel,
  started: number,
  usage: LanguageModelUsage | undefined,
  error?: unknown,
  tools: string[] = [],
): void {
  const tokensIn = usage?.inputTokens ?? 0;
  const sensitive = secretsOf(meta.reviewId);
  const tokensOut = usage?.outputTokens ?? 0;
  llmCallsRepo.insert({
    tools: tools.map((t) => redactSecrets(t, sensitive)),
    reviewId: meta.reviewId ?? null,
    repositoryId: meta.repositoryId ?? null,
    purpose: meta.purpose,
    provider: m.provider,
    model: m.modelId,
    tokensIn,
    tokensOut,
    ms: Date.now() - started,
    ok: !error,
    error: error ? redactSecrets(errMessage(error), sensitive).slice(0, 500) : null,
  });
  if (meta.reviewId) reviewsRepo.addUsage(meta.reviewId, tokensIn, tokensOut);
  const fields = { purpose: meta.purpose, model: m.modelId, tokensIn, tokensOut, ms: Date.now() - started };
  if (error) log.warn({ ...fields, err: redactSecrets(errMessage(error), sensitive) }, "llm call failed");
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
      const res = await limited(m.modelId, estimateCall(meta.system, meta.prompt), meta.signal, () =>
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
    const res = await limited(m.modelId, estimateCall(meta.system, meta.prompt), meta.signal, () =>
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
 * Groq's JSON mode needs every key listed as required, so optional keys become required and
 * nullable. Callers already accept null wherever a key was optional.
 */
function everyKeyRequired(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    let inner = schema.unwrap() as z.ZodType;
    while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) inner = inner.unwrap() as z.ZodType;
    return everyKeyRequired(inner).nullable();
  }
  if (schema instanceof z.ZodObject) {
    return z.object(Object.fromEntries(Object.entries(schema.shape).map(([key, value]) => [key, everyKeyRequired(value as z.ZodType)])));
  }
  if (schema instanceof z.ZodArray) return z.array(everyKeyRequired(schema.element as z.ZodType));
  return schema;
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
    // Each step of the tool loop sends the conversation again.
    const estimate = estimateCall(meta.system, meta.prompt) * Math.min(meta.maxSteps, 3);
    const res = await limited(m.modelId, estimate, meta.signal, () =>
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

  // The model sometimes keeps searching after being told to answer, and Groq rejects any call that is
  // not listed or does not match a forced tool. So every tool stays listed, a tool call is required, and
  // the search tools only say to answer.
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
      const res = await limited(m.modelId, estimateCall(meta.system, JSON.stringify(history)) * 2, meta.signal, () =>
        generateText({
          model: m.model,
          system: meta.system,
          messages: [...history, { role: "user", content: nudge }],
          tools: { ...closed, [name]: answerTool },
          toolChoice: "required",
          stopWhen: [isStepCount(3), hasToolCall(name)],
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
  // Last resort: the same question in JSON mode, answered from the prompt without what the tools found.
  try {
    return (await structured({
      ...meta,
      purpose: `${meta.purpose}:json`,
      // The system prompt describes tools; in JSON mode a tool call is rejected, so say they are gone.
      system: `${meta.system}\n\nNo tools are available now. Reply with the JSON object only, filled from what you already know.`,
      schema: everyKeyRequired(schema),
    })) as T;
  } catch (err) {
    problem = errMessage(err).slice(0, 400);
  }
  log.warn({ purpose: meta.purpose, problem }, "no valid answer from the model");
  return null;
}

