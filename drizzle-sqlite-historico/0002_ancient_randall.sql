CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
-- Las dos empresas se insertan aquí, antes de que `reports.company_id` las
-- referencie: la columna nueva se crea con DEFAULT 'corp' para poder asignar
-- los reportes que ya existían, y esa fila tiene que estar presente o la clave
-- foránea quedaría apuntando a la nada.
INSERT OR IGNORE INTO `companies` (`id`, `name`) VALUES ('corp', 'Corp');--> statement-breakpoint
INSERT OR IGNORE INTO `companies` (`id`, `name`) VALUES ('saas', 'SaaS');--> statement-breakpoint
CREATE TABLE `user_companies` (
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `company_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_companies_company_idx` ON `user_companies` (`company_id`);--> statement-breakpoint
-- Los usuarios que ya existían reciben acceso a ambas empresas. Sin esto, al
-- aplicar la migración nadie podría entrar: el sistema exige pertenecer al
-- menos a una. El admin puede ajustar los accesos después desde el panel.
INSERT OR IGNORE INTO `user_companies` (`user_id`, `company_id`)
	SELECT `id`, 'corp' FROM `users`;--> statement-breakpoint
INSERT OR IGNORE INTO `user_companies` (`user_id`, `company_id`)
	SELECT `id`, 'saas' FROM `users`;--> statement-breakpoint
DROP INDEX `reports_author_idx`;--> statement-breakpoint
DROP INDEX `reports_status_idx`;--> statement-breakpoint
DROP INDEX `reports_created_at_idx`;--> statement-breakpoint
ALTER TABLE `reports` ADD `company_id` text DEFAULT 'corp' NOT NULL REFERENCES companies(id);--> statement-breakpoint
CREATE INDEX `reports_company_created_idx` ON `reports` (`company_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_company_author_idx` ON `reports` (`company_id`,`author_id`);--> statement-breakpoint
CREATE INDEX `reports_company_status_idx` ON `reports` (`company_id`,`status`);
