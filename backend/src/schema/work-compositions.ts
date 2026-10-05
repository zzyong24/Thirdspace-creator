import {sql} from "drizzle-orm";
import {pgTable,index,text,integer,jsonb,uniqueIndex} from "drizzle-orm/pg-core";
export const workCompositions=pgTable("work_compositions",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),projectId:text("project_id").notNull(),
 currentRevision:integer("current_revision").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[index("work_compositions_group_scope_idx").on(t.userId,t.groupId)]);export const workCompositionVersions=pgTable("work_composition_versions",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),compositionId:text("composition_id").notNull(),revision:integer("revision").notNull(),snapshot:jsonb("snapshot").notNull(),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("work_composition_versions_revision_ux").on(t.compositionId,t.revision)]);
export const workCompositionRequests=pgTable("work_composition_requests",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),requestId:text("request_id").notNull(),requestDigest:text("request_digest").notNull(),
 compositionId:text("composition_id"),operation:text("operation").notNull(),input:jsonb("input").notNull(),status:text("status").notNull(),
 resultRevision:integer("result_revision"),memberReservation:jsonb("member_reservation"),errorCode:text("error_code"),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("work_composition_requests_group_d4edcb23").on(t.userId,t.groupId,t.requestId).where(sql`${t.groupId} IS NOT NULL AND ${t.accountId} IS NULL`),
 index("work_composition_requests_group_scope_idx").on(t.userId,t.groupId),uniqueIndex("work_composition_requests_scope_ux").on(t.userId,t.accountId,t.requestId)]);
