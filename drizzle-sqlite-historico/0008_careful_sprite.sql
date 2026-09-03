ALTER TABLE `report_viaticos` ADD `concepto` text;--> statement-breakpoint
ALTER TABLE `report_viaticos` ADD `fecha_gasto` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `type` text DEFAULT 'servicio' NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `linked_report_id` text REFERENCES reports(id);--> statement-breakpoint
ALTER TABLE `reports` ADD `quote_number` text;--> statement-breakpoint
CREATE INDEX `reports_type_idx` ON `reports` (`company_id`,`type`);--> statement-breakpoint
CREATE INDEX `reports_linked_report_idx` ON `reports` (`linked_report_id`);