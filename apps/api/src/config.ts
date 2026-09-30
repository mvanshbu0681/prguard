import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

export const ROOT = resolve(import.meta.dirname, "../../..");

const blankIsUnset = (v: unknown) => (v === "" ? undefined : v);
const optional = z.preprocess(blankIsUnset, z.string().optional());
const num = (fallback: number) => z.preprocess(blankIsUnset, z.coerce.number().int().positive().default(fallback));

const schema = z.object({
  NODE_ENV: optional,
  PORT: num(8000),
  ROLE: z.preprocess(blankIsUnset, z.enum(["all", "api", "worker"]).default("all")),
  DATA_DIR: z.preprocess(blankIsUnset, z.string().default("data")),
  DASHBOARD_URL: z.preprocess(blankIsUnset, z.string().default("http://localhost:3001")),
  LOG_LEVEL: z.preprocess(blankIsUnset, z.string().default("info")),

  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_SLUG: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_PRIVATE_KEY: optional,
  GITHUB_PRIVATE_KEY_PATH: optional,
  WEBHOOK_PROXY_URL: optional,

  GROQ_API_KEY: optional,
  GEMINI_API_KEY: optional,
  MODEL_FAST: z.preprocess(blankIsUnset, z.string().default("groq:openai/gpt-oss-20b")),
  MODEL_SMART: z.preprocess(blankIsUnset, z.string().default("groq:openai/gpt-oss-120b")),

  WORKER_CONCURRENCY: num(4),
  LLM_CONCURRENCY: num(6),
  CHUNK_TOKENS: num(12000),
  MAX_CHUNKS: num(8),
  REVIEW_TOKEN_BUDGET: num(200000),

  DEV_LOGIN: optional,
  SESSION_DAYS: num(7),
});

function fromRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(ROOT, path);
}

function load() {
  const env = schema.parse(process.env);
  const privateKey = env.GITHUB_PRIVATE_KEY
    ? env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n")
    : env.GITHUB_PRIVATE_KEY_PATH
      ? readFileSync(fromRoot(env.GITHUB_PRIVATE_KEY_PATH), "utf8")
      : undefined;
  if (!privateKey) throw new Error("Set GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH");

  return {
    production: env.NODE_ENV === "production",
    port: env.PORT,
    role: env.ROLE,
    dataDir: fromRoot(env.DATA_DIR),
    dashboardUrl: env.DASHBOARD_URL.replace(/\/$/, ""),
    logLevel: env.LOG_LEVEL,
    github: {
      appId: env.GITHUB_APP_ID,
      slug: env.GITHUB_APP_SLUG,
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      webhookSecret: env.GITHUB_WEBHOOK_SECRET,
      privateKey,
      webhookProxyUrl: env.WEBHOOK_PROXY_URL,
    },
    llm: {
      groqApiKey: env.GROQ_API_KEY,
      geminiApiKey: env.GEMINI_API_KEY,
      roles: { fast: env.MODEL_FAST, smart: env.MODEL_SMART },
      concurrency: env.LLM_CONCURRENCY,
    },
    review: {
      chunkTokens: env.CHUNK_TOKENS,
      maxChunks: env.MAX_CHUNKS,
      tokenBudget: env.REVIEW_TOKEN_BUDGET,
    },
    workerConcurrency: env.WORKER_CONCURRENCY,
    devLogin: env.DEV_LOGIN === "1" && env.NODE_ENV !== "production",
    sessionDays: env.SESSION_DAYS,
  };
}

export const config = load();
