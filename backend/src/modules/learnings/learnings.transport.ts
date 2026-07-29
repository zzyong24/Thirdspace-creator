import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./learnings.errors";
import type { LearningsService } from "./learnings.service";

// Learnings transport (foundation §5.4) — the module's 4 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized reviews
// transport: a `Transport` whose request(endpoint,input,ctx) switches on
// endpoint.id, threads ctx into the service, and returns the SPEC §14 envelope
// (list for learnings.list, single-resource otherwise). A persisted op reached with
// NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never
// masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from LEARNINGS_OP_IDS (adding the module = registering it). The
// service already maps rows → contract DTOs (learnings.schema.ts), so the transport
// only threads ctx + shapes the envelope.

export const LEARNINGS_OP_IDS = [
  "learnings.list",
  "learnings.get",
  "learnings.create",
  "learnings.patch",
  "learnings.applications.create",
  "learnings.evaluate",
  // 复盘飞轮回流 轨B (Learning→校准): promote a Learning into a CalibrationRuleSuggestion.
  "learnings.calibrationSuggestions.create",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createLearningsTransport(
  serviceFactory: () => LearningsService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every op is persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒ reject
      // before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { learningId?: string };

      switch (endpoint.id) {
        case "learnings.list": {
          // The contract query is paginationQuery (page/pageSize, 1-based). Convert
          // to the repo's limit/offset (mirrors the other list transports).
          // [T-118a] additive 读过滤:可选 projectId + validationStatus(纯读窄化,不改归属)。
          // 都不传 → 全量(经验库/裁决台全量读),旧调用零破坏。
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            projectId?: string;
            validationStatus?: "candidate" | "validated" | "discarded";
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const filter: {
            projectId?: string;
            validationStatus?: string;
          } = {};
          if (q.projectId !== undefined) filter.projectId = q.projectId;
          if (q.validationStatus !== undefined)
            filter.validationStatus = q.validationStatus;
          const { rows, total } = await service.listLearnings(
            ctx,
            {
              limit: pageSize,
              offset: (page - 1) * pageSize,
            },
            filter,
          );
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "learnings.patch": {
          const b = (body ?? {}) as {
            title?: string;
            insight?: string;
            learningType?: string;
          };
          const dto = await service.patchLearning(ctx, p.learningId ?? "", b);
          return { data: dto, meta: { requestId } };
        }
        case "learnings.get": {
          const learning = await service.getLearning(ctx, p.learningId ?? "");
          return { data: learning, meta: { requestId } };
        }
        case "learnings.create": {
          const b = (body ?? {}) as {
            title: string;
            insight?: string;
            learningType?: string;
          };
          // [T-610] 这个 wire op 只由用户确认动作调用，因此语义是“采纳进知识库”，
          // 不是 AI 自动产候选。候选内部写仍直接走 service.createLearning。
          const learning = await service.adoptLearning(ctx, b);
          return { data: learning, meta: { requestId } };
        }
        case "learnings.applications.create": {
          const b = (body ?? {}) as {
            projectId: string;
            applicationNote?: string;
          };
          const application = await service.applyLearning(
            ctx,
            p.learningId ?? "",
            b,
          );
          return { data: application, meta: { requestId } };
        }
        case "learnings.evaluate": {
          const b = (body ?? {}) as {
            validationStatus?: "candidate" | "validated" | "discarded";
          };
          const learning = await service.evaluateLearning(
            ctx,
            p.learningId ?? "",
            b,
          );
          return { data: learning, meta: { requestId } };
        }
        case "learnings.calibrationSuggestions.create": {
          // 复盘飞轮回流 轨B — promote this Learning into a CalibrationRuleSuggestion.
          const b = (body ?? {}) as {
            rubricId?: string;
            dimensionKey?: string;
            dimensionLabel?: string;
            weight?: number;
            description?: string;
            rationale?: string;
          };
          const suggestion = await service.suggestCalibrationRule(
            ctx,
            p.learningId ?? "",
            b,
          );
          return { data: suggestion, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
