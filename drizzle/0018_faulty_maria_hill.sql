CREATE TABLE `job_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`job` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'running',
	`summary` varchar(512),
	`started_at` bigint NOT NULL,
	`finished_at` bigint,
	CONSTRAINT `job_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ops_todos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`text` varchar(512) NOT NULL,
	`done` int NOT NULL DEFAULT 0,
	`position` int NOT NULL DEFAULT 0,
	`created_at` bigint NOT NULL,
	`done_at` bigint,
	CONSTRAINT `ops_todos_id` PRIMARY KEY(`id`)
);
