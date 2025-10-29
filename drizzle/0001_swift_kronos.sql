CREATE TABLE `list_items` (
	`subject_did` text NOT NULL,
	`verifier_did` text NOT NULL,
	`list_did` text NOT NULL,
	`list_uri` text NOT NULL,
	`added_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`subject_did`, `verifier_did`, `list_did`)
);
