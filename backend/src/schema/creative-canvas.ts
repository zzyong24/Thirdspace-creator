import {pgTable,text,integer,jsonb,unique,index} from "drizzle-orm/pg-core";

export const creativeCanvases=pgTable("creative_canvases",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),
 title:text("title").notNull(),projectId:text("project_id"),documentJson:jsonb("document_json").notNull(),
 revision:integer("revision").notNull().default(1),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),archivedAt:text("archived_at"),
},table=>[
 index("creative_canvases_group_scope_idx").on(table.userId,table.groupId),index("creative_canvases_owner_updated_idx").on(table.userId,table.accountId,table.updatedAt)]);

export const canvasGenerationLinks=pgTable("canvas_generation_links",{
 groupId:text("group_id"),
 groupVersion:integer("group_version"),
 membershipVersion:integer("membership_version"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),
 canvasId:text("canvas_id").notNull(),nodeId:text("node_id").notNull(),attemptId:text("attempt_id").notNull(),taskId:text("task_id"),
 inputRevision:integer("input_revision").notNull(),inputDigest:text("input_digest").notNull(),
 inputJson:jsonb("input_json").notNull(),
 referenceFileId:text("reference_file_id"),referenceChecksum:text("reference_checksum"),
 resultAssetId:text("result_asset_id"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},table=>[
 index("canvas_generation_links_group_scope_idx").on(table.userId,table.groupId),unique("canvas_generation_links_attempt_id_key").on(table.attemptId),unique("canvas_generation_links_task_id_key").on(table.taskId),index("canvas_generation_links_canvas_idx").on(table.userId,table.accountId,table.canvasId)]);

export const canvasAgentProposals=pgTable("canvas_agent_proposals",{
 groupId:text("group_id"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),canvasId:text("canvas_id").notNull(),
 baseRevision:integer("base_revision").notNull(),operationsJson:jsonb("operations_json").notNull(),status:text("status").notNull(),
 appliedRevision:integer("applied_revision"),appliedCanvasJson:jsonb("applied_canvas_json"),createdAt:text("created_at").notNull(),expiresAt:text("expires_at").notNull(),
},table=>[
 index("canvas_agent_proposals_group_scope_idx").on(table.userId,table.groupId),index("canvas_agent_proposals_canvas_idx").on(table.userId,table.accountId,table.canvasId)]);
