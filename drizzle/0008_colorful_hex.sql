CREATE TABLE `google_accounts` (
	`userId` int NOT NULL,
	`googleId` varchar(128) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` text,
	`picture` text,
	`accessToken` text NOT NULL,
	`refreshToken` text,
	`expiresAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_accounts_userId` PRIMARY KEY(`userId`),
	CONSTRAINT `google_accounts_googleId_unique` UNIQUE(`googleId`)
);
--> statement-breakpoint
CREATE TABLE `google_drive_settings` (
	`userId` int NOT NULL,
	`sourceDocUrl` text,
	`exportFolderId` varchar(256),
	`lastSyncedAt` bigint,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_drive_settings_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `pending_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`term` varchar(512) NOT NULL,
	`translation` varchar(512) NOT NULL,
	`kind` enum('word','phrase') NOT NULL DEFAULT 'word',
	`dateKey` varchar(100) NOT NULL,
	`status` enum('pending','accepted','skipped') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pending_imports_id` PRIMARY KEY(`id`)
);
