CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_did` text NOT NULL,
	`verifier_did` text NOT NULL,
	`post_uri` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verified_users` (
	`subject_did` text NOT NULL,
	`verifier_did` text NOT NULL,
	`verified_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`subject_did`, `verifier_did`)
);
