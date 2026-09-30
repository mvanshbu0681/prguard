// Response shapes of the dashboard API. Type-only: the dashboard imports these.

export type Severity = "critical" | "high" | "medium" | "low" | "nit";
export type ReviewStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "skipped";
export type ReviewStage = "queued" | "fetching" | "summarizing" | "reviewing" | "publishing" | "done";
export type BriefStatus = "none" | "queued" | "running" | "ready" | "failed";
export type Placement = "inline" | "body" | "hidden";

export type ApiError = { error: string };

export type Me = {
  user: { id: number; login: string; name: string | null; avatarUrl: string | null };
  installations: InstallationSummary[];
  installUrl: string;
};

export type InstallationSummary = {
  id: number;
  accountLogin: string;
  accountType: string;
  avatarUrl: string | null;
  rules: string;
  repoCount: number;
  settingsUrl: string;
  /** Whether this user may change the org rules. */
  canEdit: boolean;
};

export type SeverityCounts = Record<Severity, number>;

export type RepoListItem = {
  id: number;
  fullName: string;
  installationId: number;
  accountLogin: string;
  private: boolean;
  enabled: boolean;
  briefStatus: BriefStatus;
  briefUpdatedAt: number | null;
  lastReview: { id: number; status: ReviewStatus; createdAt: number } | null;
  /** Whether this user may change the repository's settings. */
  canEdit: boolean;
};

export type ReviewerInfo = { id: string; name: string; description: string };

export type RepoDetail = RepoListItem & {
  defaultBranch: string;
  brief: string | null;
  rules: string;
  disabledReviewers: string[];
  reviewers: ReviewerInfo[];
  recentReviews: ReviewListItem[];
  url: string;
};

export type RepoPatch = {
  enabled?: boolean;
  rules?: string;
  brief?: string;
  disabledReviewers?: string[];
};

export type ReviewListItem = {
  id: number;
  status: ReviewStatus;
  stage: ReviewStage;
  kind: "full" | "incremental";
  trigger: string;
  repository: { id: number; fullName: string };
  pr: { number: number; title: string; url: string; authorLogin: string; authorAvatar: string | null };
  headSha: string;
  counts: SeverityCounts;
  findingsTotal: number;
  /** False when no reviewer ran (docs only, nothing to review, reviewers off, no new changes). */
  reviewed: boolean;
  partial: boolean;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type FindingItem = {
  id: number;
  reviewer: string;
  path: string;
  line: number | null;
  startLine: number | null;
  severity: Severity;
  category: string;
  title: string;
  body: string;
  suggestion: string | null;
  placement: Placement;
  url: string;
  /** Stable id used in links from GitHub: `/reviews/<id>#f-<fingerprint>`. */
  fingerprint: string;
};

export type ReviewDetail = ReviewListItem & {
  baseSha: string | null;
  summary: string | null;
  /** One line explaining a limited review (docs only, partial, reviewers off…), or null. */
  note: string | null;
  walkthrough: { path: string; change: string }[];
  filesReviewed: number;
  filesSkipped: { path: string; reason: string }[];
  notReviewed: string[];
  findings: FindingItem[];
  usage: { tokensIn: number; tokensOut: number; calls: number };
  githubReviewUrl: string | null;
};

export type InstallationPatch = { rules: string };
