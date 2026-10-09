// 执行层 transport(T-255a)—— 5 契约 op 走同一 /api/v1/dispatch(镜像 ai.transport:
// switch endpoint.id → service,SPEC §14 envelope;无 ctx → AuthenticationError;
// 不认识的 op → UnsupportedOperationError,composite 不吞真错)。
import { ENDPOINTS, type Endpoint, type RequestContext, type Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  ExecutionValidationError,
  OwnershipError,
  UnsupportedOperationError,
} from "./execution.errors";
import type { ExecutionService } from "./execution.service";
import type {
  PersistentTaskKind,
  PersistentTaskService,
  PersistentTaskStatus,
} from "./persistent-task.service";

export const EXECUTION_OP_IDS = [
  "execution.tasks.create",
  "execution.tasks.list",
  "execution.tasks.get",
  "execution.tasks.confirm",
  "execution.tasks.discard",
  "execution.tasks.command",
  "execution.tasks.transcribeCommand.v1",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createExecutionTransport(
  serviceFactory: () => ExecutionService,
  persistentServiceFactory?: () => PersistentTaskService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      if (endpoint.id === ENDPOINTS.commandTranscribeExecutionTaskV1.id) {
        // 新版本入口真正消费 strict schema，拒绝后不创建或调用命令服务。
        const parsed = ENDPOINTS.commandTranscribeExecutionTaskV1.body.safeParse(((input ?? {}) as Input).body);
        if (!parsed.success) throw new ExecutionValidationError("转写控制请求无效，请保留原任务核对");
        const b = parsed.data;
        const persistent = persistentServiceFactory?.();
        if (!persistent) throw new UnsupportedOperationError(endpoint.id);
        const tasks = await persistent.command(ctx, {
          ...b,
          receiptProtocol: "transcribe-command-v1",
        });
        return { data: { tasks }, meta: { requestId: ctx.requestId } };
      }
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { taskId?: string };

      switch (endpoint.id) {
        case "execution.tasks.create": {
          const b = (body ?? {}) as {
            spec?: unknown;
            projectId?: string | null;
          };
          const task = await service.create(ctx, {
            spec: b.spec,
            projectId: b.projectId ?? null,
          });
          return { data: task, meta: { requestId } };
        }
        case "execution.tasks.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            projectId?: string;
            accountId?: string;
            kind?: PersistentTaskKind;
            ownerId?: string;
            status?: PersistentTaskStatus;
            cursor?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          // T-482 新队列仅在带 V2 筛选条件时接管；无筛选的旧调用继续读取 ai_tasks，
          // 保持已有执行层页面和轮询协议不变。
          const requestsPersistentTasks =
            q.kind !== undefined ||
            q.ownerId !== undefined ||
            q.status !== undefined ||
            q.accountId !== undefined ||
            q.cursor !== undefined;
          if (requestsPersistentTasks) {
            const persistent = persistentServiceFactory?.();
            if (!persistent) {
              throw new UnsupportedOperationError(
                "execution.tasks.list.v2",
              );
            }
            if (q.accountId && q.accountId !== ctx.accountId) {
              throw new OwnershipError("Execution task not found");
            }
            const { rows, total } = await persistent.list(ctx, {
              limit: pageSize,
              offset: (page - 1) * pageSize,
              ...(q.kind ? { kind: q.kind } : {}),
              ...(q.ownerId ? { ownerId: q.ownerId } : {}),
              ...(q.status ? { status: q.status } : {}),
            });
            return {
              data: rows,
              meta: { requestId, page, pageSize, total },
            };
          }
          const { rows, total } = await service.list(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
            ...(q.projectId ? { projectId: q.projectId } : {}),
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "execution.tasks.get": {
          const task = await service.get(ctx, p.taskId ?? "");
          return { data: task, meta: { requestId } };
        }
        case "execution.tasks.confirm": {
          const task = await service.confirm(ctx, p.taskId ?? "");
          return { data: task, meta: { requestId } };
        }
        case "execution.tasks.discard": {
          const task = await service.discard(ctx, p.taskId ?? "");
          return { data: task, meta: { requestId } };
        }
        case "execution.tasks.command": {
          const persistent = persistentServiceFactory?.();
          if (!persistent) {
            throw new UnsupportedOperationError(endpoint.id);
          }
          const b = (body ?? {}) as {
            taskIds?: string[];
            command?: "pause" | "resume" | "cancel" | "retry";
            idempotencyKey?: string;
          };
          const tasks = await persistent.command(ctx, {
            taskIds: b.taskIds ?? [],
            command: b.command ?? "pause",
            idempotencyKey: b.idempotencyKey ?? "",
          });
          return { data: { tasks }, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
