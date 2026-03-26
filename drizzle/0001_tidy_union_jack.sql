CREATE TABLE `quiz_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`score` int NOT NULL,
	`total` int NOT NULL,
	`direction` enum('fr2en','en2fr') NOT NULL,
	`bucketStart` varchar(10),
	`bucketEnd` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quiz_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tutor_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tutor_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vocab_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`term` varchar(512) NOT NULL,
	`translation` varchar(512) NOT NULL,
	`entryKind` enum('word','phrase') NOT NULL DEFAULT 'word',
	`lessonSource` varchar(256),
	`starred` boolean NOT NULL DEFAULT false,
	`quizCount` int NOT NULL DEFAULT 0,
	`lastQuizzed` timestamp,
	`dateKey` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vocab_entries_id` PRIMARY KEY(`id`)
);
