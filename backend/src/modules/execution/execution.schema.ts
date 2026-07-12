// 执行任务 DTO 投影(T-255a):ai_tasks 行(taskType=`exec.<type>`)+ 结果表 →
// executionTaskResource(contract 单一真值)。存储复用 ai 模块,这里只做读侧投影。
import {
  executionManifest,
  executionTaskSpec,
  executionTaskResource,
  type ExecutionManifest,
  type ExecutionTaskResource,
  type ExecutionTaskSpec,
} from "@creatoros/contract";
import type { AITaskResource, AITaskResultResource } from "../ai/ai.schema";

/** 执行层 taskType 命名空间前缀(ai_tasks 复用的隔离键)。 */
export const EXEC_TASK_TYPE_PREFIX = "exec.";

export function isExecutionTaskType(taskType: string): boolean {
  return taskType.startsWith(EXEC_TASK_TYPE_PREFIX);
}

/** `exec.echo.manifest` → `echo.manifest`;非 exec 命名空间 → null。 */
export function execTypeOf(taskType: string): string | null {
  return isExecutionTaskType(taskType)
    ? taskType.slice(EXEC_TASK_TYPE_PREFIX.length)
    : null;
}

/** 结果行里的采纳记录 resultType(确认门采纳后 recordAuxResult 写)。 */
export const EXECUTION_ADOPTED_RESULT_TYPE = "execution_adopted";
/** 结果行里的产物清单候选 resultType(runExecutionTask recordCandidate 写)。 */
export const EXECUTION_MANIFEST_RESULT_TYPE = "execution_manifest";

/** 从结果行集取最新 manifest(无/形状不合法 → null,诚实不编)。 */
export function latestManifest(
  results: readonly AITaskResultResource[],
): ExecutionManifest | null {
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i]!;
    if (r.resultType !== EXECUTION_MANIFEST_RESULT_TYPE) continue;
    const parsed = executionManifest.safeParse(
      (r.resultData as { manifest?: unknown }).manifest,
    );
    return parsed.success ? parsed.data : null;
  }
  return null;
}

/** 从结果行集取采纳落库的资产 id(最新一条 execution_adopted)。 */
export function adoptedAssetIdsOf(
  results: readonly AITaskResultResource[],
): string[] {
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i]!;
    if (r.resultType !== EXECUTION_ADOPTED_RESULT_TYPE) continue;
    const ids = (r.resultData as { adoptedAssetIds?: unknown }).adoptedAssetIds;
    return Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === "string")
      : [];
  }
  return [];
}

/** input_data.spec → 校验过的任务契约;写侧恒经 create 校验,这里 safeParse 防御。 */
export function specOf(task: AITaskResource): ExecutionTaskSpec | null {
  const parsed = executionTaskSpec.safeParse(
    (task.inputData as { spec?: unknown }).spec,
  );
  return parsed.success ? parsed.data : null;
}

export function toExecutionTaskDto(
  task: AITaskResource,
  results: readonly AITaskResultResource[],
): ExecutionTaskResource {
  const spec = specOf(task);
  const execType = execTypeOf(task.taskType);
  return executionTaskResource.parse({
    id: task.id,
    userId: task.userId,
    projectId: task.projectId,
    taskType: task.taskType,
    execType: spec?.taskType ?? execType,
    status: task.status,
    // 防御回退:spec 损坏时给最小合法形状(goal 占位),读侧绝不 500。
    spec:
      spec ??
      ({
        taskType: execType,
        goal: "(spec 缺失或不合法)",
        inputs: [],
        params: {},
        constraints: { timeoutSec: 600, network: "deny", maxOutputMB: 512 },
      } as unknown as ExecutionTaskSpec),
    manifest: latestManifest(results),
    adoptedAssetIds: adoptedAssetIdsOf(results),
    requestedAt: task.requestedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    errorMessage: task.errorMessage,
  });
}
