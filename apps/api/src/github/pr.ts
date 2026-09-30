import { errMessage, log } from "../log.ts";
import type { GitHub } from "./app.ts";

export type Repo = { owner: string; repo: string };

export type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
};

export type ReviewComment = {
  path: string;
  line: number;
  side: "RIGHT";
  start_line?: number;
  start_side?: "RIGHT";
  body: string;
};

export type CheckConclusion = "success" | "neutral" | "cancelled" | "skipped";

export async function addEyes(gh: GitHub, r: Repo, number: number): Promise<number | null> {
  try {
    const { data } = await gh.rest.reactions.createForIssue({ ...r, issue_number: number, content: "eyes" });
    return data.id;
  } catch (err) {
    log.warn({ ...r, number, err: errMessage(err) }, "could not add reaction");
    return null;
  }
}

export async function removeReaction(gh: GitHub, r: Repo, number: number, reactionId: number): Promise<void> {
  try {
    await gh.rest.reactions.deleteForIssue({ ...r, issue_number: number, reaction_id: reactionId });
  } catch (err) {
    log.warn({ ...r, number, err: errMessage(err) }, "could not remove reaction");
  }
}

export async function startCheckRun(gh: GitHub, r: Repo, headSha: string, detailsUrl: string): Promise<number | null> {
  const base = {
    ...r,
    name: "PR Guard",
    head_sha: headSha,
    status: "in_progress" as const,
    started_at: new Date().toISOString(),
    output: { title: "Reviewing…", summary: "PR Guard is reviewing this pull request." },
  };
  try {
    const { data } = await gh.rest.checks.create({ ...base, details_url: detailsUrl });
    return data.id;
  } catch {
    try {
      const { data } = await gh.rest.checks.create(base);
      return data.id;
    } catch (err) {
      log.warn({ ...r, err: errMessage(err) }, "could not create check run");
      return null;
    }
  }
}

export async function finishCheckRun(
  gh: GitHub,
  r: Repo,
  checkRunId: number,
  conclusion: CheckConclusion,
  title: string,
  summary: string,
): Promise<void> {
  try {
    await gh.rest.checks.update({
      ...r,
      check_run_id: checkRunId,
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      output: { title, summary },
    });
  } catch (err) {
    log.warn({ ...r, checkRunId, err: errMessage(err) }, "could not complete check run");
  }
}

export async function getPull(gh: GitHub, r: Repo, number: number) {
  const { data } = await gh.rest.pulls.get({ ...r, pull_number: number });
  return data;
}

export async function listFiles(gh: GitHub, r: Repo, number: number): Promise<PrFile[]> {
  return (await gh.paginate(gh.rest.pulls.listFiles, { ...r, pull_number: number, per_page: 100 })) as PrFile[];
}

export async function compare(gh: GitHub, r: Repo, base: string, head: string) {
  try {
    const { data } = await gh.rest.repos.compareCommitsWithBasehead({ ...r, basehead: `${base}...${head}`, per_page: 100 });
    return data;
  } catch (err) {
    log.info({ ...r, base, head, err: errMessage(err) }, "compare unavailable");
    return null;
  }
}

export async function postReview(
  gh: GitHub,
  r: Repo,
  number: number,
  commitId: string,
  body: string,
  comments: ReviewComment[],
): Promise<{ id: number; url: string }> {
  const { data } = await gh.rest.pulls.createReview({
    ...r,
    pull_number: number,
    commit_id: commitId,
    event: "COMMENT",
    body,
    comments,
  });
  return { id: data.id, url: data.html_url };
}
