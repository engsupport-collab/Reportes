PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`quote_number` text,
	`project_name` text NOT NULL,
	`client_id` text NOT NULL,
	`status` text DEFAULT 'en_curso' NOT NULL,
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
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_quotes`("id", "company_id", "quote_number", "project_name", "client_id", "status", "purchase_order_no", "due_date", "description", "amount", "revisada", "created_by", "created_at", "updated_at", "updated_by") SELECT "id", "company_id", "quote_number", "project_name", "client_id", "status", "purchase_order_no", "due_date", "description", "amount", "revisada", "created_by", "created_at", "updated_at", "updated_by" FROM `quotes`;--> statement-breakpoint
DROP TABLE `quotes`;--> statement-breakpoint
ALTER TABLE `__new_quotes` RENAME TO `quotes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `quotes_company_status_idx` ON `quotes` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `quotes_company_revisada_idx` ON `quotes` (`company_id`,`revisada`);--> statement-breakpoint
CREATE INDEX `quotes_project_idx` ON `quotes` (`project_name`);--> statement-breakpoint
CREATE INDEX `quotes_client_idx` ON `quotes` (`client_id`);