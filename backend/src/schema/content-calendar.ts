import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

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

export const contentCalendarEntries = pgTable("content_calendar_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column (foundation §1)
  accountId: text("account_id").notNull(), // soft FK → platform_accounts.id
  plannedAt: text("planned_at").notNull(), // ISO-8601 (the slot instant)
  contentOutputId: text("content_output_id"), // nullable; never set with candidateId
  candidateId: text("candidate_id"), // nullable; never set with contentOutputId
  status: text("status").notNull().default("planned"), // planned|published|missed
  note: text("note").notNull().default(""),
  publishedAt: text("published_at"), // nullable; stamped on → published
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const publishingCadences = pgTable("publishing_cadences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column
  accountId: text("account_id").notNull(), // soft FK → platform_accounts.id
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
  frequency TEXT NOT NULL,
  preferred_slots JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_calendar_entries_window_ix ON content_calendar_entries(user_id, account_id, planned_at);
CREATE UNIQUE INDEX IF NOT EXISTS publishing_cadences_account_ux ON publishing_cadences(user_id, account_id);
`;
