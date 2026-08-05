CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `clients_company_active_idx` ON `clients` (`company_id`,`is_active`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `client_id` text REFERENCES clients(id);--> statement-breakpoint
CREATE INDEX `quotes_client_idx` ON `quotes` (`client_id`);