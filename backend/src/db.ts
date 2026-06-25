import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as projectsSchema from "./schema/projects";
import * as identitySchema from "./schema/identity";
import * as taxonomySchema from "./schema/taxonomy";
import * as notificationsSchema from "./schema/notifications";
import * as searchSchema from "./schema/search";
import * as settingsSchema from "./schema/settings";
import * as knowledgeSchema from "./schema/knowledge";
import * as assetsSchema from "./schema/assets";
import * as artifactsSchema from "./schema/artifacts";
import * as productionSchema from "./schema/production";
import * as publishingSchema from "./schema/publishing";
import * as analyticsSchema from "./schema/analytics";
import * as ingestionSchema from "./schema/ingestion";
import * as reviewsSchema from "./schema/reviews";
import * as learningsSchema from "./schema/learnings";
import * as aiSchema from "./schema/ai";
import * as positioningSchema from "./schema/positioning";
import * as monetizationSchema from "./schema/monetization";
import * as candidateSchema from "./schema/candidate";
import * as calibrationSchema from "./schema/calibration";
import * as platformAccountSchema from "./schema/platform-account";
import * as contentCalendarSchema from "./schema/content-calendar";
import * as materialLinksSchema from "./schema/material-links";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Versioned migrations live in backend/drizzle (baseline 0000_init derived from the
// per-module *_DDL). The pglite (tests) and node-postgres (runtime) migrators apply this
// ONE folder, so test and runtime schemas share a single source.
const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

// Shared DDL/schema union applied at every createDb(). Each module's tables join
// here as they land (foundation §1: one pglite store, shared db factory).
const schema = {
  ...projectsSchema,
  ...identitySchema,
  ...taxonomySchema,
  ...notificationsSchema,
  ...searchSchema,
  ...settingsSchema,
  ...knowledgeSchema,
  ...assetsSchema,
  ...artifactsSchema,
  ...productionSchema,
  ...publishingSchema,
  ...analyticsSchema,
  ...ingestionSchema,
  ...reviewsSchema,
  ...learningsSchema,
  ...aiSchema,
  ...positioningSchema,
  ...monetizationSchema,
  ...candidateSchema,
  ...calibrationSchema,
  ...platformAccountSchema,
  ...contentCalendarSchema,
  ...materialLinksSchema,
};

export type Db = PgliteDatabase<typeof schema>;

export interface CreateDbOptions {
  // Omit for an in-memory db (tests); pass a directory path for durable storage
  // that survives process restarts (dev/prod).
  dataDir?: string;
}

// Creates a pglite-backed Drizzle db with the Projects-slice schema applied.
// pglite is pure-WASM Postgres — runs in Node, vitest, and the Next server with
// no Docker. Returns the db plus the underlying client for raw exec/teardown.
export async function createDb(options: CreateDbOptions = {}): Promise<{
  db: Db;
  client: PGlite;
}> {
  const client = options.dataDir ? new PGlite(options.dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  // Apply the same versioned migrations the runtime uses. pglite is Postgres-WASM, so the
  // baseline drizzle/0000_init.sql is identical across drivers. Replaces the old
  // per-module client.exec(*_DDL) sequence — the schema is now built by the migration.
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, client };
}

export interface RuntimeDb {
  db: Db;
  pool: Pool;
}

// Runtime (dev/prod) db over a REAL Postgres via node-postgres. Reads DATABASE_URL,
// applies the versioned migrations, returns a Drizzle db typed as the shared `Db`. The
// node-postgres and pglite query APIs are identical at the PgDatabase level, so the single
// localized cast here lets every repo stay typed against one `Db`. Caller owns pool.end().
export async function createRuntimeDb(
  options: { connectionString?: string } = {},
): Promise<RuntimeDb> {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "createRuntimeDb: DATABASE_URL is not set (see .env.local / docker-compose.yml).",
    );
  }
  const pool = new Pool({ connectionString });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Db, pool };
}

export { schema };
