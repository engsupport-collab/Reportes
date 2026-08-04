PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text DEFAULT 'corp' NOT NULL,
	`author_id` text NOT NULL,
	`type` text DEFAULT 'servicio' NOT NULL,
	`linked_report_id` text,
	`quote_id` text,
	`project_name` text NOT NULL,
	`purchase_order_no` text,
	`quote_number` text,
	`client_name` text NOT NULL,
	`work_date` integer NOT NULL,
	`details` text,
	`service_type` text,
	`status` text DEFAULT 'en_proceso' NOT NULL,
	`completed_at` integer,
	`signature_url` text,
	`signature_name` text,
	`signature_email` text,
	`signed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`linked_report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_reports`("id", "company_id", "author_id", "type", "linked_report_id", "quote_id", "project_name", "purchase_order_no", "quote_number", "client_name", "work_date", "details", "service_type", "status", "completed_at", "signature_url", "signature_name", "signature_email", "signed_at", "created_at", "updated_at", "updated_by") SELECT "id", "company_id", "author_id", "type", "linked_report_id", "quote_id", "project_name", "purchase_order_no", "quote_number", "client_name", "work_date", "details", "service_type", "status", "completed_at", "signature_url", "signature_name", "signature_email", "signed_at", "created_at", "updated_at", "updated_by" FROM `reports`;--> statement-breakpoint
DROP TABLE `reports`;--> statement-breakpoint
ALTER TABLE `__new_reports` RENAME TO `reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reports_company_created_idx` ON `reports` (`company_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_company_author_idx` ON `reports` (`company_id`,`author_id`);--> statement-breakpoint
CREATE INDEX `reports_company_status_idx` ON `reports` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `reports_company_service_idx` ON `reports` (`company_id`,`service_type`);--> statement-breakpoint
CREATE INDEX `reports_work_date_idx` ON `reports` (`work_date`);--> statement-breakpoint
CREATE INDEX `reports_purchase_order_idx` ON `reports` (`purchase_order_no`);--> statement-breakpoint
CREATE INDEX `reports_type_idx` ON `reports` (`company_id`,`type`);--> statement-breakpoint
CREATE INDEX `reports_linked_report_idx` ON `reports` (`linked_report_id`);--> statement-breakpoint
CREATE INDEX `reports_quote_idx` ON `reports` (`quote_id`);--> statement-breakpoint
ALTER TABLE `companies` ADD `currency` text DEFAULT 'COP' NOT NULL;--> statement-breakpoint
UPDATE `companies` SET `currency` = 'USD' WHERE `id` = 'corp';