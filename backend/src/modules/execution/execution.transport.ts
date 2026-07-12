// 执行层 transport(T-255a)—— 5 契约 op 走同一 /api/v1/dispatch(镜像 ai.transport:
// switch endpoint.id → service,SPEC §14 envelope;无 ctx → AuthenticationError;
// 不认识的 op → UnsupportedOperationError,composite 不吞真错)。
import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./execution.errors";
import type { ExecutionService } from "./execution.service";

export const EXECUTION_OP_IDS = [
  "execution.tasks.create",
  "execution.tasks.list",
  "execution.tasks.get",
  "execution.tasks.confirm",
  "execution.tasks.discard",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createExecutionTransport(
  serviceFactory: () => ExecutionService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
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
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
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
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
