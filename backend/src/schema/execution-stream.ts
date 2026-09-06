import {
  pgTable,
  text,
  integer,
  jsonb,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { executionTasks, executionCalls } from "./intelligence";
/** 既有执行账本的展示事件，不持有第二套执行状态。 */
export const executionStreamEvents = pgTable(
  "execution_stream_events",
  {
    executionTaskId: text("execution_task_id")
      .notNull()
      .references(() => executionTasks.id),
    sequence: integer("sequence").notNull(),
    callId: text("call_id")
      .notNull()
      .references(() => executionCalls.id),
    callIndex: integer("call_index").notNull(),
    chunk: jsonb("chunk").$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.executionTaskId, t.sequence] }),
    callIndexUnique: uniqueIndex("execution_stream_call_index_unique").on(
      t.callId,
      t.callIndex,
    ),
  }),
);
