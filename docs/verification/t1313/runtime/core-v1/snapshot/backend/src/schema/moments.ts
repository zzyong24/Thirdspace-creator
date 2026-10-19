import {sql} from "drizzle-orm";
import {pgTable,index,text,jsonb,uniqueIndex} from "drizzle-orm/pg-core";
/** 朋友圈正式身份；正文与文件引用仅存于 Artifact 不可变版本。 */
export const momentsAnchors=pgTable("moments_anchors",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),
 projectId:text("project_id").notNull(),artifactId:text("artifact_id").notNull(),createdAt:text("created_at").notNull(),
},t=>[
 index("moments_anchors_group_scope_idx").on(t.userId,t.groupId),uniqueIndex("moments_anchors_artifact_ux").on(t.artifactId)]);
export const momentsRequests=pgTable("moments_requests",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),
 requestId:text("request_id").notNull(),requestDigest:text("request_digest").notNull(),
 operation:text("operation").notNull(),params:jsonb("params"),input:jsonb("input").notNull(),
 targetId:text("target_id"),versionId:text("version_id"),status:text("status").notNull(),errorCode:text("error_code"),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("moments_requests_group_d4edcb23").on(t.userId,t.groupId,t.requestId).where(sql`${t.groupId} IS NOT NULL AND ${t.accountId} IS NULL`),
 index("moments_requests_group_scope_idx").on(t.userId,t.groupId),uniqueIndex("moments_requests_scope_ux").on(t.userId,t.accountId,t.requestId)]);
