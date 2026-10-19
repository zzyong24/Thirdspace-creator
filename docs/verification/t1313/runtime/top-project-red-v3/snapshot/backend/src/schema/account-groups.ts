import {pgTable,text,integer,jsonb,uniqueIndex} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";
export const accountGroups=pgTable("account_groups",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),name:text("name").notNull(),status:text("status").notNull().default("active"),version:integer("version").notNull().default(1),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
});
export const accountGroupMemberships=pgTable("account_group_memberships",{
 id:text("id").primaryKey(),userId:text("user_id").notNull(),groupId:text("group_id").notNull(),accountId:text("platform_account_id").notNull(),version:integer("version").notNull().default(1),joinedAt:text("joined_at").notNull(),leftAt:text("left_at"),
},t=>[uniqueIndex("group_membership_current_ux").on(t.userId,t.accountId).where(sql`${t.leftAt} IS NULL`)]);
export const accountGroupCommands=pgTable("account_group_commands",{
 userId:text("user_id").notNull(),key:text("idempotency_key").notNull(),kind:text("kind").notNull(),inputHash:text("input_hash").notNull(),result:jsonb("result").notNull(),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("group_command_user_key_ux").on(t.userId,t.key)]);
export const accountGroupMigrations=pgTable('account_group_migrations',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),fromGroupId:text('from_group_id').notNull(),toGroupId:text('to_group_id').notNull(),key:text('idempotency_key').notNull(),inputHash:text('input_hash').notNull(),status:text('status').notNull(),beforeImage:jsonb('before_image').notNull(),afterDigest:text('after_digest').notNull(),createdAt:text('created_at').notNull(),undoneAt:text('undone_at'),
},t=>[uniqueIndex('group_migration_user_key_ux').on(t.userId,t.key)]);
