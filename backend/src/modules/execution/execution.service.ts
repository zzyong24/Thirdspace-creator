// 执行层 service(T-255a,脑手分离)。存储**复用 ai_tasks 六态 + 步骤流 + 结果表**
// (评估结论:字段全够 —— spec 进 input_data、manifest 进 ai_task_results、进度走
// AITaskStep,免新表/迁移;taskType 命名空间 `exec.*` 隔离读写),经注入的 AI 端口
// 读写,自己不碰 db(SPEC §22 no cross-module repo import)。
//
// 确认门(铁律②):runExecutionTask 收割的产物落 workspaces **不算落库**;
// confirm(采纳)才把 out/ 实体经 AssetsService.createGeneratedAsset 写进资产库,
// 然后任务 → succeeded + 清沙箱;discard(丢弃)中止在跑 executor + → cancelled + 清沙箱。
import type { RequestContext } from "@creatoros/contract";
import {
  executionTaskSpec,
  type ExecutionTaskResource,
  type ExecutionTaskSpec,
} from "@creatoros/contract";
import type { AITaskResource, AITaskResultResource } from "../ai/ai.schema";
import {
  adoptedItemsOf,
  EXEC_TASK_TYPE_PREFIX,
  EXECUTION_ADOPTED_ITEM_RESULT_TYPE,
  EXECUTION_ADOPTED_RESULT_TYPE,
  isExecutionTaskType,
  latestManifest,
  toExecutionTaskDto,
} from "./execution.schema";
import {
  ConflictError,
  ExecutionValidationError,
  OwnershipError,
} from "./execution.errors";
import { cleanupSandbox, readArtifactBytes } from "./sandbox";
import {
  assertLoopType,
  LoopTypeMismatchError,
  type LoopType,
} from "./agentic/loop-type";

