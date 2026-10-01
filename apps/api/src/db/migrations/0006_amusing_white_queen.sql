ALTER TABLE `pull_requests` ADD `risk` text;--> statement-breakpoint
ALTER TABLE `pull_requests` ADD `risk_score` integer;--> statement-breakpoint
ALTER TABLE `pull_requests` ADD `risk_reasons` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `risk` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `risk_score` integer;--> statement-breakpoint
ALTER TABLE `reviews` ADD `risk_reasons` text DEFAULT '[]' NOT NULL;