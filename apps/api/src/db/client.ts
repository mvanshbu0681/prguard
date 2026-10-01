import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { config } from "../config.ts";
import * as schema from "./schema.ts";

mkdirSync(config.dataDir, { recursive: true });

export const sqlite = new Database(join(config.dataDir, "prguard.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");

export const db = drizzle(sqlite, { schema });

export function migrateDb(): void {
  migrate(db, { migrationsFolder: join(import.meta.dirname, "migrations") });
}
