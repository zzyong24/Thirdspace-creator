import {pgTable,text,integer,jsonb,uniqueIndex,index} from "drizzle-orm/pg-core";
export const visualTemplateFavorites=pgTable("visual_template_favorites",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),
 snapshot:jsonb("snapshot").notNull(),revision:integer("revision").notNull().default(1),
 createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),deletedAt:text("deleted_at"),
},t=>[index("visual_template_favorites_owner_idx").on(t.userId,t.accountId)]);
export const visualTemplateMutationReceipts=pgTable("visual_template_mutation_receipts",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),attemptId:text("attempt_id").notNull(),
 digest:text("digest").notNull(),response:jsonb("response"),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("visual_template_mutation_attempt_ux").on(t.userId,t.accountId,t.attemptId)]);
