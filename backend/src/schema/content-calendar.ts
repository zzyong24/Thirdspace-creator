import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";

// ContentCalendarEntry / PublishingCadence tables (七步整合设计 §7.2 — 发布节奏 /
// 内容日历; contract v0.4 resources/content-calendar.ts; SPEC §13 "内容日历
// (content-calendar)" group). The canonical defs live in shared infra
// (@creatoros/backend) because createDb() applies CONTENT_CALENDAR_DDL at init
// alongside PLATFORM_ACCOUNT_DDL / PUBLISHING_DDL / … (the pglite/Drizzle db factory
// is the shared-infra home, foundation §1). The content-calendar module
// (frontend/src/server/modules/content-calendar) re-exports these so there is ONE
// source of truth, mirroring platform-account/candidate (db-schema.ts ↔
// backend/src/schema/*).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY owned row (the
// ownership boundary; SPEC §10/§20 — stamped at write time from ctx.userId).
// Timestamps are ISO-8601 TEXT (to match the contract `iso8601` strings).
//
// ContentCalendarEntry — a per-account planned/published/missed slot. It is bound to
// a ContentOutput OR a Candidate (never both) or neither (an intent slot). The
// not-both-bound invariant is enforced in the repository (a pglite CHECK across two
// nullable columns is awkward; the repo guard + the service guard are the contract).
// `status` runs the §7.2 machine planned→published/missed (missed→published|planned),
// driven by the reconcile pass reading publishing reality (C-4) — NOT a re-implemented
// publishing machine. `published_at` is stamped only on a real → published flip.
//
// PublishingCadence — a per-account target frequency + preferred slots. UNIQUE
// (user_id, account_id): one cadence per account per user (the upsert anchor). The
// attainment / 断更 computation is DERIVED (cadenceAttainmentResource is not stored).

export const contentCalendarEntries = pgTable(
  "content_calendar_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(), // denormalized ownership column (foundation §1)
    groupId: text("group_id"),
    accountId: text("account_id"),
    membershipVersion: integer("membership_version"), // soft FK → platform_accounts.id
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    plannedDate: text("planned_date").notNull(),
    plannedAt: text("planned_at").notNull(), // legacy compatibility anchor
    contentOutputId: text("content_output_id"), // nullable; never set with candidateId
    candidateId: text("candidate_id"), // nullable; never set with contentOutputId
    status: text("status").notNull().default("planned"), // planned|published|missed
    note: text("note").notNull().default(""),
    publishedAt: text("published_at"), // nullable; real publication reconcile only
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "content_calendar_entries_planned_date_ck",
      sql`${table.plannedDate} ~ '^\\d{4}-\\d{2}-\\d{2}$' AND to_char(to_date(${table.plannedDate}, 'YYYY-MM-DD'), 'YYYY-MM-DD') = ${table.plannedDate}`,
    ),
    uniqueIndex("content_calendar_entries_active_project_ux")
      .on(table.userId, table.accountId, table.projectId)
      .where(
        sql`${table.groupId} IS NULL AND ${table.projectId} IS NOT NULL AND ${table.status} IN ('planned', 'missed')`,
      ),
    uniqueIndex("content_calendar_entries_group_active_project_ux").on(table.userId, table.groupId, table.projectId).where(sql`${table.groupId} IS NOT NULL AND ${table.projectId} IS NOT NULL AND ${table.status} IN ('planned', 'missed')`),
    index("content_calendar_entries_date_window_ix").on(
      table.userId,
      table.accountId,
      table.plannedDate,
    ),
  ],
);

export const publishingCadences = pgTable("publishing_cadences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column
  groupId: text("group_id"),
  accountId: text("account_id"), // soft FK → platform_accounts.id
  frequency: text("frequency").notNull(), // daily|weekly|biweekly|monthly|custom
  preferredSlots: jsonb("preferred_slots").notNull().default([]), // [{weekday,time}]
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - content_calendar_entries_window_ix: (user_id, account_id, planned_at) backs the
//     window list query (listEntries / entriesForAttainment).
//   - publishing_cadences_account_ux: UNIQUE (user_id, account_id) — one cadence per
//     account per user; the upsert anchor + dup backstop.
// All idempotent (CREATE … IF NOT EXISTS).
export const CONTENT_CALENDAR_DDL = `
CREATE TABLE IF NOT EXISTS content_calendar_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  group_id TEXT,
  membership_version INTEGER,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  planned_date TEXT NOT NULL
    CONSTRAINT content_calendar_entries_planned_date_ck
    CHECK (
      planned_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
      AND to_char(to_date(planned_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = planned_date
    ),
  planned_at TEXT NOT NULL,
  content_output_id TEXT,
  candidate_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  note TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publishing_cadences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  group_id TEXT,
  frequency TEXT NOT NULL,
  preferred_slots JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS content_calendar_entries_active_project_ux
  ON content_calendar_entries(user_id, account_id, project_id)
  WHERE project_id IS NOT NULL AND status IN ('planned', 'missed');
CREATE INDEX IF NOT EXISTS content_calendar_entries_date_window_ix
  ON content_calendar_entries(user_id, account_id, planned_date);
CREATE UNIQUE INDEX IF NOT EXISTS publishing_cadences_account_ux ON publishing_cadences(user_id, account_id);
`;
