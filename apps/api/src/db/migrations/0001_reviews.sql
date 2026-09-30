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
CREATE INDEX `reviews_repo_idx` ON `reviews` (`repository_id`,`created_at`);