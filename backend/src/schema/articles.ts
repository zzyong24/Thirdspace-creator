import { pgTable, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const articleAnchors = pgTable("article_anchors", {
  outputId: text("output_id").primaryKey(),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  clientRequestId: text("client_request_id"),
  requestDigest: text("request_digest"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("article_anchors_artifact_ux").on(table.artifactId),
  uniqueIndex("article_anchors_request_ux").on(table.userId, table.accountId, table.clientRequestId),
]);

export const articleCandidates = pgTable("article_candidates", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  outputId: text("output_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  baseVersionId: text("base_version_id").notNull(),
  methodVersion: text("method_version").notNull(),
  brandProfileVersionId: text("brand_profile_version_id"),
  clientRequestId: text("client_request_id").notNull(),
  proposal: jsonb("proposal").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("article_candidates_request_ux").on(table.userId, table.accountId, table.clientRequestId),
]);

/** Single-field results are separate from whole-article candidates. */
export const articleTextCandidates = pgTable("article_text_candidates", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  outputId: text("output_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  baseVersionId: text("base_version_id").notNull(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  sourceRefs: jsonb("source_refs").notNull(),
  ruleSnapshotRef: jsonb("rule_snapshot_ref"),
  appliedRules: text("applied_rules").notNull(),
  createdAt: text("created_at").notNull(),
});
