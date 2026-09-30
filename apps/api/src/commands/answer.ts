import { z } from "zod";
import * as reviewsRepo from "../db/repos/reviews.ts";
import { getSnapshot } from "../github/snapshot.ts";
import { listFiles } from "../github/pr.ts";
import { agent } from "../llm/call.ts";
import { errMessage, log } from "../log.ts";
import { redactSecrets } from "../review/checks/secrets.ts";
import { codify } from "../review/codify.ts";
import { buildContext } from "../review/context.ts";
import { savePull } from "../review/events.ts";
import { readFile, repoTools } from "../review/tools.ts";
import { registerCommand, threadFinding, type CommandContext } from "./run.ts";

const replySchema = z.object({ body: z.string() });

const SYSTEM = `You are PR Guard, an automated code reviewer, answering a developer inside a pull request.
- Be direct and specific, at most 200 words. No preamble, no sign-off.
- Cite code as \`path:line\`. Put identifiers, paths, commands and values in single backticks.
- Read the code with the tools instead of guessing. If the code does not answer it, say so plainly.
Answer by calling reply once with markdown.`;

const NO_ANSWER = "I couldn't find a good answer this time. Try asking again with more detail.";

/** Answers `explain` in a PR Guard thread, or any question, with the PR and repository as context. */
async function answer(c: CommandContext, mode: "explain" | "question"): Promise<void> {
  const pr = savePull(c.repo, c.live);
  const snapshot = await getSnapshot(c.gh, c.repo.id, c.repo.fullName, c.live.head.sha).catch(() => null);
  const latest = reviewsRepo.listForPull(pr.id).find((r) => r.status === "completed");
  const finding = threadFinding(c.payload);

  const parts = [buildContext(pr, c.repo)];
  if (latest?.summary) parts.push(`## PR Guard's summary of this pull request\n${latest.summary}`);
  if (finding) {
    parts.push(`## The finding this thread is about (\`${finding.path}:${finding.line ?? "?"}\`, ${finding.severity})\n**${finding.title}**\n${finding.body}`);
    if (snapshot && finding.line) parts.push(`## Code\n\`\`\`\n${readFile(snapshot, finding.path, Math.max(1, finding.line - 25), finding.line + 25)}\n\`\`\``);
  } else {
    const files = await listFiles(c.gh, c.r, c.payload.number);
    parts.push(`## Files changed\n${files.slice(0, 80).map((f) => `- \`${f.filename}\` (+${f.additions} -${f.deletions})`).join("\n")}`);
  }
  parts.push(
    mode === "explain"
      ? "## Asked\nExplain this finding: why it is a problem here, what could go wrong, and how to fix it."
      : `## Question from @${c.payload.author}\n${c.args}`,
  );

  let body: string | null = null;
  try {
    const result = await agent({
      purpose: `command:${mode}`,
      role: "smart",
      repositoryId: c.repo.id,
      system: SYSTEM,
      prompt: parts.join("\n\n"),
      tools: snapshot ? repoTools(snapshot) : {},
      answer: { name: "reply", description: "Your answer to the developer, as markdown.", schema: replySchema },
      maxSteps: snapshot ? 4 : 1,
    });
    body = result?.body.trim() || null;
  } catch (err) {
    log.warn({ repo: c.repo.fullName, pr: c.payload.number, err: errMessage(err) }, "answer failed");
    throw err;
  }
  await c.reply(body ? redactSecrets(codify(body, new Set())) : NO_ANSWER);
}

registerCommand("explain", (c) => answer(c, "explain"));
registerCommand("question", (c) => answer(c, "question"));
