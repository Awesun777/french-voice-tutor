CREATE TABLE `ops_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`cost_cents` int NOT NULL DEFAULT 0,
	`cycle` varchar(8) NOT NULL DEFAULT 'monthly',
	`renews_at` bigint,
	`notes` varchar(512),
	`active` int NOT NULL DEFAULT 1,
	`created_at` bigint NOT NULL,
	CONSTRAINT `ops_subscriptions_id` PRIMARY KEY(`id`)
);
