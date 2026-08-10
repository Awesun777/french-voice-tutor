ALTER TABLE `ops_todos` ADD `priority` varchar(8) DEFAULT 'med' NOT NULL;--> statement-breakpoint
ALTER TABLE `ops_todos` ADD `deadline` bigint;