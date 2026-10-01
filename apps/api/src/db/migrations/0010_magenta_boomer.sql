CREATE TABLE `learnings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_id` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`path` text,
	`category` text,
	`fingerprint` text,
	`title` text,
	`finding_id` integer,
	`repo_wide` integer DEFAULT false NOT NULL,
	`author` text,
	`url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `learnings_repo_idx` ON `learnings` (`repository_id`);