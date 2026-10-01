ALTER TABLE `pull_requests` ADD `priority` text;--> statement-breakpoint
ALTER TABLE `pull_requests` ADD `priority_reason` text;--> statement-breakpoint
ALTER TABLE `pull_requests` ADD `labels` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `priority` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `priority_reason` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `signals` text;