CREATE TABLE `review_settings` (
	`userId` int NOT NULL,
	`dailyNewWords` int NOT NULL DEFAULT 10,
	`dailyReviewCap` int NOT NULL DEFAULT 20,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `review_settings_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `sm2EaseFactor` double DEFAULT 2.5 NOT NULL;--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `sm2Interval` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `sm2Repetitions` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `sm2NextReviewAt` bigint;--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `sm2LastReviewAt` bigint;--> statement-breakpoint
ALTER TABLE `vocab_entries` ADD `sm2Status` enum('new','learning','review','mastered') DEFAULT 'new' NOT NULL;