import { integer, pgTable, text } from "drizzle-orm/pg-core";

// prepared 回执及已提交事实不随素材删除而消失；不得 TTL 删除后重新分配身份。
export const pendingDocumentCommits = pgTable("pending_document_commits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  inputDigest: text("input_digest").notNull(),
  assetId: text("asset_id").notNull().unique(),
  fileId: text("file_id").notNull().unique(),
  storageKey: text("storage_key").notNull().unique(),
  name: text("name").notNull(),
  sourceUrl: text("source_url").notNull(),
  checksum: text("checksum").notNull(),
  byteLength: integer("byte_length").notNull(),
  createdAt: text("created_at").notNull(),
  committedAt: text("committed_at"),
});
