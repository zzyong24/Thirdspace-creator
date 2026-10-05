import {sql} from "drizzle-orm";
import { pgTable,index, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

/** The output and its formal Artifact are born together in one transaction. */
export const graphicPostAnchors = pgTable("graphic_post_anchors", {
 groupId:text("group_id"),
  outputId: text("output_id").primaryKey(),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"),
  artifactId: text("artifact_id").notNull(),
  clientRequestId: text("client_request_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
 uniqueIndex("graphic_post_anchors_group_46c5ab4b").on(table.userId,table.groupId,table.clientRequestId).where(sql`${table.groupId} IS NOT NULL AND ${table.accountId} IS NULL`),
 index("graphic_post_anchors_group_scope_idx").on(table.userId,table.groupId),
  uniqueIndex("graphic_post_anchors_artifact_ux").on(table.artifactId),
  uniqueIndex("graphic_post_anchors_account_output_ux").on(table.accountId, table.outputId),
  uniqueIndex("graphic_post_anchors_request_ux").on(table.userId, table.accountId, table.clientRequestId),
]);

/** The AI task is the immutable source of a typed candidate; this table is an account-scoped projection. */
export const graphicPostTextCandidates = pgTable("graphic_post_text_candidates", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  outputId: text("output_id").notNull(),
  projectId: text("project_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"),
  baseVersionId: text("base_version_id").notNull(),
  kind: text("kind").notNull(),
  value: jsonb("value").notNull(),
  sourceRefs: jsonb("source_refs").notNull(),
  ruleSnapshotRef: jsonb("rule_snapshot_ref"),
  appliedRules: text("applied_rules").notNull(),
  createdAt: text("created_at").notNull(),
},t=>[index("graphic_post_text_candidates_group_scope_idx").on(t.userId,t.groupId)]);
