import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const sqlite = new Database("verified-accounts.db");
const db = drizzle(sqlite);

// Run migrations
migrate(db, { migrationsFolder: "./drizzle" });

console.log("Database migration completed!");
sqlite.close();
