import { z } from "zod";
import * as findingsRepo from "../db/repos/findings.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import { installationClient, splitFullName } from "../github/app.ts";
import { canWrite, replyInThread } from "../github/pr.ts";
import { dismissFinding } from "../learnings/dismiss.ts";
import { structured } from "../llm/call.ts";
import { log } from "../log.ts";
import { registerJob } from "../queue/worker.ts";
import { statusBadge } from "../review/badges.ts";

const schema = z.object({ intent: z.string(), reason: z.string() });

const SYSTEM = `A developer replied, without mentioning PR Guard, in a pull-request thread under a finding from PR Guard, an automated code reviewer.
Classify the reply:
- "intentional": the code is like this on purpose, or the behavior is expected.
- "disagree": the finding is wrong or does not apply here.
- "question", "thanks" or "other" for anything else, including "will fix" or "done".
reason: the developer's reason in one sentence, or "" when they gave none.
Answer only with JSON matching the schema.`;

type ReplyPayload = { repositoryId: number; number: number; commentId: number; threadId: number; body: string; author: string; url: string };

/**
 * A reply from someone with write access that says the code is intentional, or that the finding is
 * wrong, becomes a learning. Others get no answer.
 */
registerJob("pr_reply", async (raw) => {
  const p = raw as unknown as ReplyPayload;
  const repo = repositoriesRepo.get(p.repositoryId);
  const finding = findingsRepo.getByCommentId(p.threadId);
  if (!repo || repo.removedAt || !finding || finding.status !== "open") return;
  const gh = await installationClient(repo.installationId);
  const r = splitFullName(repo.fullName);
  // Only people who can push to the repository teach PR Guard; checked first so others cost no model call.
  if (!(await canWrite(gh, r, p.author))) {
    log.info({ repo: repo.fullName, pr: p.number, author: p.author }, "reply from a user without write access, no learning");
    return;
  }

  const answer = await structured({
    purpose: "reply-intent",
    role: "fast",
    repositoryId: repo.id,
    system: SYSTEM,
    prompt: `Finding: ${finding.title}\n${finding.body}\n\nReply from @${p.author}:\n${p.body}`,
    schema,
  });
  const intent = answer.intent.trim().toLowerCase();
  if (intent !== "intentional" && intent !== "disagree") {
    log.info({ repo: repo.fullName, pr: p.number, intent }, "reply needs no answer");
    return;
  }
  await dismissFinding({ gh, r, finding, reason: answer.reason.trim() || p.body, source: "reply", author: p.author, url: p.url });
  await replyInThread(gh, r, p.number, p.threadId, `${statusBadge("learned")} Noted. I'll remember this for \`${repo.fullName}\`.`);
});
