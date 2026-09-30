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
CREATE INDEX `findings_pr_idx` ON `findings` (`pull_request_id`);