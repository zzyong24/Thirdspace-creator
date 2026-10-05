import {pgTable,text} from 'drizzle-orm/pg-core';
export const resourceAccessGrants=pgTable('resource_access_grants',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),targetGroupId:text('target_group_id').notNull(),resourceType:text('resource_type').notNull(),resourceId:text('resource_id').notNull(),originGroupId:text('origin_group_id').notNull(),migrationId:text('migration_id').notNull(),createdAt:text('created_at').notNull(),revokedAt:text('revoked_at'),
});
export const workspaceBlobObjects=pgTable('workspace_blob_objects',{
 storageKey:text('storage_key').primaryKey(),userId:text('user_id').notNull(),groupId:text('group_id'),accountId:text('account_id'),expiresAt:text('expires_at').notNull(),
});

export const resourceAccessGrantUses=pgTable('resource_access_grant_uses',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),grantId:text('grant_id').notNull().references(()=>resourceAccessGrants.id),consumerType:text('consumer_type').notNull(),consumerId:text('consumer_id').notNull(),createdAt:text('created_at').notNull(),
});
