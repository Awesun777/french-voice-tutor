CREATE TABLE `article_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`articleId` int NOT NULL,
	`idx` int NOT NULL,
	`kind` enum('heading','paragraph') NOT NULL DEFAULT 'paragraph',
	`text` text NOT NULL,
	`tokensJson` text NOT NULL,
	CONSTRAINT `article_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`title` varchar(512) NOT NULL,
	`source` varchar(256),
	`url` varchar(1024),
	`summary` text,
	`imageUrl` varchar(1024),
	`level` varchar(16),
	`wordCount` int NOT NULL,
	`publishedAt` bigint,
	`addedAt` bigint NOT NULL,
	CONSTRAINT `articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `articles_slug_unique` UNIQUE(`slug`)
);