// 采纳入库的 assetType 推断:mime 主类型 → 资产类型;未知 → document(octet-stream
// 一律按文档收,诚实不冒充媒体)。srt 字幕单列(assets 契约有 subtitle 类型)。
function assetTypeForMime(mimeType: string | null): string {
  const base = (mimeType ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (base === "application/x-subrip" || base === "text/vtt") return "subtitle";
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "document";
}

export interface ExecutionAiServicePort {
  createTask(
    ctx: RequestContext,
    body: { taskType: string; inputData?: Record<string, unknown> },
  ): Promise<AITaskResource>;
  getTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  listTasks(
    ctx: RequestContext,
    page: {
      limit: number;
      offset: number;
      projectId?: string;
      taskTypePrefix?: string;
    },
  ): Promise<{ rows: AITaskResource[]; total: number }>;
  listResults(
    ctx: RequestContext,
    taskId: string,
  ): Promise<AITaskResultResource[]>;
  recordAuxResult(
    ctx: RequestContext,
    taskId: string,
    input: { resultType: string; resultData: Record<string, unknown> },
  ): Promise<void>;
  markSucceeded(ctx: RequestContext, taskId: string): Promise<void>;
  cancelTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
}

export interface ExecutionAssetsWritePort {
  createGeneratedAsset(
    ctx: RequestContext,
    input: {
      assetType: string;
      name: string;
      bytes: Uint8Array;
      mimeType: string;
    },
  ): Promise<{ id: string }>;
}

export interface ExecutionServiceDeps {
  ai: ExecutionAiServicePort;
  assets: ExecutionAssetsWritePort;
  /** executor 是否已注册(create 前置校验;registry 本体归编排层)。 */
  hasExecutor: (taskType: string) => boolean;
  /**
   * [T-256b] executor 声明的循环类型(判定规则真 gate,SPEC §8 gate-m1)。create 时断言
   * classifyLoopType(taskType)===此值,不匹配 → 拒建(建任务端校验,非纯文档)。缺省视作
   * deterministic(未注册返 null → 跳过,交 hasExecutor 挡)。
   */
  loopTypeOf?: (taskType: string) => LoopType | null;
  workspacesRoot: string;
  /** discard 时中止 in-flight executor(run-execution-task.abortExecutionTask)。 */
  abortRun: (taskId: string) => boolean;
}

export interface ExecutionService {
  create(
    ctx: RequestContext,
    body: { spec: unknown; projectId?: string | null },
  ): Promise<ExecutionTaskResource>;
  get(ctx: RequestContext, taskId: string): Promise<ExecutionTaskResource>;
  list(
    ctx: RequestContext,
    page: { limit: number; offset: number; projectId?: string },
  ): Promise<{ rows: ExecutionTaskResource[]; total: number }>;
  /** 采纳:out/ 产物入资产库 → succeeded → 清沙箱。 */
  confirm(ctx: RequestContext, taskId: string): Promise<ExecutionTaskResource>;
  /** 丢弃:中止在跑 executor → cancelled(可转时)→ 清沙箱。 */
  discard(ctx: RequestContext, taskId: string): Promise<ExecutionTaskResource>;
  /** 待确认视频的临时预览；严格复用任务属主门与 manifest 白名单，不产生资产。 */
  previewArtifact(
    ctx: RequestContext,
    taskId: string,
    artifactPath: string,
  ): Promise<{ bytes: Uint8Array; mimeType: string }>;
}

export function createExecutionService(
  deps: ExecutionServiceDeps,
): ExecutionService {
  // ownership + 命名空间双门:非本人(ai 端口内已挡)/非 exec.* 任务 → 404 不泄漏。
  async function requireExecTask(
    ctx: RequestContext,
    taskId: string,
  ): Promise<AITaskResource> {
    const task = await deps.ai.getTask(ctx, taskId);
    if (!isExecutionTaskType(task.taskType)) {
      throw new OwnershipError("Execution task not found");
    }
    return task;
  }

  async function toDto(
    ctx: RequestContext,
    task: AITaskResource,
  ): Promise<ExecutionTaskResource> {
    const results = await deps.ai.listResults(ctx, task.id);
    return toExecutionTaskDto(task, results);
  }

  return {
    async create(ctx, body) {
      // 任务契约校验(脑→手的门):zod 收口 taskType 枚举/inputs/params/constraints。
      const parsed = executionTaskSpec.safeParse(body.spec);
      if (!parsed.success) {
        throw new ExecutionValidationError(
          `任务契约不合法: ${parsed.error.issues[0]?.message ?? "invalid spec"}`,
        );
      }
      const spec: ExecutionTaskSpec = parsed.data;
      if (!deps.hasExecutor(spec.taskType)) {
        throw new ExecutionValidationError(
          `未注册的 executor: ${spec.taskType}`,
        );
      }
      // [T-256b] 判定规则建任务端 gate:taskType 命名判定的循环类型必须与其 executor 声明一致
      // (防「什么都塞 agent」/「agentic 名挂确定性壳」)。不匹配 → 拒建(转 ValidationError 出 4xx)。
      const declaredLoop = deps.loopTypeOf?.(spec.taskType);
      if (declaredLoop) {
        try {
          assertLoopType(spec.taskType, declaredLoop);
        } catch (e) {
          if (e instanceof LoopTypeMismatchError) {
            throw new ExecutionValidationError(e.message);
          }
          throw e;
        }
      }
      const inputData: Record<string, unknown> = { spec };
      if (typeof body.projectId === "string" && body.projectId) {
        inputData.projectId = body.projectId; // aiService.createTask 从这里提 projectId 列
      }
      const task = await deps.ai.createTask(ctx, {
        taskType: `${EXEC_TASK_TYPE_PREFIX}${spec.taskType}`,
        inputData,
      });
      return toDto(ctx, task);
    },

    async get(ctx, taskId) {
      const task = await requireExecTask(ctx, taskId);
      return toDto(ctx, task);
    },

    async list(ctx, page) {
      const { rows, total } = await deps.ai.listTasks(ctx, {
        limit: page.limit,
        offset: page.offset,
        ...(page.projectId ? { projectId: page.projectId } : {}),
        taskTypePrefix: EXEC_TASK_TYPE_PREFIX,
      });
      const dtos: ExecutionTaskResource[] = [];
      for (const row of rows) dtos.push(await toDto(ctx, row));
      return { rows: dtos, total };
    },

    async previewArtifact(ctx, taskId, artifactPath) {
      const task = await requireExecTask(ctx, taskId);
      if (task.status !== "awaiting_confirmation") {
        throw new OwnershipError("Execution preview not found");
      }
      const results = await deps.ai.listResults(ctx, taskId);
      const manifest = latestManifest(results);
      const artifact = manifest?.artifacts.find(
        (item) => item.path === artifactPath,
      );
      const mimeType = (artifact?.mimeType ?? "").toLowerCase();
      if (!artifact || !mimeType.startsWith("video/")) {
        throw new OwnershipError("Execution preview not found");
      }
      const bytes = await readArtifactBytes(
        deps.workspacesRoot,
        taskId,
        artifact.path,
      );
      if (!bytes) throw new OwnershipError("Execution preview not found");
      return { bytes, mimeType };
    },

    async confirm(ctx, taskId) {
      const task = await requireExecTask(ctx, taskId);
      if (task.status !== "awaiting_confirmation") {
        throw new ConflictError(
          `Execution task ${taskId} is not awaiting confirmation (status: ${task.status})`,
        );
      }
      const results = await deps.ai.listResults(ctx, taskId);
      const manifest = latestManifest(results);
      if (!manifest) {
        throw new ConflictError(
          `Execution task ${taskId} has no manifest to adopt`,
        );
      }
      // 采纳:逐个产物从沙箱 out/ 读实体(路径防护+denylist 在 readArtifactBytes 内)
      // → createGeneratedAsset 入资产库(对象存储写入只经 AssetsService,G5 边界)。
      // 实体缺失 → 整单失败(诚实:不半采半丢;沙箱保留,可重试 confirm)。
      //
      // [RT-H10] 逐项幂等(DATA-H06 adopted-keys 同款,稳定键 = 产物 out/ 相对路径,
      // 同一 manifest 内唯一):每采纳完一个产物立刻记 execution_adopted_item 结果行;
      // 第 N 个失败 → 任务留在 awaiting_confirmation,重试跳过前 N-1 个(复用已建
      // assetId),不再重复入库。为什么不是整批 Drizzle 事务:落库走跨模块端口(assets/
      // ai),端口实现绑根 db,与 PGlite transactionMutex 的组合已实测死锁(DATA-H06
      // 探针),弃用。残余窗口:单个产物「asset 已建、日志行未记」之间崩溃 → 重试最多
      // 重复**该一个**产物(旧行为重复前 N-1 个,收敛到常数),诚实标注于此。
      const journal = adoptedItemsOf(results);
      const adoptedAssetIds: string[] = [];
      for (const artifact of manifest.artifacts) {
        const prior = journal.get(artifact.path);
        if (prior) {
          adoptedAssetIds.push(prior); // 上次已采纳 → 复用,不重复建 asset
          continue;
        }
        const bytes = await readArtifactBytes(
          deps.workspacesRoot,
          taskId,
          artifact.path,
        );
        if (!bytes) {
          throw new ConflictError(
            `产物已丢失,无法采纳: ${artifact.path}(沙箱可能已被清理)`,
          );
        }
        const created = await deps.assets.createGeneratedAsset(ctx, {
          assetType: assetTypeForMime(artifact.mimeType),
          name: artifact.fileName,
          bytes,
          mimeType: artifact.mimeType ?? "application/octet-stream",
        });
        // 该产物落完立刻记日志行 —— 下一个产物失败时本条进度已持久化。
        await deps.ai.recordAuxResult(ctx, taskId, {
          resultType: EXECUTION_ADOPTED_ITEM_RESULT_TYPE,
          resultData: { path: artifact.path, assetId: created.id },
        });
        adoptedAssetIds.push(created.id);
      }
      // 审计 + DTO 投影:采纳记录进结果表(不驱动状态机),再收尾 succeeded。
      await deps.ai.recordAuxResult(ctx, taskId, {
        resultType: EXECUTION_ADOPTED_RESULT_TYPE,
        resultData: { adoptedAssetIds },
      });
      await deps.ai.markSucceeded(ctx, taskId);
      // 采纳后清沙箱(实体已入对象存储)。best-effort:清理失败有孤儿 sweep 兜底。
      await cleanupSandbox(deps.workspacesRoot, taskId).catch(() => {});
      return toDto(ctx, await deps.ai.getTask(ctx, taskId));
    },

    async discard(ctx, taskId) {
      const task = await requireExecTask(ctx, taskId);
      // 在跑 → 先中止 executor(abort 贯通);编排 catch 里 markFailed 会被这里的
      // cancelled 状态机守卫 no-op 掉(先 cancel 再 abort 的顺序保证终态是 cancelled)。
      const terminal = ["succeeded", "failed", "cancelled"].includes(
        task.status,
      );
      if (!terminal) {
        await deps.ai.cancelTask(ctx, taskId);
        deps.abortRun(taskId);
      }
      // 丢弃即清沙箱(幂等;终态任务重复 discard 也只是再清一次空目录)。
      await cleanupSandbox(deps.workspacesRoot, taskId).catch(() => {});
      return toDto(ctx, await deps.ai.getTask(ctx, taskId));
    },
  };
}
