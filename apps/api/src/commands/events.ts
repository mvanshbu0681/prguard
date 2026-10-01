import { config } from "../config.ts";
import * as findingsRepo from "../db/repos/findings.ts";
import { installationClient, splitFullName } from "../github/app.ts";
import { reactToComment } from "../github/pr.ts";
import { on } from "../github/webhooks.ts";
import { log } from "../log.ts";
import { enqueueOnce } from "../queue/queue.ts";
import { ensureRepo } from "../review/events.ts";
import { parseMention } from "./parse.ts";

type Comment = { id: number; body?: string; html_url: string; user?: { login?: string; type?: string }; in_reply_to_id?: number; path?: string; line?: number };

export type CommandPayload = {
  kind: "issue" | "review";
  repositoryId: number;
  number: number;
  commentId: number;
  /** The first comment of the thread, for replies in a line-comment thread. */
  threadId: number | null;
  body: string;
  author: string;
  url: string;
  eyes: number | null;
};

/** A new comment by a person (not a bot) mentioning PR Guard: 👀 right away, then a durable job. */
async function receive(payload: any, kind: CommandPayload["kind"], number: number, comment: Comment): Promise<boolean> {
  const cmd = parseMention(comment.body ?? "", config.github.slug);
  if (!cmd) return false;
  const repo = ensureRepo(payload);
  if (!repo || repo.removedAt || !repo.enabled) return true;
  const gh = await installationClient(repo.installationId);
  const eyes = await reactToComment(gh, splitFullName(repo.fullName), kind, comment.id, "eyes");
  const job: CommandPayload = {
    kind,
    repositoryId: repo.id,
    number,
    commentId: comment.id,
    threadId: kind === "review" ? (comment.in_reply_to_id ?? comment.id) : null,
    body: comment.body ?? "",
    author: comment.user?.login ?? "someone",
    url: comment.html_url,
    eyes,
  };
  if (enqueueOnce("pr_command", `cmd:${comment.id}`, job)) log.info({ repo: repo.fullName, pr: number, command: cmd.command }, "command received");
  return true;
}

function fromPerson(comment: Comment | undefined): comment is Comment {
  return Boolean(comment) && comment!.user?.type !== "Bot";
}

on("issue_comment", async (payload) => {
  if (!config.features.commands || payload.action !== "created" || !payload.issue?.pull_request) return;
  if (!fromPerson(payload.comment)) return;
  await receive(payload, "issue", payload.issue.number, payload.comment);
});

on("pull_request_review_comment", async (payload) => {
  if (!config.features.commands || payload.action !== "created") return;
  const comment = payload.comment as Comment | undefined;
  if (!fromPerson(comment)) return;
  if (await receive(payload, "review", payload.pull_request.number, comment)) return;
  // A reply without a mention in one of PR Guard's threads may be the team saying it is intentional.
  if (comment.in_reply_to_id && findingsRepo.getByCommentId(comment.in_reply_to_id)) {
    const repo = ensureRepo(payload);
    if (!repo || repo.removedAt || !repo.enabled) return;
    enqueueOnce("pr_reply", `reply:${comment.id}`, {
      repositoryId: repo.id,
      number: payload.pull_request.number,
      commentId: comment.id,
      threadId: comment.in_reply_to_id,
      body: comment.body ?? "",
      author: comment.user?.login ?? "someone",
      url: comment.html_url,
    });
  }
});
