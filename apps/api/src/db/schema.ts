import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const installations = sqliteTable("installations", {
  id: integer("id").primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  avatarUrl: text("avatar_url"),
  repositorySelection: text("repository_selection"),
  rules: text("rules").notNull().default(""),
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const repositories = sqliteTable(
  "repositories",
  {
    id: integer("id").primaryKey(),
    installationId: integer("installation_id").notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    private: integer("private", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    rules: text("rules").notNull().default(""),
    disabledReviewers: text("disabled_reviewers", { mode: "json" }).$type<string[]>().notNull().default([]),
    brief: text("brief"),
    briefStatus: text("brief_status").$type<"none" | "queued" | "running" | "ready" | "failed">().notNull().default("none"),
    briefSha: text("brief_sha"),
    briefUpdatedAt: integer("brief_updated_at"),
    removedAt: integer("removed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("repositories_installation_idx").on(t.installationId)],
);

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  action: text("action"),
  receivedAt: integer("received_at").notNull(),
});

export const pullRequests = sqliteTable(
  "pull_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    authorLogin: text("author_login").notNull(),
    authorAvatar: text("author_avatar"),
    url: text("url").notNull(),
    state: text("state").$type<"open" | "closed" | "merged">().notNull().default("open"),
    draft: integer("draft", { mode: "boolean" }).notNull().default(false),
    headSha: text("head_sha").notNull(),
    baseSha: text("base_sha"),
    baseRef: text("base_ref"),
    headRef: text("head_ref"),
    lastReviewedSha: text("last_reviewed_sha"),
    /** Copied from the latest completed review, for the Queue. */
    risk: text("risk").$type<"low" | "medium" | "high">(),
    riskScore: integer("risk_score"),
    riskReasons: text("risk_reasons", { mode: "json" }).$type<string[]>().notNull().default([]),
    priority: text("priority").$type<"p0" | "p1" | "p2" | "p3">(),
    priorityReason: text("priority_reason"),
    labels: text("labels", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("pull_requests_repo_number_idx").on(t.repositoryId, t.number)],
);

export type TriageFile = { path: string; risk: "low" | "medium" | "high"; reviewers: string[] };

/** What the summary said about business impact; kept so labels can re-rank a PR without a model call. */
export type PrioritySignals = { changeType: string | null; businessImpact: string | null; impactArea: string | null };
export type Priority = "p0" | "p1" | "p2" | "p3";

/** A symbol the change touches and the code that references it. */
export type ImpactSymbol = {
  name: string;
  path: string;
  line: number;
  refs: number;
  files: number;
  filePaths: string[];
  samples: { path: string; line: number; text: string }[];
};

export type TraceStep = {
  key: "fetch" | "triage" | "impact" | "review" | "checks" | "verify" | "learnings" | "fixes" | "publish";
  label: string;
  status: "ok" | "skipped" | "failed";
  ms: number;
  detail: string;
};

/** How a review ran, for the dashboard's trace. */
export type ReviewTrace = {
  steps: TraceStep[];
  reviewers?: { id: string; files: number; chunks: number; findings: number; failed: number; skipped: number }[];
  funnel?: { raw: number; anchored: number; confident: number; unique: number; fresh: number; suppressed: number; rejected: number; posted: number };
  rejected?: { title: string; path: string; line?: number | null; reason: string }[];
  /** Rejections that did not hold up, so the finding was kept. */
  unsure?: { title: string; path: string; line: number | null; reason: string }[];
  suppressed?: { title: string; path: string; learningId: number }[];
};

export type ReviewStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "skipped";
export type ReviewStage = "queued" | "fetching" | "summarizing" | "reviewing" | "publishing" | "done";

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pullRequestId: integer("pull_request_id").notNull(),
    repositoryId: integer("repository_id").notNull(),
    headSha: text("head_sha").notNull(),
    baseSha: text("base_sha"),
    kind: text("kind").$type<"full" | "incremental">().notNull().default("full"),
    trigger: text("trigger").notNull(),
    status: text("status").$type<ReviewStatus>().notNull().default("queued"),
    stage: text("stage").$type<ReviewStage>().notNull().default("queued"),
    summary: text("summary"),
    note: text("note"),
    reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(true),
    walkthrough: text("walkthrough", { mode: "json" }).$type<{ path: string; change: string }[]>().notNull().default([]),
    /** Mermaid flowchart of the change, shown folded in the review body. */
    flow: text("flow"),
    triage: text("triage", { mode: "json" }).$type<TriageFile[]>().notNull().default([]),
    impact: text("impact", { mode: "json" }).$type<ImpactSymbol[]>().notNull().default([]),
    risk: text("risk").$type<"low" | "medium" | "high">(),
    riskScore: integer("risk_score"),
    riskReasons: text("risk_reasons", { mode: "json" }).$type<string[]>().notNull().default([]),
    priority: text("priority").$type<Priority>(),
    priorityReason: text("priority_reason"),
    signals: text("signals", { mode: "json" }).$type<PrioritySignals | null>(),
    /** Fixed by this push, new in this review, open on the PR after it; null on a first review. */
    since: text("since", { mode: "json" }).$type<{ fixed: number; new: number; open: number } | null>(),
    trace: text("trace", { mode: "json" }).$type<ReviewTrace>().notNull().default({ steps: [] }),
    filesReviewed: integer("files_reviewed").notNull().default(0),
    filesSkipped: text("files_skipped", { mode: "json" }).$type<{ path: string; reason: string }[]>().notNull().default([]),
    notReviewed: text("not_reviewed", { mode: "json" }).$type<string[]>().notNull().default([]),
    partial: integer("partial", { mode: "boolean" }).notNull().default(false),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    llmCalls: integer("llm_calls").notNull().default(0),
    githubReviewId: integer("github_review_id"),
    githubReviewUrl: text("github_review_url"),
    checkRunId: integer("check_run_id"),
    reactionId: integer("reaction_id"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("reviews_pr_idx").on(t.pullRequestId), index("reviews_repo_idx").on(t.repositoryId, t.createdAt)],
);

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    key: text("key").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: integer("run_after").notNull(),
    cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
    heartbeatAt: integer("heartbeat_at"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("jobs_claim_idx").on(t.status, t.runAfter), index("jobs_key_idx").on(t.key)],
);

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reviewId: integer("review_id"),
    repositoryId: integer("repository_id"),
    purpose: text("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    ms: integer("ms").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
    /** Repository tools the call used, e.g. `read_file app/models.py`. */
    tools: text("tools", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("llm_calls_review_idx").on(t.reviewId)],
);

export const findings = sqliteTable(
  "findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reviewId: integer("review_id").notNull(),
    pullRequestId: integer("pull_request_id").notNull(),
    repositoryId: integer("repository_id").notNull(),
    reviewer: text("reviewer").notNull(),
    path: text("path").notNull(),
    line: integer("line"),
    startLine: integer("start_line"),
    severity: text("severity").$type<"critical" | "high" | "medium" | "low" | "nit">().notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    suggestion: text("suggestion"),
    confidence: real("confidence").notNull(),
    fingerprint: text("fingerprint").notNull(),
    placement: text("placement").$type<"inline" | "body" | "hidden">().notNull(),
    details: text("details", { mode: "json" }).$type<{ title: string; body: string } | null>(),
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
    evidence: text("evidence"),
    status: text("status").$type<"open" | "fixed" | "dismissed">().notNull().default("open"),
    /** The finding's lines at publish time, to find them again after later pushes. */
    snippet: text("snippet"),
    githubCommentId: integer("github_comment_id"),
    githubNodeId: text("github_node_id"),
    githubCommentUrl: text("github_comment_url"),
    fixedInSha: text("fixed_in_sha"),
    fixedAt: integer("fixed_at"),
    dismissedBy: text("dismissed_by"),
    dismissedAt: integer("dismissed_at"),
    learningId: integer("learning_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("findings_review_idx").on(t.reviewId), index("findings_pr_idx").on(t.pullRequestId)],
);

/** Something a team told PR Guard not to flag, applied to later reviews of the repository. */
export const learnings = sqliteTable(
  "learnings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repositoryId: integer("repository_id").notNull(),
    text: text("text").notNull(),
    source: text("source").$type<"command" | "reaction" | "reply" | "manual">().notNull(),
    /** The finding it came from, for matching similar findings later. */
    path: text("path"),
    category: text("category"),
    fingerprint: text("fingerprint"),
    title: text("title"),
    findingId: integer("finding_id"),
    /** Applies to any file of the repository, not only `path`. */
    repoWide: integer("repo_wide", { mode: "boolean" }).notNull().default(false),
    author: text("author"),
    url: text("url"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("learnings_repo_idx").on(t.repositoryId)],
);

export type LearningRow = typeof learnings.$inferSelect;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  githubId: integer("github_id").notNull().unique(),
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const userInstallations = sqliteTable(
  "user_installations",
  {
    userId: integer("user_id").notNull(),
    installationId: integer("installation_id").notNull(),
    /** Org admin (or the account owner): sees and edits every repo of the installation. */
    admin: integer("admin", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.installationId] })],
);

/** Repositories a user can see on GitHub, captured at sign-in. */
export const userRepositories = sqliteTable(
  "user_repositories",
  {
    userId: integer("user_id").notNull(),
    repositoryId: integer("repository_id").notNull(),
    admin: integer("admin", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.repositoryId] })],
);

export type User = typeof users.$inferSelect;
export type Installation = typeof installations.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type PullRequest = typeof pullRequests.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Job = typeof jobs.$inferSelect;
