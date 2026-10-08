import {integer,pgTable,text} from "drizzle-orm/pg-core";
/** 提交历史独立于素材删除，重放不能重新分配身份。 */
export const pendingGeneratedAssetCommits=pgTable("pending_generated_asset_commits",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),groupId:text("group_id"),inputDigest:text("input_digest").notNull(),
 assetId:text("asset_id").notNull().unique(),fileId:text("file_id").notNull().unique(),storageKey:text("storage_key").notNull().unique(),
 assetType:text("asset_type").notNull(),mimeType:text("mime_type").notNull(),name:text("name").notNull(),description:text("description").notNull(),
 checksum:text("checksum").notNull(),byteLength:integer("byte_length").notNull(),createdAt:text("created_at").notNull(),committedAt:text("committed_at"),
});
