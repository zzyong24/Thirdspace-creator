import { sql } from "drizzle-orm";
import { pgTable, text, integer, uniqueIndex, check } from "drizzle-orm/pg-core";
/** 网站与物理profile统一运行所有权；不含凭据，过期或任务终态不代表浏览器已停止。 */
export const executionBrowserProfileLeases = pgTable(
  "execution_browser_profile_leases",
  {
    userId: text("user_id").notNull(),
    domain: text("domain").notNull(),
    profileKey: text("profile_key").notNull().default(""),
    hostInstanceId: text("host_instance_id"),
    hostOperationId: text("host_operation_id"),
    ownerExecutionTaskId: text("owner_execution_task_id"),
    attempt: integer("attempt"),
    fenceToken: text("fence_token"),
    leaseId: text("lease_id").primaryKey(),
    acquiredAt: text("acquired_at").notNull(),
    releasedAt: text("released_at"),
  },
  (table) => ({
    identity: uniqueIndex("ux_execution_browser_profile_owner").on(
      table.userId,
      table.domain,
    ).where(sql`${table.profileKey} = ''`),
    physicalIdentity: uniqueIndex("ux_execution_browser_physical_profile").on(table.profileKey).where(sql`${table.profileKey} <> ''`),
    owner: check("ck_browser_profile_owner", sql`(
      (${table.ownerExecutionTaskId} IS NOT NULL AND ${table.attempt} IS NOT NULL AND ${table.fenceToken} IS NOT NULL AND ${table.hostInstanceId} IS NULL AND ${table.hostOperationId} IS NULL)
      OR (${table.ownerExecutionTaskId} IS NULL AND ${table.attempt} IS NULL AND ${table.fenceToken} IS NULL AND ${table.hostInstanceId} IS NOT NULL AND length(${table.hostInstanceId}) > 0 AND ${table.hostOperationId} IS NOT NULL AND length(${table.hostOperationId}) > 0)
    )`),
  }),
);
