import {
  pgTable,
  text,
  integer,
  bigint,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// Assets tables (data-model §「ASSET」/「ASSET_FILE」 lines 358–384 + contract/
// src/resources/assets.ts; SPEC §13 "素材库" group). Canonical defs live in shared
// infra (@creatoros/backend) because createDb() applies ASSETS_DDL at init
// alongside PROJECTS_DDL / IDENTITY_DDL / … (foundation §1: the pglite/Drizzle db
// factory is the shared-infra home). The assets module
// (frontend/src/server/modules/assets) re-exports these so there is ONE source of
// truth, mirroring knowledge (backend/src/schema/knowledge.ts ↔
// assets.db-schema.ts).
//
// Ownership: `user_id` lives on the owned root rows (assets, asset_uploads); the
// children (asset_files) inherit ownership via their FK to the asset and are
// scoped through the parent's ownership check (foundation §2). Timestamps are
// ISO-8601 text (contract `iso8601`), enums are text, json is jsonb. §12: assets
// are born `active` (active ↔ archived; active → deleted trash / deleted →
// active restore). Asset files are append-only version rows.

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号 · OQ1 裁决=按号独立] 按号隔离维度(soft FK → platform_accounts.id)。
  // nullable 稳定终态(SPEC §6 MAJOR-3)。子表 asset_files 无 user_id、经父门透传属主,
  // 不加 account_id。asset_uploads 是临时上传会话(非内容表),不按号隔离。
  groupId: text("group_id"),
  accountId: text("account_id"), // [T-332 S1] per-account 收口 NOT NULL(迁移 0042)
  currentFileId: text("current_file_id"), // nullable until first file → contract id (set on completeUpload)
  assetType: text("asset_type").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  isFavorite: boolean("is_favorite").notNull().default(false), // 收藏 flag (toggled by assets.favorite.toggle)
  deletedAt: text("deleted_at"), // nullable → contract iso8601|null
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const assetFiles = pgTable("asset_files", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  // fileSize is bigint in the data-model; the contract DTO is z.number().int().
  // pglite returns bigint as a JS number for values in range; the repo Number()s
  // it defensively on read so the DTO stays numeric.
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  checksum: text("checksum").notNull().default(""),
  width: integer("width"), // nullable
  height: integer("height"), // nullable
  durationMs: integer("duration_ms"), // nullable
  mediaMetadata: jsonb("media_metadata").notNull().default({}),
  // [T-146 切片 a] 文档文本抽取(用户上传素材主权)。extractedText = 确定性抽取的全文
  // (PDF/docx/md·txt),可空;extractStatus ∈ pending|done|failed|unsupported,三类诚实降级
  // 的落点(failed=加密/扫描/损坏无文本层;unsupported=非文档类型不抽)。要点卡 materialSummary
  // 走 mediaMetadata jsonb(无新列)。两列 nullable → 存量文件/非文档行留 NULL。
  extractedText: text("extracted_text"), // nullable
  extractStatus: text("extract_status"), // nullable — pending|done|failed|unsupported
  createdAt: text("created_at").notNull(),
  // No updated_at — files are immutable version rows (matches assetFileResource).
});

// Upload-session table (owned). `assetUpload` DTO is the projection of `created`
// rows returned by POST /assets/uploads (phase 1 of the two-phase upload).
export const assetUploads = pgTable("asset_uploads", {
  id: text("id").primaryKey(), // == uploadId
  userId: text("user_id").notNull(),
  groupId: text("group_id"),
  accountId: text("account_id"),
  assetId: text("asset_id").notNull(),
  assetType: text("asset_type").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storageKey: text("storage_key").notNull(),
  status: text("status").notNull().default("created"), // created → completed
  completedAssetFileId: text("completed_asset_file_id"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - assets_user_status_ix: user-scoped gallery list lookups (status filter).
//   - asset_files_asset_version_ux: one row per (asset, version) — append-only.
//   - asset_files_storage_key_ux: storageKey is globally unique (presigned key).
export const ASSETS_DDL = `
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  current_file_id TEXT,
  asset_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_user_status_ix ON assets(user_id, status);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE assets ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_assets_user_account ON assets (user_id, account_id);
CREATE TABLE IF NOT EXISTS asset_files (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  checksum TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  media_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_text TEXT,
  extract_status TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_files_asset_version_ux ON asset_files(asset_id, version_number);
CREATE TABLE IF NOT EXISTS asset_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  completed_asset_file_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
ALTER TABLE asset_uploads ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE asset_uploads ADD COLUMN IF NOT EXISTS asset_id TEXT;
ALTER TABLE asset_uploads ADD COLUMN IF NOT EXISTS completed_asset_file_id TEXT;
CREATE INDEX IF NOT EXISTS asset_uploads_owner_ix ON asset_uploads(user_id, account_id);
`;
