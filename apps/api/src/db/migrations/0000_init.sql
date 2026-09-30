CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`pull_request_id` integer NOT NULL,
	`repository_id` integer NOT NULL,
	`reviewer` text NOT NULL,
	`path` text NOT NULL,
	`line` integer,
	`start_line` integer,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`suggestion` text,
	`confidence` real NOT NULL,
	`fingerprint` text NOT NULL,
	`placement` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `findings_review_idx` ON `findings` (`review_id`);--> statement-breakpoint
CREATE INDEX `findings_pr_idx` ON `findings` (`pull_request_id`);--> statement-breakpoint
CREATE TABLE `installations` (
	`id` integer PRIMARY KEY NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`avatar_url` text,
	`repository_selection` text,
	`rules` text DEFAULT '' NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` integer NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`heartbeat_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `jobs_key_idx` ON `jobs` (`key`);--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer,
	`repository_id` integer,
	`purpose` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`ms` integer NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_calls_review_idx` ON `llm_calls` (`review_id`);--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`author_login` text NOT NULL,
	`author_avatar` text,
	`url` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`draft` integer DEFAULT false NOT NULL,
	`head_sha` text NOT NULL,
	`base_sha` text,
	`base_ref` text,
	`head_ref` text,
	`last_reviewed_sha` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pull_requests_repo_number_idx` ON `pull_requests` (`repository_id`,`number`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` integer PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`private` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`rules` text DEFAULT '' NOT NULL,
	`disabled_reviewers` text DEFAULT '[]' NOT NULL,
	`brief` text,
	`brief_status` text DEFAULT 'none' NOT NULL,
	`brief_sha` text,
	`brief_updated_at` integer,
	`removed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `repositories_installation_idx` ON `repositories` (`installation_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pull_request_id` integer NOT NULL,
	`repository_id` integer NOT NULL,
	`head_sha` text NOT NULL,
	`base_sha` text,
	`kind` text DEFAULT 'full' NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'queued' NOT NULL,
	`summary` text,
	`walkthrough` text DEFAULT '[]' NOT NULL,
	`files_reviewed` integer DEFAULT 0 NOT NULL,
	`files_skipped` text DEFAULT '[]' NOT NULL,
	`not_reviewed` text DEFAULT '[]' NOT NULL,
	`partial` integer DEFAULT false NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`llm_calls` integer DEFAULT 0 NOT NULL,
	`github_review_id` integer,
	`github_review_url` text,
	`check_run_id` integer,
	`reaction_id` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `reviews_pr_idx` ON `reviews` (`pull_request_id`);--> statement-breakpoint
CREATE INDEX `reviews_repo_idx` ON `reviews` (`repository_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_installations` (
	`user_id` integer NOT NULL,
	`installation_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `installation_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`github_id` integer NOT NULL,
	`login` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_unique` ON `users` (`github_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`action` text,
	`received_at` integer NOT NULL
);
