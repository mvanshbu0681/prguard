import { Hono, type Context } from "hono";
import type { FindingItem, ReviewDetail } from "../../contracts.ts";
import * as findingsRepo from "../../db/repos/findings.ts";
import * as pullsRepo from "../../db/repos/pulls.ts";
import * as reviewsRepo from "../../db/repos/reviews.ts";
import type { ReviewStatus } from "../../db/schema.ts";
import { installationClient, splitFullName } from "../../github/app.ts";
import { getPull } from "../../github/pr.ts";
import { triggerReview } from "../../review/lifecycle.ts";
import { reviewItems } from "../serialize.ts";
import { accessibleRepo, requireUser, visibleRepos, type AuthEnv } from "../session.ts";

const STATUS_FILTERS: Record<string, ReviewStatus[]> = {
  active: ["queued", "running"],
  completed: ["completed"],
  failed: ["failed"],
};

export const reviews = new Hono<AuthEnv>();

reviews.use("*", requireUser);

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, nit: 4 } as const;

function lineUrl(fullName: string, sha: string, path: string, line: number | null, startLine: number | null): string {
  const base = `https://github.com/${fullName}/blob/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  if (line === null) return base;
  return startLine && startLine !== line ? `${base}#L${startLine}-L${line}` : `${base}#L${line}`;
}

function visibleReview(c: Context<AuthEnv>, id: number) {
  const review = reviewsRepo.get(id);
  if (!review) return undefined;
  const repo = accessibleRepo(c, review.repositoryId);
  return repo ? { review, repo } : undefined;
}

reviews.get("/:id", (c) => {
  const found = visibleReview(c, Number(c.req.param("id")));
  if (!found) return c.json({ error: "Review not found." }, 404);
  const { review, repo } = found;
  const item = reviewItems([review])[0]!;
  const findings: FindingItem[] = findingsRepo
    .listForReview(review.id)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.confidence - a.confidence)
    .map((f) => ({
      id: f.id,
      reviewer: f.reviewer,
      path: f.path,
      line: f.line,
      startLine: f.startLine,
      severity: f.severity,
      category: f.category,
      title: f.title,
      body: f.body,
      suggestion: f.suggestion,
      placement: f.placement,
      url: lineUrl(repo.fullName, review.headSha, f.path, f.line, f.startLine),
    }));
  const body: ReviewDetail = {
    ...item,
    baseSha: review.baseSha,
    summary: review.summary,
    note: review.note,
    walkthrough: review.walkthrough,
    filesReviewed: review.filesReviewed,
    filesSkipped: review.filesSkipped,
    notReviewed: review.notReviewed,
    findings,
    usage: { tokensIn: review.tokensIn, tokensOut: review.tokensOut, calls: review.llmCalls },
    githubReviewUrl: review.githubReviewUrl,
  };
  return c.json(body);
});

reviews.post("/:id/rerun", async (c) => {
  const found = visibleReview(c, Number(c.req.param("id")));
  if (!found) return c.json({ error: "Review not found." }, 404);
  const { review, repo } = found;
  if (!repo.enabled) return c.json({ error: "Reviews are off for this repository." }, 409);
  const pr = pullsRepo.get(review.pullRequestId);
  if (!pr) return c.json({ error: "Review not found." }, 404);

  const gh = await installationClient(repo.installationId);
  const live = await getPull(gh, splitFullName(repo.fullName), pr.number);
  if (live.state !== "open") return c.json({ error: "The pull request is closed." }, 409);
  pullsRepo.update(pr.id, { headSha: live.head.sha, baseSha: live.base.sha, title: live.title, draft: Boolean(live.draft) });
  const next = await triggerReview(repo, pullsRepo.get(pr.id)!, "manual");
  return c.json({ id: next.id });
});

reviews.get("/", (c) => {
  const visible = visibleRepos(c).map((r) => r.id);
  const repo = Number(c.req.query("repo"));
  const repositoryIds = repo ? visible.filter((id) => id === repo) : visible;
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
  const statuses = STATUS_FILTERS[c.req.query("status") ?? ""];
  return c.json(reviewItems(reviewsRepo.list({ repositoryIds, statuses, limit })));
});
