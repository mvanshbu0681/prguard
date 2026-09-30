import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export type Installation = typeof installations.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
