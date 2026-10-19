import {sql} from "drizzle-orm";
import {pgTable,text,integer,jsonb,uniqueIndex,index} from "drizzle-orm/pg-core";
export const visualTemplateFavorites=pgTable("visual_template_favorites",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),
 snapshot:jsonb("snapshot").notNull(),revision:integer("revision").notNull().default(1),
 createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),deletedAt:text("deleted_at"),
},t=>[
 index("visual_template_favorites_group_scope_idx").on(t.userId,t.groupId),index("visual_template_favorites_owner_idx").on(t.userId,t.accountId)]);
export const visualTemplateMutationReceipts=pgTable("visual_template_mutation_receipts",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),attemptId:text("attempt_id").notNull(),
 digest:text("digest").notNull(),response:jsonb("response"),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("visual_template_mutation_receipts_group_3eed8954").on(t.userId,t.groupId,t.attemptId).where(sql`${t.groupId} IS NOT NULL AND ${t.accountId} IS NULL`),
 index("visual_template_mutation_receipts_group_scope_idx").on(t.userId,t.groupId),uniqueIndex("visual_template_mutation_attempt_ux").on(t.userId,t.accountId,t.attemptId)]);
