import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { config } from "../config.ts";

export type Role = "fast" | "smart";

export type ResolvedModel = {
  provider: "groq" | "google";
  modelId: string;
  model: LanguageModel;
  providerOptions: Record<string, Record<string, string | number | boolean>>;
};

const groq = createGroq({ apiKey: config.llm.groqApiKey });
const google = createGoogleGenerativeAI({ apiKey: config.llm.geminiApiKey });

/** Roles map to `provider:model` in config (MODEL_FAST, MODEL_SMART). Only Groq and Google are supported. */
export function resolveRole(role: Role): ResolvedModel {
  const spec = config.llm.roles[role];
  const split = spec.indexOf(":");
  const provider = spec.slice(0, split);
  const modelId = spec.slice(split + 1);

  if (provider === "groq") {
    const reasoning: Record<string, string> = modelId.startsWith("openai/gpt-oss")
      ? { reasoningEffort: role === "fast" ? "low" : "medium" }
      : {};
    return { provider, modelId, model: groq(modelId), providerOptions: { groq: reasoning } };
  }
  if (provider === "google") {
    return { provider, modelId, model: google(modelId), providerOptions: {} };
  }
  throw new Error(`Unsupported model provider "${provider}" in ${spec}`);
}
