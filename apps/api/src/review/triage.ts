import { z } from "zod";
import { structured, type CallMeta } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";
import type { TriageFile } from "../db/schema.ts";
import type { FileDiff } from "./diff.ts";
import { fileKind } from "./noise.ts";
import { applies, type ModelReviewer } from "./reviewers/index.ts";

const schema = z.object({
  files: z.array(z.object({ path: z.string(), risk: z.string(), reviewers: z.array(z.string()) })),
});

/** Kept on every source file, whatever triage says. */
const ALWAYS = new Set(["general", "rules"]);
/** Also kept on every source file that is not low risk: triage only prunes these on trivial files. */
const CORE = new Set(["security", "reliability", "slop", "performance"]);
/** New configuration surface in added lines: env vars, flags, routes. Docs drift always looks at these. */
const CONFIG_SURFACE =
  /process\.env\.|os\.environ|os\.getenv|os\.Getenv|System\.getenv|getenv\(|flag\.(String|Int|Bool|Duration)|add_argument\(|\.(get|post|put|delete|patch)\(\s*["'`]\/|@(app|router)\.(get|post|put|delete|patch)\(/;
const RISKS = new Set(["low", "medium", "high"]);

const SYSTEM = `You triage a pull request for PR Guard, an automated code reviewer, before specialist reviewers run.
For every file, rate its risk and pick which of its candidate reviewers are worth running on it.
- risk: "high" for money, auth, data deletion, security-sensitive or widely used code; "medium" for ordinary logic; "low" for trivial, cosmetic or test-only changes.
- reviewers: only from that file's candidates. Pick a reviewer when the file plausibly has problems in its area: security for endpoints, auth and input handling; performance for loops over data, queries and hot paths; data for schema and migrations; docs for new config, env vars, flags or routes; tests for changed behavior. When unsure, include it.
Answer only with JSON matching the schema, one entry per file, paths exactly as given.`;

function describe(file: FileDiff, candidates: ModelReviewer[]): string {
  const added = file.hunks.flatMap((h) => h.lines.filter((l) => l.kind === "add").map((l) => `+ ${l.text.slice(0, 160)}`)).slice(0, 6);
  return [
    `FILE ${file.path} (${fileKind(file.path)}, +${file.additions} -${file.deletions})`,
    ...file.hunks.slice(0, 6).map((h) => `  ${h.header.slice(0, 160)}`),
    ...added.map((l) => `  ${l}`),
    `  candidates: ${candidates.map((c) => c.id).join(", ")}`,
  ].join("\n");
}

export type Triage = { files: TriageFile[]; routes: Map<string, string[]>; fallback: boolean };

/**
 * One fast call rates each file's risk and routes it to the reviewers that matter. Reviewers not
 * applicable to a file are never offered; a failed call or a missing file falls back to every
 * applicable reviewer.
 */
export async function triage(opts: {
  files: FileDiff[];
  reviewers: ModelReviewer[];
  context: string;
  meta: Omit<CallMeta, "purpose" | "role">;
}): Promise<Triage> {
  const candidates = new Map(opts.files.map((f) => [f.path, opts.reviewers.filter((r) => applies(r, f.path))]));
  const fallbackFile = (path: string): TriageFile => ({ path, risk: "medium", reviewers: candidates.get(path)!.map((r) => r.id) });
  const withCandidates = opts.files.filter((f) => candidates.get(f.path)!.length > 0);
  if (withCandidates.length === 0) return { files: [], routes: new Map(), fallback: false };

  let answer: z.infer<typeof schema> | null = null;
  try {
    const prompt = [
      opts.context,
      `## Reviewers\n${opts.reviewers.map((r) => `- ${r.id}: ${r.description}`).join("\n")}`,
      `## Files\n${withCandidates.map((f) => describe(f, candidates.get(f.path)!)).join("\n\n")}`,
    ].join("\n\n");
    answer = await structured({ ...opts.meta, purpose: "triage", role: "fast", system: SYSTEM, prompt, schema });
  } catch (err) {
    if (opts.meta.signal?.aborted) throw err;
    log.warn({ review: opts.meta.reviewId, err: errMessage(err) }, "triage failed, every reviewer gets every file");
  }

  const byPath = new Map((answer?.files ?? []).map((f) => [f.path.trim().replace(/^\.?\//, ""), f]));
  let missing = 0;
  const files = withCandidates.map((file): TriageFile => {
    const got = byPath.get(file.path);
    if (!got) {
      missing++;
      return fallbackFile(file.path);
    }
    const allowed = candidates.get(file.path)!.map((r) => r.id);
    const chosen = new Set(got.reviewers.map((r) => r.trim().toLowerCase()).filter((r) => allowed.includes(r)));
    const risk = RISKS.has(got.risk.trim().toLowerCase()) ? (got.risk.trim().toLowerCase() as TriageFile["risk"]) : "medium";
    const source = fileKind(file.path) === "source";
    const addsConfig = file.hunks.some((h) => h.lines.some((l) => l.kind === "add" && CONFIG_SURFACE.test(l.text)));
    for (const id of allowed) {
      if (source && ALWAYS.has(id)) chosen.add(id);
      if (source && risk !== "low" && CORE.has(id)) chosen.add(id);
      if (id === "docs" && addsConfig) chosen.add(id);
    }
    return { path: file.path, risk, reviewers: allowed.filter((id) => chosen.has(id)) };
  });
  return { files, routes: new Map(files.map((f) => [f.path, f.reviewers])), fallback: answer === null || missing > 0 };
}
