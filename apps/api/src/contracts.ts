// Response shapes of the dashboard API. Type-only: the dashboard imports these.

export type Severity = "critical" | "high" | "medium" | "low" | "nit";
export type ReviewStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "skipped";
export type ReviewStage = "queued" | "fetching" | "summarizing" | "reviewing" | "publishing" | "done";
export type BriefStatus = "none" | "queued" | "running" | "ready" | "failed";
export type Placement = "inline" | "body" | "hidden";
export type Priority = "p0" | "p1" | "p2" | "p3";
export type RiskLevel = "low" | "medium" | "high";
export type FindingStatus = "open" | "fixed" | "dismissed";

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

export type ReviewerInfo = {
  id: string;
  name: string;
  description: string;
  /** Badge id: icon and color of the reviewer's pill. */
  badge: string;
  /** A model reviewer, or a check that runs code. */
  kind: "model" | "check";
};

export type ReviewerRef = Pick<ReviewerInfo, "id" | "name" | "badge">;

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
  /** Null for reviews from before ranking existed. */
  risk: RiskLevel | null;
  priority: Priority | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type FindingItem = {
  id: number;
  reviewer: string;
  /** The reviewers that reported it (two when merged), at most two. */
  reviewers: ReviewerRef[];
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
  /** Confirmed by the verification pass; `evidence` cites the code. */
  verified: boolean;
  evidence: string | null;
  /** A folded extra section, e.g. suggested tests or what Socket found. */
  details: { title: string; body: string } | null;
  status: FindingStatus;
  /** Copy-ready instruction for a coding agent, same text as on GitHub. */
  agentPrompt: string;
  /** The finding's line comment on GitHub, when it has one. */
  commentUrl: string | null;
};

export type TraceStepKey = "fetch" | "triage" | "impact" | "review" | "checks" | "verify" | "learnings" | "fixes" | "publish";

export type TraceStep = { key: TraceStepKey; label: string; status: "ok" | "skipped" | "failed"; ms: number; detail: string };

/** How a review ran. Empty `steps` for reviews from before the trace existed. */
export type ReviewTrace = {
  steps: TraceStep[];
  reviewers?: { id: string; files: number; chunks: number; findings: number; failed: number; skipped: number }[];
  funnel?: { raw: number; anchored: number; confident: number; unique: number; fresh: number; suppressed: number; rejected: number; posted: number };
  rejected?: { title: string; path: string; reason: string }[];
  suppressed?: { title: string; path: string; learningId: number }[];
};

export type TriageFileItem = { path: string; risk: RiskLevel; reviewers: string[] };

export type ImpactItem = { name: string; path: string; line: number; refs: number; files: number; samples: { path: string; line: number; text: string }[] };

/** One model call of the review; `purpose` is e.g. `reviewer:security`, `triage`, `verify`. */
export type CallItem = { purpose: string; model: string; tokensIn: number; tokensOut: number; ms: number; ok: boolean; tools: string[] };

export type SinceLast = { fixed: number; new: number; open: number };

export type ReviewDetail = ReviewListItem & {
  baseSha: string | null;
  /** Up to three short reasons for the risk level. */
  riskReasons: string[];
  priorityReason: string | null;
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
  trace: ReviewTrace;
  triage: TriageFileItem[];
  impact: ImpactItem[];
  calls: CallItem[];
  /** Findings fixed by this push, new in this review, and open on the PR after it. Null on a first review. */
  since: SinceLast | null;
};

export type InstallationPatch = { rules: string };

/** An open, non-draft pull request in the Queue. */
export type QueueItem = {
  repository: { id: number; fullName: string };
  pr: { number: number; title: string; url: string; authorLogin: string; authorAvatar: string | null; createdAt: number };
  /** Null until the PR's first review completes (the Waiting group). */
  priority: Priority | null;
  priorityReason: string | null;
  risk: RiskLevel | null;
  riskReasons: string[];
  /** Open findings on the PR by severity. */
  open: SeverityCounts;
  fixed: number;
  latestReview: { id: number; status: ReviewStatus } | null;
};

export type ReviewerInsight = { id: string; name: string; badge: string; posted: number; fixed: number; dismissed: number; open: number };

export type Insights = {
  days: number;
  reviews: number;
  /** Median minutes from a review being queued to it finishing. */
  medianMinutes: number | null;
  medianTokens: number | null;
  byReviewer: ReviewerInsight[];
  bySeverity: SeverityCounts;
  verification: { confirmed: number; rejected: number; unverified: number };
};

export type LearningSource = "command" | "reaction" | "reply" | "manual";

export type Learning = {
  id: number;
  text: string;
  source: LearningSource;
  author: string | null;
  /** The GitHub comment it came from. */
  url: string | null;
  enabled: boolean;
  createdAt: number;
};

export type LearningCreate = { text: string };
export type LearningPatch = { enabled?: boolean; text?: string };
