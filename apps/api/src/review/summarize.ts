import { z } from "zod";
import type { PrioritySignals } from "../db/schema.ts";
import { structured, type CallMeta } from "../llm/call.ts";
import { estimateTokens, renderFile, type FileDiff } from "./diff.ts";
import { fileKind, KIND_PRIORITY } from "./noise.ts";

const flowSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), label: z.string() })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })),
});

const schema = z.object({
  summary: z.string(),
  walkthrough: z.array(z.object({ path: z.string(), change: z.string() })),
  flow: flowSchema,
  change_type: z.string(),
  business_impact: z.string(),
  impact_area: z.string(),
});

const CHANGE_TYPES = new Set(["feature", "fix", "hotfix", "security", "refactor", "perf", "docs", "test", "chore", "deps"]);
const IMPACTS = new Set(["high", "medium", "low"]);

export type Flow = z.infer<typeof flowSchema>;
export type Summary = {
  summary: string;
  walkthrough: { path: string; change: string }[];
  flow: Flow;
  signals: PrioritySignals;
};

const SYSTEM = `You write the summary for PR Guard, an automated pull-request reviewer.
Rules:
- summary: 2 to 4 plain sentences, at most 80 words. Say what the change does and why it matters. No praise, no filler, do not restate the title, do not list files. Never mention business impact, priority, change type or the flow here: those have their own fields.
- walkthrough: one entry per changed file (at most 25, most important first). "change" is at most 15 words, starts with a verb, and is specific.
- flow: the main path this change adds or alters, as 2 to 8 steps (a request, a function, a table, a job, a response). nodes: short ids and labels of at most 5 words; edges: from, to, and a label of at most 3 words or "". Empty lists when the change has no such path (docs, config, renames).
- change_type: one of feature, fix, hotfix, security, refactor, perf, docs, test, chore, deps.
- business_impact: "high" when the change touches money, access control, customer data or a core user flow; "low" for internal, cosmetic, docs or test changes; otherwise "medium".
- impact_area: at most 8 words naming what the change affects for the business, e.g. "Refunds move money back to customers".
- Reviewing is done elsewhere: do not point out bugs here.
- Put identifiers, file paths, commands, config keys and literal values in single backticks.
Answer only with JSON matching the schema.`;

const DIFF_BUDGET = 24_000;

export async function summarize(opts: {
  context: string;
  files: FileDiff[];
  incremental: boolean;
  focus?: Map<string, Set<number>>;
  meta: Omit<CallMeta, "purpose" | "role">;
}): Promise<Summary> {
  const ordered = [...opts.files].sort((a, b) => KIND_PRIORITY[fileKind(a.path)] - KIND_PRIORITY[fileKind(b.path)]);
  const rendered: string[] = [];
  const listedOnly: string[] = [];
  let used = 0;
  for (const file of ordered) {
    const text = renderFile(file, { focus: opts.focus?.get(file.path) });
    const cost = estimateTokens(text);
    if (used + cost > DIFF_BUDGET) {
      listedOnly.push(`${file.path} (+${file.additions} -${file.deletions})`);
      continue;
    }
    used += cost;
    rendered.push(text);
  }

  const scope = opts.incremental
    ? "Summarise only the NEW commits: lines marked + are new since the last review; other lines are context."
    : "Summarise the whole pull request.";
  const prompt = [
    opts.context,
    scope,
    `## Diff\n${rendered.join("\n\n")}`,
    listedOnly.length ? `## Also changed (diff omitted)\n${listedOnly.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await structured({ ...opts.meta, purpose: "summary", role: "fast", system: SYSTEM, prompt, schema });
  const byPath = new Map<string, string[]>();
  for (const w of result.walkthrough) {
    const change = w.change.trim().replace(/\.$/, "");
    if (!change) continue;
    byPath.set(w.path, [...(byPath.get(w.path) ?? []), change]);
  }
  const walkthrough = [...byPath].map(([path, changes]) => ({ path, change: changes.join("; ") })).slice(0, 25);
  const changeType = result.change_type.trim().toLowerCase();
  const impact = result.business_impact.trim().toLowerCase();
  const signals: PrioritySignals = {
    changeType: CHANGE_TYPES.has(changeType) ? changeType : null,
    businessImpact: IMPACTS.has(impact) ? impact : null,
    impactArea: result.impact_area.trim().replace(/\.$/, "") || null,
  };
  return { summary: result.summary.trim(), walkthrough, flow: result.flow, signals };
}
