// Generates the baseline drizzle migration (0000_init) from the existing, known-good
// *_DDL constants — in the SAME dependency order createDb() applied them. This bootstraps
// the migration system from battle-tested SQL (zero schema drift) instead of regenerating
// from possibly-incomplete pgTable defs. Future schema changes use drizzle-kit generate.
// Run: pnpm --filter @creatoros/backend exec tsx scripts/gen-baseline-migration.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PROJECTS_DDL } from "../src/schema/projects";
import { IDENTITY_DDL } from "../src/schema/identity";
import { TAXONOMY_DDL } from "../src/schema/taxonomy";
import { NOTIFICATIONS_DDL } from "../src/schema/notifications";
import { SEARCH_DDL } from "../src/schema/search";
import { SETTINGS_DDL } from "../src/schema/settings";
import { KNOWLEDGE_DDL } from "../src/schema/knowledge";
import { ASSETS_DDL } from "../src/schema/assets";
import { ARTIFACTS_DDL } from "../src/schema/artifacts";
import { PRODUCTION_DDL } from "../src/schema/production";
import { PUBLISHING_DDL } from "../src/schema/publishing";
import { ANALYTICS_DDL } from "../src/schema/analytics";
import { INGESTION_DDL } from "../src/schema/ingestion";
import { REVIEWS_DDL } from "../src/schema/reviews";
import { LEARNINGS_DDL } from "../src/schema/learnings";
import { AI_DDL } from "../src/schema/ai";
import { POSITIONING_DDL } from "../src/schema/positioning";
import { MONETIZATION_DDL } from "../src/schema/monetization";
import { CANDIDATE_DDL } from "../src/schema/candidate";
import { CALIBRATION_DDL } from "../src/schema/calibration";
import { PLATFORM_ACCOUNT_DDL } from "../src/schema/platform-account";
import { CONTENT_CALENDAR_DDL } from "../src/schema/content-calendar";
import { MATERIAL_LINKS_DDL } from "../src/schema/material-links";

// Order MUST match createDb()'s exec order (FK / ALTER dependencies).
const ORDER: ReadonlyArray<readonly [string, string]> = [
  ["projects", PROJECTS_DDL],
  ["identity", IDENTITY_DDL],
  ["taxonomy", TAXONOMY_DDL],
  ["notifications", NOTIFICATIONS_DDL],
  ["search", SEARCH_DDL],
  ["settings", SETTINGS_DDL],
  ["knowledge", KNOWLEDGE_DDL],
  ["assets", ASSETS_DDL],
  ["artifacts", ARTIFACTS_DDL],
  ["production", PRODUCTION_DDL],
  ["publishing", PUBLISHING_DDL],
  ["analytics", ANALYTICS_DDL],
  ["ingestion", INGESTION_DDL],
  ["reviews", REVIEWS_DDL],
  ["learnings", LEARNINGS_DDL],
  ["ai", AI_DDL],
  ["positioning", POSITIONING_DDL],
  ["monetization", MONETIZATION_DDL],
  ["candidate", CANDIDATE_DDL],
  ["calibration", CALIBRATION_DDL],
  ["platform-account", PLATFORM_ACCOUNT_DDL],
  ["content-calendar", CONTENT_CALENDAR_DDL],
  ["material-links", MATERIAL_LINKS_DDL],
];

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../drizzle");
mkdirSync(resolve(OUT, "meta"), { recursive: true });

// One chunk per module, separated by drizzle's statement-breakpoint marker. Each chunk is
// itself multi-statement DDL (CREATE TABLE / INDEX / ALTER) — run as a single exec by both
// the node-postgres and pglite migrators (simple-query protocol allows multi-statement).
const sql =
  ORDER.map(([name, ddl]) => `-- ${name}\n${ddl.trim()}`).join(
    "\n--> statement-breakpoint\n",
  ) + "\n";
writeFileSync(resolve(OUT, "0000_init.sql"), sql, "utf8");

const journal = {
  version: "7",
  dialect: "postgresql",
  entries: [
    { idx: 0, version: "7", when: Date.now(), tag: "0000_init", breakpoints: true },
  ],
};
writeFileSync(
  resolve(OUT, "meta/_journal.json"),
  JSON.stringify(journal, null, 2) + "\n",
  "utf8",
);

console.log(
  `wrote drizzle/0000_init.sql (${sql.length} bytes, ${ORDER.length} modules) + meta/_journal.json`,
);
