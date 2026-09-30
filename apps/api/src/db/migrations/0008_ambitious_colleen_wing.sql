ALTER TABLE `findings` ADD `status` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `findings` ADD `snippet` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `github_comment_id` integer;--> statement-breakpoint
ALTER TABLE `findings` ADD `github_node_id` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `github_comment_url` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `fixed_in_sha` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `fixed_at` integer;--> statement-breakpoint
ALTER TABLE `findings` ADD `dismissed_by` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `dismissed_at` integer;--> statement-breakpoint
ALTER TABLE `findings` ADD `learning_id` integer;