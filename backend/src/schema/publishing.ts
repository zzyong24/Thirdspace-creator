import { pgTable, text, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

// Publishing tables (data-model §9 lines 509-537 + contract/src/resources/
// publishing.ts; SPEC §13.3 "发布" group). Canonical defs live in shared infra
// (@creatoros/backend) because createDb() applies PUBLISHING_DDL at init alongside
// PROJECTS_DDL / PRODUCTION_DDL / … (foundation §1: the pglite/Drizzle db factory
// is the shared-infra home). The publishing module
// (frontend/src/server/modules/publishing) re-exports these so there is ONE source
// of truth, mirroring production (backend/src/schema/production.ts ↔
// publishing.db-schema.ts).
//
// `Publication` is an external fact-of-record (SPEC §13.3/§22): there is no
// internal publish queue — statuses mirror external platform reality and the
// actual side-effect is mocked behind MockPublisher (foundation §4). The
// (user_id, account_id, platform, external_id) partial-unique index is the idempotency anchor
// (data-model line 865 / rule 10): a re-publish to the same platform reuses the
// row, never duplicates.
//
// Ownership: `user_id` lives on EVERY owned row (it is NOT in the data-model ER
// diagram — it is the ownership column required by foundation §1/§3). The revision
// child is additionally scoped through the parent publication's ownership gate
// (foundation §2). Timestamps are ISO-8601 text (contract `iso8601`), enums are
// text, json is jsonb. The §12 state machine (Publication.status) is enforced in
// the SERVICE, not the schema.
//
// Monetization-weighted (seven-step spec §2.0/§4.4): the revision's
// `platform_settings` jsonb carries the conversion-oriented publish config
// (scheduled_at, 引导转化 CTA copy, 评论区置顶, conversion link refs) so the publish
// fact is conversion-aware from the start, not traffic-only. `platform_tags`
// carries the discovery + conversion tag set.

export const publications = pgTable("publications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号 · SPEC §D/§6] 按号隔离(激活 platform-account.ts DDL 预留的 account_id 列;
  //   非本文件新增列)。采集导入作品 stamp 归号;nullable 稳定终态(存量 / 未选号兜底)。
  groupId: text("group_id"),
  groupVersion: integer("group_version"),
  membershipVersion: integer("membership_version"),
  accountId: text("account_id").notNull(), // [T-332 S1] per-account 收口 NOT NULL(迁移 0042;lenient→strict)
  contentOutputId: text("content_output_id").notNull(),
  platform: text("platform").notNull(),
  accountReference: text("account_reference").notNull(),
  status: text("status").notNull().default("draft"),
  currentRevisionId: text("current_revision_id"), // nullable until first revision
  draftAdoptionKey: text("draft_adoption_key"),
  draftAdoptionDigest: text("draft_adoption_digest"),
  externalId: text("external_id"), // nullable until published (idempotency anchor)
  externalUrl: text("external_url"), // nullable until published
  scheduledAt: text("scheduled_at"), // nullable → contract iso8601|null
  publishedAt: text("published_at"), // nullable → contract iso8601|null
  removedAt: text("removed_at"), // nullable → contract iso8601|null
  // [T-073] 平台侧可见性:非空 = 该作品在抖音端「仅自己可见/已隐藏」的同步时刻
  // (采集明细导出「审核状态」列驱动);null = 可见。与 removed_at(平台已删)正交。
  hiddenAt: text("hidden_at"), // nullable → contract iso8601|null
  // [T-033] 平台侧审核状态(detail 导出 .xlsx「审核状态」列原值,如「已通过」/「仅自己可见」/
  // 「私密」/「审核中」/「未通过」)。list 默认按 '已通过' 过滤;NULL = 旧数据(未跑过 detail ingest)向后
  // 兼容视为可见。与 hiddenAt 正交:作者主动私密 vs 平台审核态。两道都过才显。
  platformStatus: text("platform_status"), // nullable → contract string|null
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
},table=>[uniqueIndex("publications_draft_adoption_ux").on(table.userId,table.accountId,table.draftAdoptionKey)]);

// PublicationRevision is append-only/immutable (contract resource extends
// BaseEntity only — NO updatedAt; data-model line 524-537). New edits = new
// revision row, never an UPDATE.
export const publicationRevisions = pgTable("publication_revisions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  publicationId: text("publication_id").notNull(),
  revisionNumber: integer("revision_number").notNull().default(1),
  visualAdoptionKey: text("visual_adoption_key"),
  visualAdoptionDigest: text("visual_adoption_digest"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  coverAssetId: text("cover_asset_id"), // nullable — validated via AssetsService
  coverAssetFileId: text("cover_asset_file_id"), // immutable selected file for result-first cover
  category: text("category").notNull().default(""),
  series: text("series").notNull().default(""),
  platformTags: jsonb("platform_tags").notNull().default([]),
  platformSettings: jsonb("platform_settings").notNull().default({}),
  createdAt: text("created_at").notNull(),
},table=>[uniqueIndex("publication_revisions_visual_adoption_ux").on(table.publicationId,table.visualAdoptionKey)]);

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - publications_external_account_ux: PARTIAL unique on (user_id, account_id, platform, external_id) WHERE
//     external_id IS NOT NULL (data-model line 865 / rule 10) — the idempotency
//     anchor for re-publish.
//   - publications_user_ix / publications_output_ix: user-scoped + per-output
//     lookups (the Publishing Workspace lists per ContentOutput).
//   - publication_revisions_pub_ix: per-publication revision ordering.
export const PUBLISHING_DDL = `
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_output_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  current_revision_id TEXT,
  external_id TEXT,
  external_url TEXT,
  scheduled_at TEXT,
  published_at TEXT,
  removed_at TEXT,
  hidden_at TEXT,
  platform_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- [T-073] 存量库补列(CREATE TABLE IF NOT EXISTS 不会给既有表加列;与 platform-account
-- 的 account_id 同款 ALTER 兜底,幂等)。
ALTER TABLE publications ADD COLUMN IF NOT EXISTS hidden_at TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS platform_status TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS publications_external_account_ux ON publications(user_id, account_id, platform, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS publications_user_ix ON publications(user_id);
CREATE INDEX IF NOT EXISTS publications_output_ix ON publications(content_output_id);
CREATE TABLE IF NOT EXISTS publication_revisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_asset_id TEXT,
  category TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  platform_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  platform_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publication_revisions_pub_ix ON publication_revisions(publication_id, revision_number);
`;
