import { z } from "zod";
import * as learningsRepo from "../db/repos/learnings.ts";
import type { LearningRow } from "../db/schema.ts";
import { structured } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";

const schema = z.object({ rule: z.string(), scope: z.string() });

const SYSTEM = `A team told PR Guard, an automated code reviewer, that one of its findings should not have been reported.
Write the lesson as one sentence of at most 25 words that PR Guard will follow on future reviews of this repository.
- General enough to cover the same situation in similar code; never wider than the finding's topic.
- State what not to flag and, when the team gave a reason, why. Put identifiers and paths in single backticks.
- scope: "file" when the lesson is about this file only, "repo" when it applies across the repository.
Answer only with JSON matching the schema.`;

export type LearnInput = {
  repositoryId: number;
  finding: { id: number | null; path: string; category: string; fingerprint: string | null; title: string; body: string };
  reason: string | null;
  source: LearningRow["source"];
  author: string | null;
  url: string | null;
};

/** Turns a dismissed finding (and the team's reason, if any) into a saved learning. */
export async function learnFrom(input: LearnInput): Promise<LearningRow> {
  const f = input.finding;
  let text = `Do not flag "${f.title}" in \`${f.path}\`${input.reason ? `: ${input.reason.trim()}` : ""}.`;
  let repoWide = false;
  try {
    const answer = await structured({
      purpose: "learning",
      role: "fast",
      repositoryId: input.repositoryId,
      system: SYSTEM,
      prompt: `Finding (${f.category}) in \`${f.path}\`: ${f.title}\n${f.body}\n\nWhat the team said: ${input.reason?.trim() || "(no reason given, they marked it unhelpful)"}`,
      schema,
    });
    if (answer.rule.trim()) text = answer.rule.trim();
    repoWide = answer.scope.trim().toLowerCase() === "repo";
  } catch (err) {
    log.warn({ err: errMessage(err) }, "could not word the learning, saving a plain one");
  }
  return learningsRepo.create({
    repositoryId: input.repositoryId,
    text,
    source: input.source,
    path: f.path,
    category: f.category,
    fingerprint: f.fingerprint,
    title: f.title,
    findingId: f.id,
    repoWide,
    author: input.author,
    url: input.url,
  });
}
