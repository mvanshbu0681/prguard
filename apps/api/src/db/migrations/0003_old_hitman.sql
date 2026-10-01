ALTER TABLE `reviews` ADD `triage` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `trace` text DEFAULT '{"steps":[]}' NOT NULL;