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

export async function createCompletedCheckRun(
  gh: GitHub,
  r: Repo,
  headSha: string,
  detailsUrl: string,
  conclusion: CheckConclusion,
  title: string,
  summary: string,
): Promise<void> {
  const base = {
    ...r,
    name: "PR Guard",
    head_sha: headSha,
    status: "completed" as const,
    conclusion,
    completed_at: new Date().toISOString(),
    output: { title, summary },
  };
  try {
    await gh.rest.checks.create({ ...base, details_url: detailsUrl });
  } catch {
    await gh.rest.checks.create(base).catch((err) => log.warn({ ...r, err: errMessage(err) }, "could not create check run"));
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

/** A review this app already posted on the PR whose body links to `url` (used after a crash). */
export async function findPostedReview(gh: GitHub, r: Repo, number: number, url: string): Promise<{ id: number; url: string } | null> {
  const reviews = await gh.paginate(gh.rest.pulls.listReviews, { ...r, pull_number: number, per_page: 100 });
  // The link ends the URL: `/reviews/12"` or `/reviews/12)`, never `/reviews/123`.
  const linked = new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["')]`);
  const hit = reviews.find((rv) => rv.user?.type === "Bot" && linked.test(rv.body ?? ""));
  return hit ? { id: hit.id, url: hit.html_url } : null;
}

export type PostedComment = { id: number; nodeId: string; path: string; body: string; url: string };

/** The line comments of one posted review. */
export async function listReviewCommentsOf(gh: GitHub, r: Repo, number: number, reviewId: number): Promise<PostedComment[]> {
  const comments = await gh.paginate(gh.rest.pulls.listCommentsForReview, { ...r, pull_number: number, review_id: reviewId, per_page: 100 });
  return comments.map((c) => ({ id: c.id, nodeId: c.node_id, path: c.path, body: c.body, url: c.html_url }));
}

export type PullComment = {
  id: number;
  nodeId: string;
  inReplyTo: number | null;
  authorLogin: string;
  authorType: string;
  thumbsDown: number;
  body: string;
};

/** Every line comment on a PR, with its thumbs-down count. */
export async function listPullComments(gh: GitHub, r: Repo, number: number): Promise<PullComment[]> {
  const comments = await gh.paginate(gh.rest.pulls.listReviewComments, { ...r, pull_number: number, per_page: 100 });
  return comments.map((c) => ({
    id: c.id,
    nodeId: c.node_id,
    inReplyTo: c.in_reply_to_id ?? null,
    authorLogin: c.user?.login ?? "",
    authorType: c.user?.type ?? "",
    thumbsDown: c.reactions?.["-1"] ?? 0,
    body: c.body,
  }));
}

export async function updateReviewComment(gh: GitHub, r: Repo, commentId: number, body: string): Promise<void> {
  await gh.rest.pulls.updateReviewComment({ ...r, comment_id: commentId, body });
}

/** Reply inside a line-comment thread. */
export async function replyInThread(gh: GitHub, r: Repo, number: number, commentId: number, body: string): Promise<{ id: number; url: string }> {
  const { data } = await gh.rest.pulls.createReplyForReviewComment({ ...r, pull_number: number, comment_id: commentId, body });
  return { id: data.id, url: data.html_url };
}

/** A comment in the PR conversation. */
export async function createIssueComment(gh: GitHub, r: Repo, number: number, body: string): Promise<{ id: number; url: string }> {
  const { data } = await gh.rest.issues.createComment({ ...r, issue_number: number, body });
  return { id: data.id, url: data.html_url };
}

export type CommentKind = "issue" | "review";

/** Reacts to a conversation comment or a line comment; returns the reaction id or null. */
export async function reactToComment(gh: GitHub, r: Repo, kind: CommentKind, commentId: number, content: "eyes" | "+1" | "rocket"): Promise<number | null> {
  try {
    const { data } =
      kind === "issue"
        ? await gh.rest.reactions.createForIssueComment({ ...r, comment_id: commentId, content })
        : await gh.rest.reactions.createForPullRequestReviewComment({ ...r, comment_id: commentId, content });
    return data.id;
  } catch (err) {
    log.warn({ ...r, commentId, err: errMessage(err) }, "could not react to comment");
    return null;
  }
}

export async function removeCommentReaction(gh: GitHub, r: Repo, kind: CommentKind, commentId: number, reactionId: number): Promise<void> {
  try {
    if (kind === "issue") await gh.rest.reactions.deleteForIssueComment({ ...r, comment_id: commentId, reaction_id: reactionId });
    else await gh.rest.reactions.deleteForPullRequestComment({ ...r, comment_id: commentId, reaction_id: reactionId });
  } catch (err) {
    log.warn({ ...r, commentId, err: errMessage(err) }, "could not remove reaction");
  }
}

/** Whether each line-comment thread is outdated (its lines changed since), keyed by the first comment's id. */
export async function threadsOutdated(gh: GitHub, r: Repo, number: number): Promise<Map<number, boolean>> {
  const out = new Map<number, boolean>();
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const res: {
      repository: {
        pullRequest: {
          reviewThreads: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { isOutdated: boolean; comments: { nodes: { databaseId: number }[] } }[] };
        };
      };
    } = await gh.graphql(
      `query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { isOutdated comments(first: 1) { nodes { databaseId } } }
            }
          }
        }
      }`,
      { owner: r.owner, repo: r.repo, number, cursor },
    );
    const threads = res.repository.pullRequest.reviewThreads;
    for (const t of threads.nodes) {
      const first = t.comments.nodes[0]?.databaseId;
      if (first) out.set(first, t.isOutdated);
    }
    if (!threads.pageInfo.hasNextPage) break;
    cursor = threads.pageInfo.endCursor;
  }
  return out;
}

/** Collapses a comment as resolved. Works on the App's own comments with its current permissions. */
export async function minimizeComment(gh: GitHub, nodeId: string): Promise<void> {
  await gh.graphql(`mutation($id: ID!) { minimizeComment(input: { subjectId: $id, classifier: RESOLVED }) { minimizedComment { isMinimized } } }`, {
    id: nodeId,
  });
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
