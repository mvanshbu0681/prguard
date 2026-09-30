import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("pull_requests_repo_number_idx").on(t.repositoryId, t.number)],
);

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
    walkthrough: text("walkthrough", { mode: "json" }).$type<{ path: string; change: string }[]>().notNull().default([]),
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
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("llm_calls_review_idx").on(t.reviewId)],
);

export type Installation = typeof installations.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type PullRequest = typeof pullRequests.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Job = typeof jobs.$inferSelect;
