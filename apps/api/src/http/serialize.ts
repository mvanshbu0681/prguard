import type { RepoDetail, RepoListItem, ReviewListItem, SeverityCounts } from "../contracts.ts";
import * as findingsRepo from "../db/repos/findings.ts";
import * as installationsRepo from "../db/repos/installations.ts";
import * as pullsRepo from "../db/repos/pulls.ts";
import * as repositoriesRepo from "../db/repos/repositories.ts";
import * as reviewsRepo from "../db/repos/reviews.ts";
import type { Repository, Review } from "../db/schema.ts";
import { reviewers } from "../review/reviewers/index.ts";

const ZERO: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };

export function reviewItems(list: Review[]): ReviewListItem[] {
  const pulls = pullsRepo.getMany([...new Set(list.map((r) => r.pullRequestId))]);
  const counts = findingsRepo.countsByReview(list.map((r) => r.id));
  const repos = new Map<number, Repository | undefined>();
  for (const id of new Set(list.map((r) => r.repositoryId))) repos.set(id, repositoriesRepo.get(id));

  return list.flatMap((review) => {
    const pr = pulls.get(review.pullRequestId);
    const repo = repos.get(review.repositoryId);
    if (!pr || !repo) return [];
    const c = counts.get(review.id) ?? ZERO;
    return [
      {
        id: review.id,
        status: review.status,
        stage: review.stage,
        kind: review.kind,
        trigger: review.trigger,
        repository: { id: repo.id, fullName: repo.fullName },
        pr: { number: pr.number, title: pr.title, url: pr.url, authorLogin: pr.authorLogin, authorAvatar: pr.authorAvatar },
        headSha: review.headSha,
        counts: c,
        findingsTotal: c.critical + c.high + c.medium + c.low + c.nit,
        reviewed: review.reviewed,
        partial: review.partial,
        error: review.error,
        createdAt: review.createdAt,
        startedAt: review.startedAt,
        finishedAt: review.finishedAt,
      },
    ];
  });
}

export function repoItems(repos: Repository[]): RepoListItem[] {
  const latest = reviewsRepo.latestByRepos(repos.map((r) => r.id));
  const accounts = new Map(installationsRepo.listActive().map((i) => [i.id, i.accountLogin]));
  return repos.map((repo) => {
    const last = latest.get(repo.id);
    return {
      id: repo.id,
      fullName: repo.fullName,
      installationId: repo.installationId,
      accountLogin: accounts.get(repo.installationId) ?? repo.fullName.split("/")[0]!,
      private: repo.private,
      enabled: repo.enabled,
      briefStatus: repo.briefStatus,
      briefUpdatedAt: repo.briefUpdatedAt,
      lastReview: last ? { id: last.id, status: last.status, createdAt: last.createdAt } : null,
    };
  });
}

export function repoDetail(repo: Repository): RepoDetail {
  return {
    ...repoItems([repo])[0]!,
    defaultBranch: repo.defaultBranch,
    brief: repo.brief,
    rules: repo.rules,
    disabledReviewers: repo.disabledReviewers,
    reviewers: reviewers.map((r) => ({ id: r.id, name: r.name, description: r.description })),
    recentReviews: reviewItems(reviewsRepo.list({ repositoryIds: [repo.id], limit: 10 })),
    url: `https://github.com/${repo.fullName}`,
  };
}
