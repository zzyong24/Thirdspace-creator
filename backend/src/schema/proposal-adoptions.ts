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
export const assetTagAdoptions = pgTable("asset_tag_adoptions", columns(), table => [
  uniqueIndex("asset_tag_adoptions_scope_ux").on(table.userId, table.accountId, table.proposalId),
]);
export const knowledgeAdoptions = pgTable("knowledge_adoptions", columns(), table => [
  uniqueIndex("knowledge_adoptions_scope_ux").on(table.userId, table.accountId, table.proposalId),
]);
