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
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`action` text,
	`received_at` integer NOT NULL
);
