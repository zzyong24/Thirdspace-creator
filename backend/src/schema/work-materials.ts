import {pgTable,text,jsonb,uniqueIndex} from "drizzle-orm/pg-core";
/** 组合物料账本仅记录原owner已提交的文件关联，不保存第二份稿件。 */
export const workMaterialAssociations=pgTable("work_material_associations",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),projectId:text("project_id").notNull(),compositionId:text("composition_id").notNull(),snapshot:jsonb("snapshot").notNull(),ruleRefs:jsonb("rule_refs").notNull().default([]),createdAt:text("created_at").notNull(),
});
export const workMaterialReceipts=pgTable("work_material_receipts",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),compositionId:text("composition_id").notNull(),requestId:text("request_id").notNull(),requestDigest:text("request_digest").notNull(),snapshot:jsonb("snapshot").notNull(),createdAt:text("created_at").notNull(),
},table=>[uniqueIndex("work_material_receipts_scope_ux").on(table.userId,table.accountId,table.requestId)]);
export const workDependencies=pgTable("work_dependencies",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),projectId:text("project_id").notNull(),compositionId:text("composition_id").notNull(),snapshot:jsonb("snapshot").notNull(),materialTarget:jsonb("material_target"),createdAt:text("created_at").notNull(),
});
