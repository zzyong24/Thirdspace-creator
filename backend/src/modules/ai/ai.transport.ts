import {ENDPOINTS} from '@creatoros/contract';
import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./ai.errors";
import type { AiService } from "./ai.service";

// AI transport (foundation §5.4) — the module's 6 contract ops served over REAL SQL
// behind the same /api/v1/dispatch route. Mirrors the realized learnings transport: a
// Transport whose request(endpoint,input,ctx) switches on endpoint.id, threads ctx into
// the service, and returns the SPEC §14 envelope (list for ai.conversations.list,
// single-resource otherwise). A persisted op reached with NO ctx is an unauthenticated
// dispatch → AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from AI_OP_IDS (adding the module = registering it). The service already
// maps rows → contract DTOs (ai.schema.ts), so the transport only threads ctx + shapes
// the envelope.

export const AI_OP_IDS = [
  "ai.workCandidates.source",
  "ai.conversations.list",
  "ai.conversations.create",
  "ai.conversations.messages.create",
  "ai.conversations.messages.list",
  "ai.tasks.create",
  "ai.tasks.list",
  "ai.tasks.get",
  "ai.tasks.results.list",
  "ai.tasks.steps.list",
  // [T-248 批C] ai.tasks.pending_topic_review 已删(T-060 弹窗任务流退役,零调用方)。
  "ai.tasks.results.patch",
  "ai.tasks.confirm",
  "ai.tasks.cancel",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createAiTransport(
  serviceFactory: () => AiService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every op is persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒ reject
      // before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { conversationId?: string; taskId?: string };

      switch (endpoint.id) {
        case "ai.conversations.list": {
          // The contract query is paginationQuery (page/pageSize, 1-based). Convert to
          // the repo's limit/offset (mirrors the other list transports).
          // T-096:scope 可选过滤(传了只列该作用域 —— 入口级历史隔离;不传全量)。
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            scope?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listConversations(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
            ...(q.scope ? { scope: q.scope } : {}),
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "ai.conversations.create": {
          const b = (body ?? {}) as {
            title: string;
            projectId?: string | null;
            scope?: string;
          };
          const conversation = await service.createConversation(ctx, b);
          return { data: conversation, meta: { requestId } };
        }
        case "ai.conversations.messages.create": {
          const b = (body ?? {}) as { content: string; attachments?: string[] };
          const message = await service.createMessageWithReplyTask(
            ctx,
            p.conversationId ?? "",
            b,
          );
          return { data: message, meta: { requestId } };
        }
        case "ai.workCandidates.source": return {data:await service.readWorkCandidateSource(ctx,{conversationId:p.conversationId??'',sourceMessageId:String((query as Record<string,unknown>|undefined)?.sourceMessageId??''),toolCallId:String((query as Record<string,unknown>|undefined)?.toolCallId??'')}),meta:{requestId}};
        case "ai.conversations.messages.list": {
          const rows = await service.listMessages(ctx, p.conversationId ?? "");
          return {
            data: rows,
            meta: {
              requestId,
              page: 1,
              pageSize: Math.max(rows.length, 1),
              total: rows.length,
            },
          };
        }
        case "ai.tasks.create": {
          const b = (body ?? {}) as {
            taskType: string;
            inputData?: Record<string, unknown>;
          };
          if(b.taskType==="asset.asr"||b.taskType==="production.rough-cut.propose")ENDPOINTS.createAITask.body.parse(body);
          const task = await service.createTask(ctx, b);
          return { data: task, meta: { requestId } };
        }
        case "ai.tasks.list": {
          // paginationQuery (page/pageSize, 1-based) → repo limit/offset (mirrors
          // ai.conversations.list). Global cross-project task feed for the copilot.
          // [T-116c] additive:projectId + taskType 传了就下推为窄化读过滤(复盘页
          // AI 分析卡取本条视频的 review.analyze 结果);都不传维持全量馈,旧调用零破坏。
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            projectId?: string;
            taskType?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listTasks(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
            ...(q.projectId ? { projectId: q.projectId } : {}),
            ...(q.taskType ? { taskType: q.taskType } : {}),
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "ai.tasks.get": {
          const task = await service.getTask(ctx, p.taskId ?? "");
          return { data: task, meta: { requestId } };
        }
        case "ai.tasks.results.list": {
          const rows = await service.listResults(ctx, p.taskId ?? "");
          return {
            data: rows,
            meta: { requestId, page: 1, pageSize: Math.max(rows.length, 1), total: rows.length },
          };
        }
        case "ai.tasks.steps.list": {
          const rows = await service.listSteps(ctx, p.taskId ?? "");
          return {
            data: rows,
            meta: { requestId, page: 1, pageSize: Math.max(rows.length, 1), total: rows.length },
          };
        }
        case "ai.tasks.results.patch": {
          const b = (body ?? {}) as { items?: unknown[] };
          const result = await service.patchResultItems(
            ctx,
            p.taskId ?? "",
            Array.isArray(b.items) ? b.items : [],
          );
          return { data: result, meta: { requestId } };
        }
        case "ai.tasks.confirm": {
          const task = await service.confirmTask(ctx, p.taskId ?? "");
          return { data: task, meta: { requestId } };
        }
        case "ai.tasks.cancel": {
          const task = await service.cancelTask(ctx, p.taskId ?? "");
          return { data: task, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
