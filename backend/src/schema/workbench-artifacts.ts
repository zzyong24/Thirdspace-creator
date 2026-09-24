import {integer,jsonb,pgTable,text,uniqueIndex} from "drizzle-orm/pg-core";
import {executionCalls,executionTasks} from "./intelligence";
import {aiConversations} from "./ai";

/**
 * 工作台产物的跨回合唯一真值。lineage 行串行化同一会话内一个 artifactId 的下一版本，
 * version 行只追加；旧 execution task payload 继续保留，供旧链接与 v1 任务读取。
 */
export const workbenchArtifactLineages=pgTable("workbench_artifact_lineages",{
 id:text("id").primaryKey(),
 userId:text("user_id").notNull(),
 accountId:text("account_id").notNull(),
 conversationId:text("conversation_id").notNull().references(()=>aiConversations.id),
 artifactId:text("artifact_id").notNull(),
 currentVersion:integer("current_version").notNull().default(0),
 state:text("state").notNull().default("committed"),
 pendingOperationId:text("pending_operation_id"),
 pendingTaskId:text("pending_task_id").references(()=>executionTasks.id),
 pendingRequestDigest:text("pending_request_digest"),
 pendingMetadata:jsonb("pending_metadata"),
 pendingSource:jsonb("pending_source"),
 pendingHtmlResources:jsonb("pending_html_resources"),
 reconciliationClaimId:text("reconciliation_claim_id"),
 reconciliationLeaseExpiresAt:text("reconciliation_lease_expires_at"),
 lastOperationId:text("last_operation_id"),
 lastErrorCode:text("last_error_code"),
 migrationReason:text("migration_reason"),
 createdAt:text("created_at").notNull(),
 updatedAt:text("updated_at").notNull(),
},table=>({
 ownerArtifactUnique:uniqueIndex("workbench_artifact_lineages_owner_artifact_unique").on(table.userId,table.accountId,table.conversationId,table.artifactId),
 pendingOperationUnique:uniqueIndex("workbench_artifact_lineages_pending_operation_unique").on(table.pendingOperationId),
}));

export const workbenchArtifactLineageVersions=pgTable("workbench_artifact_lineage_versions",{
 id:text("id").primaryKey(),
 lineageId:text("lineage_id").notNull().references(()=>workbenchArtifactLineages.id),
 artifactId:text("artifact_id").notNull(),
 version:integer("version").notNull(),
 taskId:text("task_id").notNull().references(()=>executionTasks.id),
 operationId:text("operation_id").notNull().references(()=>executionCalls.id),
 requestDigest:text("request_digest").notNull(),
 metadata:jsonb("metadata").notNull(),
 source:jsonb("source").notNull(),
 htmlResources:jsonb("html_resources").notNull().default([]),
 createdAt:text("created_at").notNull(),
},table=>({
 lineageVersionUnique:uniqueIndex("workbench_artifact_lineage_versions_lineage_version_unique").on(table.lineageId,table.version),
 taskOperationUnique:uniqueIndex("workbench_artifact_lineage_versions_task_operation_unique").on(table.taskId,table.operationId),
}));
