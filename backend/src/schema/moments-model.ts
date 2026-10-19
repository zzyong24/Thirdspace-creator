import {pgTable,text,jsonb,index} from 'drizzle-orm/pg-core';
import {momentsAnchors} from './moments';
/** Moments owner私有账本；冻结内容与终态由受控service维护，正式稿仍Artifact。 */
export const momentsCandidates=pgTable('moments_candidates',{
 groupId:text("group_id"),id:text('id').primaryKey(),userId:text('user_id').notNull(),accountId:text('account_id'),momentsId:text('moments_id').notNull().references(()=>momentsAnchors.id,{onDelete:'cascade'}),rootId:text('root_id').notNull(),record:jsonb('record').notNull()},table=>[
 index("moments_candidates_group_scope_idx").on(table.userId,table.groupId),index('moments_candidates_scope_idx').on(table.userId,table.accountId,table.momentsId)]);
