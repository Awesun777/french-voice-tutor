CREATE TABLE `ingest_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(512) NOT NULL,
	`youtube_id` varchar(32) NOT NULL,
	`level` varchar(8) NOT NULL DEFAULT 'B1',
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`error` text,
	`title` varchar(512),
	`requested_by` int NOT NULL,
	`requested_at` bigint NOT NULL,
	`started_at` bigint,
	`finished_at` bigint,
	CONSTRAINT `ingest_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `articles` ADD `titleEn` varchar(512);--> statement-breakpoint
ALTER TABLE `articles` ADD `section` varchar(128);