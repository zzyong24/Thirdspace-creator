import { pgTable, text, integer, real, jsonb } from "drizzle-orm/pg-core";

// Artifacts tables (data-model §9 + contract/src/resources/artifacts.ts; SPEC §13
// "Artifacts" group). Canonical defs live in shared infra (@creatoros/backend)
// because createDb() applies ARTIFACTS_DDL at init alongside PROJECTS_DDL /
// KNOWLEDGE_DDL / ASSETS_DDL / … (foundation §1: the pglite/Drizzle db factory is
// the shared-infra home). The artifacts module
// (frontend/src/server/modules/artifacts) re-exports these so there is ONE source
// of truth, mirroring knowledge (backend/src/schema/knowledge.ts ↔
// knowledge.db-schema.ts).
//
// Ownership: `user_id` lives on the owned-root row only (`artifacts`). The
// children — `artifact_versions`, the structured tables (thesis/script/evidence/
// timeline), and `artifact_relations` — inherit ownership transitively via their
// FK to the owning artifact/version and are scoped through the repo's
// `requireArtifact(ctx, id)` gate that filters `eq(artifacts.userId, userId)`
// (foundation §2). Timestamps are ISO-8601 text (contract `iso8601`), enums are
// text, json is jsonb. data-model §9 rules 6–7: `artifact_versions` is
// append-only/IMMUTABLE (NO updated_at; never UPDATE/DELETE), and
// `current_version_id` always points at a version of the SAME artifact.

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号] 按号隔离维度(soft FK → platform_accounts.id)。nullable 稳定终态
  // (SPEC §6 MAJOR-3)。子表 artifact_versions/relations/script_sections/timeline_segments
  // 无 user_id、经 requireArtifact 门透传属主,故不加 account_id(同 user_id 范式)。
  accountId: text("account_id").notNull(), // [T-332 S1] per-account 收口 NOT NULL(迁移 0042)
  projectId: text("project_id").notNull(),
  contentOutputId: text("content_output_id"), // nullable → contract id|null
  // Nullable in the DB only during the create UoW (artifact row inserted before
  // version #1); the contract resource requires it (id, non-null), and create
  // immediately repoints it, so a fully-formed artifact never exposes null.
  currentVersionId: text("current_version_id"),
  stage: text("stage").notNull(),
  artifactType: text("artifact_type").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("drafting"),
  archivedAt: text("archived_at"), // nullable → contract iso8601|null
  // T-030-D4 (F1, SPEC §4.5): provenance of the CURRENT content. nullable —
  // legacy rows are null ≡ treated as 'user'. 'reconstructed' marks an AI
  // history-back-inference (auto-fill) that has NOT been user-confirmed; the
  // §5 原则3/§9 铁律2 audit tag. Flips to 'user' once the user edits/confirms.
  origin: text("origin"), // nullable → 'user' | 'reconstructed' | null
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const artifactVersions = pgTable("artifact_versions", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  contentText: text("content_text").notNull().default(""),
  contentData: jsonb("content_data").notNull().default({}),
  changeSummary: text("change_summary").notNull().default(""),
  createdByType: text("created_by_type").notNull().default("user"),
  aiTaskId: text("ai_task_id"), // nullable → contract id|null
  createdAt: text("created_at").notNull(),
  // No updated_at — versions are immutable (data-model §9 rule 6; matches
  // artifactVersionResource which has createdAt only).
});

export const artifactRelations = pgTable("artifact_relations", {
  id: text("id").primaryKey(),
  sourceArtifactId: text("source_artifact_id").notNull(),
  targetArtifactId: text("target_artifact_id").notNull(),
  relationType: text("relation_type").notNull(),
  createdAt: text("created_at").notNull(),
});

// [T-055f SPEC §9] thesis_nodes 表退役(用户拍板③,迁移 0015 DROP)。

export const scriptSections = pgTable("script_sections", {
  id: text("id").primaryKey(),
  artifactVersionId: text("artifact_version_id").notNull(),
  parentSectionId: text("parent_section_id"),
  sectionType: text("section_type").notNull(),
  title: text("title").notNull().default(""),
  content: text("content").notNull().default(""),
  position: integer("position").notNull().default(0),
  startSeconds: real("start_seconds"), // nullable → contract number|null
  endSeconds: real("end_seconds"),
});

// [T-055f SPEC §9] evidence_links 表退役(用户拍板③,迁移 0015 DROP)。

export const timelineSegments = pgTable("timeline_segments", {
  id: text("id").primaryKey(),
  artifactVersionId: text("artifact_version_id").notNull(),
  scriptSectionId: text("script_section_id"),
  title: text("title").notNull().default(""),
  position: integer("position").notNull().default(0),
  startMs: integer("start_ms").notNull().default(0),
  endMs: integer("end_ms").notNull().default(0),
  productionData: jsonb("production_data").notNull().default({}),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - artifacts_user_project_ix: user-scoped per-project list lookups.
//   - artifact_versions_artifact_ix: per-artifact version lookups (max number).
//   - artifact_relations_source_ix: per-source relation lookups.
//   - structured-table *_version_ix: per-version structured-content lookups.
export const ARTIFACTS_DDL = `
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  current_version_id TEXT,
  stage TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafting',
  archived_at TEXT,
  origin TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_user_project_ix ON artifacts(user_id, project_id, created_at);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_artifacts_user_account ON artifacts (user_id, account_id);
CREATE TABLE IF NOT EXISTS artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  content_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT NOT NULL DEFAULT '',
  created_by_type TEXT NOT NULL DEFAULT 'user',
  ai_task_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS artifact_versions_artifact_ix ON artifact_versions(artifact_id, version_number);
CREATE TABLE IF NOT EXISTS artifact_relations (
  id TEXT PRIMARY KEY,
  source_artifact_id TEXT NOT NULL,
  target_artifact_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS artifact_relations_source_ix ON artifact_relations(source_artifact_id);
CREATE TABLE IF NOT EXISTS script_sections (
  id TEXT PRIMARY KEY,
  artifact_version_id TEXT NOT NULL,
  parent_section_id TEXT,
  section_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  start_seconds REAL,
  end_seconds REAL
);
CREATE INDEX IF NOT EXISTS script_sections_version_ix ON script_sections(artifact_version_id, position);
CREATE TABLE IF NOT EXISTS timeline_segments (
  id TEXT PRIMARY KEY,
  artifact_version_id TEXT NOT NULL,
  script_section_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 0,
  production_data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS timeline_segments_version_ix ON timeline_segments(artifact_version_id, position);
`;
