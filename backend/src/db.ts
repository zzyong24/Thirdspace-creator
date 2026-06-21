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
import { PROJECTS_DDL } from "./schema/projects";
import { IDENTITY_DDL } from "./schema/identity";
import { TAXONOMY_DDL } from "./schema/taxonomy";
import { NOTIFICATIONS_DDL } from "./schema/notifications";
import { SEARCH_DDL } from "./schema/search";
import { SETTINGS_DDL } from "./schema/settings";
import { KNOWLEDGE_DDL } from "./schema/knowledge";
import { ASSETS_DDL } from "./schema/assets";
import { ARTIFACTS_DDL } from "./schema/artifacts";
import { PRODUCTION_DDL } from "./schema/production";
import { PUBLISHING_DDL } from "./schema/publishing";
import { ANALYTICS_DDL } from "./schema/analytics";
import { INGESTION_DDL } from "./schema/ingestion";
import { REVIEWS_DDL } from "./schema/reviews";
import { LEARNINGS_DDL } from "./schema/learnings";
import { AI_DDL } from "./schema/ai";
import { POSITIONING_DDL } from "./schema/positioning";

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
  await client.exec(PROJECTS_DDL);
  await client.exec(IDENTITY_DDL);
  await client.exec(TAXONOMY_DDL);
  await client.exec(NOTIFICATIONS_DDL);
  await client.exec(SEARCH_DDL);
  await client.exec(SETTINGS_DDL);
  await client.exec(KNOWLEDGE_DDL);
  await client.exec(ASSETS_DDL);
  await client.exec(ARTIFACTS_DDL);
  await client.exec(PRODUCTION_DDL);
  await client.exec(PUBLISHING_DDL);
  await client.exec(ANALYTICS_DDL);
  await client.exec(INGESTION_DDL);
  await client.exec(REVIEWS_DDL);
  await client.exec(LEARNINGS_DDL);
  await client.exec(AI_DDL);
  // Positioning (module 17, Wave 5) — runs AFTER PROJECTS_DDL so its ALTER TABLE
  // projects ADD COLUMN positioning_statement_id finds the projects table.
  await client.exec(POSITIONING_DDL);
  const db = drizzle(client, { schema });
  return { db, client };
}

export { schema };
