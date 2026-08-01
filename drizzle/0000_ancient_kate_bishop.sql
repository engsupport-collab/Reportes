CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`blob_url` text NOT NULL,
	`thumbnail_url` text,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_report_idx` ON `attachments` (`report_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`project_name` text NOT NULL,
	`purchase_order_no` text NOT NULL,
	`client_name` text NOT NULL,
	`work_date` integer NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'en_proceso' NOT NULL,
	`completed_at` integer,
	`signature_url` text,
	`signature_name` text,
	`signed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reports_author_idx` ON `reports` (`author_id`);--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE INDEX `reports_created_at_idx` ON `reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `reports_work_date_idx` ON `reports` (`work_date`);--> statement-breakpoint
CREATE INDEX `reports_purchase_order_idx` ON `reports` (`purchase_order_no`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text DEFAULT 'empleado' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);