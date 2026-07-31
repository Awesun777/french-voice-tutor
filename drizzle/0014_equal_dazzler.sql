CREATE TABLE `video_cues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lessonId` int NOT NULL,
	`idx` int NOT NULL,
	`startMs` int NOT NULL,
	`endMs` int NOT NULL,
	`text` text NOT NULL,
	`tokensJson` text NOT NULL,
	CONSTRAINT `video_cues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`youtubeId` varchar(32) NOT NULL,
	`title` varchar(512) NOT NULL,
	`channel` varchar(256),
	`durationSec` int NOT NULL,
	`thumbnailUrl` varchar(1024),
	`level` varchar(16),
	`addedAt` bigint NOT NULL,
	CONSTRAINT `video_lessons_id` PRIMARY KEY(`id`),
	CONSTRAINT `video_lessons_youtubeId_unique` UNIQUE(`youtubeId`)
);
