import { APICallError, RetryError, type LanguageModelUsage } from "ai";
import { config } from "../config.ts";
import { log } from "../log.ts";

const WINDOW_MS = 60_000;
/** How many times one call waits out a rate limit before it gives up. */
const RATE_LIMIT_WAITS = 6;

type Spend = { at: number; tokens: number };

/** Tokens each model spent or has reserved in the last minute, oldest first. */
const windows = new Map<string, Spend[]>();
/** After a 429, nothing starts on that model before the provider's reset. */
const blockedUntil = new Map<string, number>();

let active = 0;
const waiting: (() => void)[] = [];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function windowOf(model: string, now: number): Spend[] {
  const recent = (windows.get(model) ?? []).filter((s) => now - s.at < WINDOW_MS);
  windows.set(model, recent);
  return recent;
}

/** Waits until the model has room for `tokens` in its per-minute budget, then reserves them. */
async function reserve(model: string, tokens: number, signal?: AbortSignal): Promise<Spend> {
  const budget = config.llm.tokensPerMinute;
  const want = Math.min(tokens, budget);
  for (;;) {
    const now = Date.now();
    const blocked = (blockedUntil.get(model) ?? 0) - now;
    if (blocked > 0) {
      await sleep(blocked, signal);
      continue;
    }
    const recent = windowOf(model, now);
    const used = recent.reduce((n, s) => n + s.tokens, 0);
    if (used + want <= budget) {
      const spend = { at: now, tokens: want };
      recent.push(spend);
      return spend;
    }
    // Room opens as the oldest spend leaves the window.
    await sleep(Math.max(250, recent[0]!.at + WINDOW_MS - now + 50), signal);
  }
}

/** `7.66s`, `1m2.5s`, `450ms` as milliseconds. */
function duration(value: string | undefined): number | null {
  if (!value) return null;
  const units: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  let ms = 0;
  let found = false;
  for (const m of value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
    found = true;
    ms += Number(m[1]) * units[m[2]!]!;
  }
  return found ? ms : null;
}

/** How long the provider asked us to wait, when the error is a rate limit (429). */
export function rateLimitWait(err: unknown): number | null {
  const e = RetryError.isInstance(err) ? err.lastError : err;
  if (!APICallError.isInstance(e) || e.statusCode !== 429) return null;
  const headers = e.responseHeaders ?? {};
  const retryAfter = Number(headers["retry-after"]);
  const wait = retryAfter > 0 ? retryAfter * 1000 : (duration(headers["x-ratelimit-reset-tokens"]) ?? 15_000);
  return Math.min(Math.max(wait, 1000), WINDOW_MS);
}

async function acquire(signal?: AbortSignal): Promise<void> {
  if (active >= config.llm.concurrency) {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const turn = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      // A cancelled review leaves the line instead of holding a place in it.
      const onAbort = () => {
        const i = waiting.indexOf(turn);
        if (i >= 0) waiting.splice(i, 1);
        reject(signal!.reason);
      };
      waiting.push(turn);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  active++;
}

function release(): void {
  active--;
  waiting.shift()?.();
}

/**
 * Runs one model call within the provider's limits: a few calls at a time, each only once its model
 * has room in the tokens-per-minute budget. A rate limit waits for the provider's reset and tries
 * again, so a busy minute slows reviews down instead of failing them.
 */
export async function limited<T extends { totalUsage?: LanguageModelUsage }>(
  model: string,
  estimate: number,
  signal: AbortSignal | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const spend = await reserve(model, estimate, signal);
    try {
      await acquire(signal);
    } catch (err) {
      spend.tokens = 0;
      throw err;
    }
    try {
      const res = await fn();
      // The reservation was a guess: the window keeps what the call really used, counted from when it
      // finished, so a call that waited or ran past a minute is not forgotten.
      const used = (res.totalUsage?.inputTokens ?? 0) + (res.totalUsage?.outputTokens ?? 0);
      const recent = windows.get(model) ?? [];
      const i = recent.indexOf(spend);
      if (i >= 0) recent.splice(i, 1);
      if (used > 0) spend.tokens = used;
      spend.at = Date.now();
      recent.push(spend);
      windows.set(model, recent);
      return res;
    } catch (err) {
      const wait = rateLimitWait(err);
      if (wait === null || attempt >= RATE_LIMIT_WAITS) throw err;
      blockedUntil.set(model, Math.max(blockedUntil.get(model) ?? 0, Date.now() + wait));
      log.info({ model, waitMs: wait, attempt: attempt + 1 }, "rate limited, waiting for the provider's reset");
    } finally {
      release();
    }
  }
}

/** A rough token count for a call: its text, plus room for the answer. */
export function estimateCall(...texts: string[]): number {
  return Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 3.5) + 1500;
}
