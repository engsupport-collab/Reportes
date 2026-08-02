CREATE TABLE `report_viaticos` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`blob_url` text NOT NULL,
	`thumbnail_url` text,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`amount` integer,
	`uploaded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `report_viaticos_report_idx` ON `report_viaticos` (`report_id`);