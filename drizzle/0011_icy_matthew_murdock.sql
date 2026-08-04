CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`quote_number` text,
	`project_name` text NOT NULL,
	`client_name` text NOT NULL,
	`status` text DEFAULT 'pendiente_autorizacion' NOT NULL,
	`purchase_order_no` text,
	`due_date` integer,
	`description` text,
	`amount` integer,
	`revisada` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quotes_company_status_idx` ON `quotes` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `quotes_company_revisada_idx` ON `quotes` (`company_id`,`revisada`);--> statement-breakpoint
CREATE INDEX `quotes_project_idx` ON `quotes` (`project_name`);--> statement-breakpoint
ALTER TABLE `reports` ADD `quote_id` text REFERENCES quotes(id);--> statement-breakpoint
CREATE INDEX `reports_quote_idx` ON `reports` (`quote_id`);