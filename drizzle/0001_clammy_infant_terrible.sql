CREATE TABLE `login_attempts` (
	`ip` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer NOT NULL,
	`last_attempt_at` integer NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE INDEX `login_attempts_last_idx` ON `login_attempts` (`last_attempt_at`);