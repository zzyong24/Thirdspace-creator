import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  executionTaskSpec,
  executionTaskResource,
} from "../resources/execution";

const taskParams = z.object({ taskId: id });

// [T-255a] 执行层任务 5 op(照 ai.tasks 范式;存储复用 ai_tasks,taskType 命名空间
// `exec.*`)。create 起任务(composition 层 live dispatch → runExecutionTask 后台跑);
// confirm = 采纳(out/ 产物经 createGeneratedAsset 入资产库,任务 → succeeded,清沙箱);
// discard = 丢弃(中止在跑的 executor + 任务 → cancelled + 清沙箱)。
export const executionOperations = {
  createExecutionTask: defineEndpoint({
    id: "execution.tasks.create",
    method: "POST",
    path: "/execution/tasks",
    body: z.object({
      spec: executionTaskSpec,
      projectId: id.nullable().optional(),
    }),
    response: executionTaskResource,
    fr: ["FR-EXECUTION-TASKS"],
  }),
  listExecutionTasks: defineEndpoint({
    id: "execution.tasks.list",
    method: "GET",
    path: "/execution/tasks",
    query: paginationQuery.extend({ projectId: id.optional() }),
    response: executionTaskResource,
    isList: true,
    fr: ["FR-EXECUTION-TASKS"],
  }),
  getExecutionTask: defineEndpoint({
    id: "execution.tasks.get",
    method: "GET",
    path: "/execution/tasks/:taskId",
    params: taskParams,
    response: executionTaskResource,
    fr: ["FR-EXECUTION-TASKS"],
  }),
  confirmExecutionTask: defineEndpoint({
    id: "execution.tasks.confirm",
    method: "POST",
    path: "/execution/tasks/:taskId/confirm",
    params: taskParams,
    response: executionTaskResource,
    fr: ["FR-EXECUTION-TASKS"],
  }),
  discardExecutionTask: defineEndpoint({
    id: "execution.tasks.discard",
    method: "POST",
    path: "/execution/tasks/:taskId/discard",
    params: taskParams,
    response: executionTaskResource,
    fr: ["FR-EXECUTION-TASKS"],
  }),
} as const;
