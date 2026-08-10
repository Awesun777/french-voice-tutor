CREATE TABLE `test_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`mime_type` varchar(64) NOT NULL,
	`size_bytes` bigint NOT NULL,
	`notes` varchar(512),
	`created_at` bigint NOT NULL,
	CONSTRAINT `test_logs_id` PRIMARY KEY(`id`)
);
