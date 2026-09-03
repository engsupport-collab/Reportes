CREATE TABLE `report_tags` (
	`report_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`report_id`, `tag`),
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `report_tags_tag_idx` ON `report_tags` (`tag`);