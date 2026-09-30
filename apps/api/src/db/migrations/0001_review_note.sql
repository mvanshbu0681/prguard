ALTER TABLE `reviews` ADD `note` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `reviewed` integer DEFAULT true NOT NULL;