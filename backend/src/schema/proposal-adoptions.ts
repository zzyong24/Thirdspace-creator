import {sql} from "drizzle-orm";
import { pgTable, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

const columns = () => ({
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  proposalId: text("proposal_id").notNull(),
  sourceDigest: text("source_digest").notNull(),
  result: jsonb("result").notNull(),
  createdAt: text("created_at").notNull(),
});
// 回执不随用户删除领域实体而消失；重放只回读已采纳事实。
export const assetTagAdoptions = pgTable("asset_tag_adoptions", {...columns(),groupId:text("group_id"),accountId:text("account_id")}, table => [
  uniqueIndex("asset_tag_adoptions_legacy_scope_ux").on(table.userId, table.accountId, table.proposalId).where(sql`${table.groupId} IS NULL`),
  uniqueIndex("asset_tag_adoptions_group_scope_ux").on(table.userId, table.groupId, table.proposalId).where(sql`${table.groupId} IS NOT NULL`),
]);
export const knowledgeAdoptions = pgTable("knowledge_adoptions", {...columns(),groupId:text("group_id"),accountId:text("account_id")}, table => [
  uniqueIndex("knowledge_adoptions_legacy_scope_ux").on(table.userId, table.accountId, table.proposalId).where(sql`${table.groupId} IS NULL`),
  uniqueIndex("knowledge_adoptions_group_scope_ux").on(table.userId, table.groupId, table.proposalId).where(sql`${table.groupId} IS NOT NULL`),
]);
