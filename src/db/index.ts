import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { posts, verifiedUsers } from "./schema.js";

const sqlite = new Database("verified-accounts.db");
export const db = drizzle(sqlite);

// Create tables if they don't exist (fallback for migration issues)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS verified_users (
    subject_did TEXT NOT NULL,
    verifier_did TEXT NOT NULL,
    verified_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (subject_did, verifier_did)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_did TEXT NOT NULL,
    verifier_did TEXT NOT NULL,
    post_uri TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );
`);

export { posts, verifiedUsers };
