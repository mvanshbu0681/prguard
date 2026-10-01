ALTER TABLE `findings` ADD `verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `findings` ADD `evidence` text;