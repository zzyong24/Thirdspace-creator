import {sql} from "drizzle-orm";
import { pgTable,index, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const articleAnchors = pgTable("article_anchors", {
 groupId:text("group_id"),
  outputId: text("output_id").primaryKey(),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"),
  artifactId: text("artifact_id").notNull(),
  clientRequestId: text("client_request_id"),
  requestDigest: text("request_digest"),
  createdAt: text("created_at").notNull(),
}, (table) => [
 uniqueIndex("article_anchors_group_46c5ab4b").on(table.userId,table.groupId,table.clientRequestId).where(sql`${table.groupId} IS NOT NULL AND ${table.accountId} IS NULL`),
 index("article_anchors_group_scope_idx").on(table.userId,table.groupId),
  uniqueIndex("article_anchors_artifact_ux").on(table.artifactId),
  uniqueIndex("article_anchors_request_ux").on(table.userId, table.accountId, table.clientRequestId),
]);

export const articleCandidates = pgTable("article_candidates", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  outputId: text("output_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"),
  baseVersionId: text("base_version_id").notNull(),
  methodVersion: text("method_version").notNull(),
  brandProfileVersionId: text("brand_profile_version_id"),
  clientRequestId: text("client_request_id").notNull(),
  proposal: jsonb("proposal").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
 uniqueIndex("article_candidates_group_46c5ab4b").on(table.userId,table.groupId,table.clientRequestId).where(sql`${table.groupId} IS NOT NULL AND ${table.accountId} IS NULL`),
 index("article_candidates_group_scope_idx").on(table.userId,table.groupId),
  uniqueIndex("article_candidates_request_ux").on(table.userId, table.accountId, table.clientRequestId),
]);

/** Single-field results are separate from whole-article candidates. */
export const articleTextCandidates = pgTable("article_text_candidates", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  outputId: text("output_id").notNull(),
  artifactId: text("artifact_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"),
  baseVersionId: text("base_version_id").notNull(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  sourceRefs: jsonb("source_refs").notNull(),
  ruleSnapshotRef: jsonb("rule_snapshot_ref"),
  appliedRules: text("applied_rules").notNull(),
  createdAt: text("created_at").notNull(),
},t=>[index("article_text_candidates_group_scope_idx").on(t.userId,t.groupId)]);
