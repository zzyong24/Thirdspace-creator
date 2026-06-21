import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as projectsSchema from "./schema/projects";
import * as identitySchema from "./schema/identity";
import * as taxonomySchema from "./schema/taxonomy";
import { PROJECTS_DDL } from "./schema/projects";
import { IDENTITY_DDL } from "./schema/identity";
import { TAXONOMY_DDL } from "./schema/taxonomy";

// Shared DDL/schema union applied at every createDb(). Each module's tables join
// here as they land (foundation §1: one pglite store, shared db factory).
const schema = { ...projectsSchema, ...identitySchema, ...taxonomySchema };

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
  const db = drizzle(client, { schema });
  return { db, client };
}

export { schema };
