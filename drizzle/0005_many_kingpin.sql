DROP INDEX "attachments_report_idx";--> statement-breakpoint
DROP INDEX "login_attempts_last_idx";--> statement-breakpoint
DROP INDEX "report_tags_tag_idx";--> statement-breakpoint
DROP INDEX "reports_company_created_idx";--> statement-breakpoint
DROP INDEX "reports_company_author_idx";--> statement-breakpoint
DROP INDEX "reports_company_status_idx";--> statement-breakpoint
DROP INDEX "reports_company_service_idx";--> statement-breakpoint
DROP INDEX "reports_work_date_idx";--> statement-breakpoint
DROP INDEX "reports_purchase_order_idx";--> statement-breakpoint
DROP INDEX "user_companies_company_idx";--> statement-breakpoint
DROP INDEX "users_username_unique";--> statement-breakpoint
DROP INDEX "users_role_idx";--> statement-breakpoint
ALTER TABLE `reports` ALTER COLUMN "purchase_order_no" TO "purchase_order_no" text;--> statement-breakpoint
CREATE INDEX `attachments_report_idx` ON `attachments` (`report_id`);--> statement-breakpoint
CREATE INDEX `login_attempts_last_idx` ON `login_attempts` (`last_attempt_at`);--> statement-breakpoint
CREATE INDEX `report_tags_tag_idx` ON `report_tags` (`tag`);--> statement-breakpoint
CREATE INDEX `reports_company_created_idx` ON `reports` (`company_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_company_author_idx` ON `reports` (`company_id`,`author_id`);--> statement-breakpoint
CREATE INDEX `reports_company_status_idx` ON `reports` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `reports_company_service_idx` ON `reports` (`company_id`,`service_type`);--> statement-breakpoint
CREATE INDEX `reports_work_date_idx` ON `reports` (`work_date`);--> statement-breakpoint
CREATE INDEX `reports_purchase_order_idx` ON `reports` (`purchase_order_no`);--> statement-breakpoint
CREATE INDEX `user_companies_company_idx` ON `user_companies` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
ALTER TABLE `reports` ALTER COLUMN "details" TO "details" text;