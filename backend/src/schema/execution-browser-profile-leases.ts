import { pgTable, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
/** 用户级网站profile运行所有权；不含凭据，过期或任务终态不代表浏览器已停止。 */
export const executionBrowserProfileLeases = pgTable(
  "execution_browser_profile_leases",
  {
    userId: text("user_id").notNull(),
    domain: text("domain").notNull(),
    ownerExecutionTaskId: text("owner_execution_task_id").notNull(),
    attempt: integer("attempt").notNull(),
    fenceToken: text("fence_token").notNull(),
    leaseId: text("lease_id").primaryKey(),
    acquiredAt: text("acquired_at").notNull(),
    releasedAt: text("released_at"),
  },
  (table) => ({
    identity: uniqueIndex("ux_execution_browser_profile_owner").on(
      table.userId,
      table.domain,
    ),
  }),
);
