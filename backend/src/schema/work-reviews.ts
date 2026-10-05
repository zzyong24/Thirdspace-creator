import {sql} from "drizzle-orm";
import {pgTable,integer,text,jsonb,uniqueIndex,index,bigserial} from "drizzle-orm/pg-core";
/** review 模块唯一属主；这些表是业务报告/回执，不是执行队列。 */
export const workReviewReports=pgTable("work_review_reports",{
 groupId:text("group_id"),
 groupVersion:integer("group_version"),
 membershipVersion:integer("membership_version"),
 id:text("id").primaryKey(),ordinal:bigserial("ordinal",{mode:"number"}).notNull(),userId:text("user_id").notNull(),accountId:text("account_id"),projectId:text("project_id").notNull(),compositionId:text("composition_id").notNull(),
 scopeKey:text("scope_key").notNull(),snapshot:jsonb("snapshot").notNull(),frozenContext:jsonb("frozen_context").notNull(),attemptId:text("attempt_id").notNull(),
 taskId:text("task_id"),executionTaskId:text("execution_task_id"),settledCallId:text("settled_call_id"),status:text("status").notNull(),outcome:jsonb("outcome"),errorCode:text("error_code"),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("work_review_reports_group_3eed8954").on(t.userId,t.groupId,t.attemptId).where(sql`${t.groupId} IS NOT NULL AND ${t.accountId} IS NULL`),
 index("work_review_reports_group_scope_idx").on(t.userId,t.groupId),uniqueIndex("work_review_report_attempt_ux").on(t.userId,t.accountId,t.attemptId),uniqueIndex("work_review_report_task_ux").on(t.taskId),uniqueIndex("work_review_report_call_ux").on(t.settledCallId),index("work_review_report_scope_idx").on(t.userId,t.accountId,t.compositionId,t.scopeKey)]);
export const workReviewConfirmations=pgTable("work_review_confirmations",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),ordinal:bigserial("ordinal",{mode:"number"}).notNull(),userId:text("user_id").notNull(),accountId:text("account_id"),projectId:text("project_id").notNull(),compositionId:text("composition_id").notNull(),scopeKey:text("scope_key").notNull(),
 confirmation:jsonb("confirmation").notNull(),createdAt:text("created_at").notNull(),
},t=>[
 index("work_review_confirmations_group_scope_idx").on(t.userId,t.groupId),index("work_review_confirmation_scope_idx").on(t.userId,t.accountId,t.compositionId,t.scopeKey)]);
export const workReviewRequests=pgTable("work_review_requests",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),ordinal:bigserial("ordinal",{mode:"number"}).notNull(),userId:text("user_id").notNull(),accountId:text("account_id"),projectId:text("project_id").notNull(),compositionId:text("composition_id").notNull(),requestId:text("request_id").notNull(),requestDigest:text("request_digest").notNull(),operation:text("operation").notNull(),input:jsonb("input").notNull(),
 status:text("status").notNull(),reportId:text("report_id"),confirmationId:text("confirmation_id"),errorCode:text("error_code"),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("work_review_requests_group_d4edcb23").on(t.userId,t.groupId,t.requestId).where(sql`${t.groupId} IS NOT NULL AND ${t.accountId} IS NULL`),
 index("work_review_requests_group_scope_idx").on(t.userId,t.groupId),uniqueIndex("work_review_request_scope_ux").on(t.userId,t.accountId,t.requestId)]);
