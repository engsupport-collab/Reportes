ALTER TABLE `reports` ADD `service_type` text;--> statement-breakpoint
CREATE INDEX `reports_company_service_idx` ON `reports` (`company_id`,`service_type`);