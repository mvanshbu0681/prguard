import { config } from "../config.ts";
import * as findingsRepo from "../db/repos/findings.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import type { Repository } from "../db/schema.ts";
import { installationClient, splitFullName, type GitHub } from "../github/app.ts";
import { createIssueComment, getPull, removeCommentReaction, replyInThread, type Repo } from "../github/pr.ts";
import { errMessage, log } from "../log.ts";
import { registerJob, type JobContext } from "../queue/worker.ts";
import { badge } from "../review/badges.ts";
import { savePull } from "../review/events.ts";
import { triggerReview } from "../review/lifecycle.ts";
import type { CommandPayload } from "./events.ts";
import { parseMention, type CommandName } from "./parse.ts";

const HELP = `${badge("logo")}

| Command | What it does |
| --- | --- |
| \`@prguard review\` | Review the whole pull request again |
| \`@prguard explain\` | Explain a finding (reply on its comment) |
| \`@prguard fix\` | Suggest a fix for a finding (reply on its comment) |
| \`@prguard ignore <reason>\` | Dismiss a finding and remember it for this repository (reply on its comment) |
| \`@prguard <question>\` | Ask anything about this pull request |`;

const CLOSED = "This pull request is closed.";
const FAILED = "Something went wrong answering this. Try again in a minute.";

function usage(command: CommandName): string {
  return `Reply on one of PR Guard's line comments with \`@prguard ${command}\` to use it on that finding.`;
}

/** Everything a command handler needs about where it was asked. */
export type CommandContext = {
  payload: CommandPayload;
  repo: Repository;
  gh: GitHub;
  r: Repo;
  live: Awaited<ReturnType<typeof getPull>>;
  args: string;
  /** Answers where the command was asked: in the thread, or in the conversation. */
  reply: (body: string) => Promise<{ id: number; url: string }>;
  signal?: AbortSignal;
};

export type CommandHandler = (c: CommandContext) => Promise<void>;

/** Handlers added by later commands (`explain`, `fix`, `ignore`, questions). */
const handlers = new Map<CommandName, CommandHandler>();

export function registerCommand(name: CommandName, handler: CommandHandler): void {
  handlers.set(name, handler);
}

/** The finding whose line-comment thread a command was asked in, if it is one of PR Guard's. */
export function threadFinding(payload: CommandPayload) {
  return payload.threadId ? findingsRepo.getByCommentId(payload.threadId) : undefined;
}

async function runCommand(raw: Record<string, unknown>, ctx: JobContext): Promise<void> {
  const payload = raw as unknown as CommandPayload;
  const repo = repositoriesRepo.get(payload.repositoryId);
  if (!repo || repo.removedAt) return;
  const cmd = parseMention(payload.body, config.github.slug);
  if (!cmd) return;
  const gh = await installationClient(repo.installationId);
  const r = splitFullName(repo.fullName);
  const live = await getPull(gh, r, payload.number);
  const reply = (body: string) =>
    payload.kind === "review" && payload.threadId
      ? replyInThread(gh, r, payload.number, payload.threadId, body)
      : createIssueComment(gh, r, payload.number, body);
  const c: CommandContext = { payload, repo, gh, r, live, args: cmd.args, reply };

  try {
    if (cmd.command === "help") {
      await reply(HELP);
    } else if (cmd.command === "review") {
      if (live.state !== "open") await reply(CLOSED);
      else if (live.draft) await reply("This pull request is a draft. Mark it ready for review first.");
      else await triggerReview(repo, savePull(repo, live), "command");
    } else if ((cmd.command === "explain" || cmd.command === "fix" || cmd.command === "ignore") && !threadFinding(payload)) {
      await reply(usage(cmd.command));
    } else if (cmd.command === "fix" && live.state !== "open") {
      await reply(CLOSED);
    } else {
      const handler = handlers.get(cmd.command);
      if (handler) await handler(c);
      else await reply(HELP);
    }
    log.info({ repo: repo.fullName, pr: payload.number, command: cmd.command }, "command answered");
  } catch (err) {
    log.warn({ repo: repo.fullName, pr: payload.number, command: cmd.command, err: errMessage(err) }, "command failed");
    if (ctx.isLastAttempt) await reply(FAILED).catch(() => undefined);
    throw err;
  } finally {
    if (payload.eyes) await removeCommentReaction(gh, r, payload.kind, payload.commentId, payload.eyes);
  }
}

registerJob("pr_command", runCommand);
