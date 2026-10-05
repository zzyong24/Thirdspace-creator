import { pgTable, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

/** The output and its formal Artifact are born together in one transaction. */
export const graphicPostAnchors = pgTable("graphic_post_anchors", {
  outputId: text("output_id").primaryKey(),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  clientRequestId: text("client_request_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("graphic_post_anchors_artifact_ux").on(table.artifactId),
  uniqueIndex("graphic_post_anchors_account_output_ux").on(table.accountId, table.outputId),
  uniqueIndex("graphic_post_anchors_request_ux").on(table.userId, table.accountId, table.clientRequestId),
]);

/** The AI task is the immutable source of a typed candidate; this table is an account-scoped projection. */
export const graphicPostTextCandidates = pgTable("graphic_post_text_candidates", {
  id: text("id").primaryKey(),
  outputId: text("output_id").notNull(),
  projectId: text("project_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  baseVersionId: text("base_version_id").notNull(),
  kind: text("kind").notNull(),
  value: jsonb("value").notNull(),
  sourceRefs: jsonb("source_refs").notNull(),
  ruleSnapshotRef: jsonb("rule_snapshot_ref"),
  appliedRules: text("applied_rules").notNull(),
  createdAt: text("created_at").notNull(),
});
