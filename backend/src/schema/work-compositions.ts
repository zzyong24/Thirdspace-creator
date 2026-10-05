import {pgTable,text,integer,jsonb,uniqueIndex} from "drizzle-orm/pg-core";
export const workCompositions=pgTable("work_compositions",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),projectId:text("project_id").notNull(),
 currentRevision:integer("current_revision").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
});
export const workCompositionVersions=pgTable("work_composition_versions",{
 id:text("id").primaryKey(),compositionId:text("composition_id").notNull(),revision:integer("revision").notNull(),snapshot:jsonb("snapshot").notNull(),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("work_composition_versions_revision_ux").on(t.compositionId,t.revision)]);
export const workCompositionRequests=pgTable("work_composition_requests",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),requestId:text("request_id").notNull(),requestDigest:text("request_digest").notNull(),
 compositionId:text("composition_id"),operation:text("operation").notNull(),input:jsonb("input").notNull(),status:text("status").notNull(),
 resultRevision:integer("result_revision"),memberReservation:jsonb("member_reservation"),errorCode:text("error_code"),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("work_composition_requests_scope_ux").on(t.userId,t.accountId,t.requestId)]);
