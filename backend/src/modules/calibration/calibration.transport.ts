import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./calibration.errors";
import type { CalibrationService } from "./calibration.service";

// Calibration transport (foundation §5.4) — the module's 7 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized monetization
// transport: a `Transport` whose request(endpoint, input, ctx) switches on endpoint.id,
// threads ctx into the service, and returns the SPEC §14 single-resource envelope. A
// persisted op reached with NO ctx is an unauthenticated dispatch → AuthenticationError
// (→401). Ops this transport does not own throw UnsupportedOperationError so the
// composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from CALIBRATION_OP_IDS (adding the module = registering it). The
// service already maps rows → contract DTOs (calibration.schema.ts), so the transport
// only threads ctx + shapes the envelope.

export const CALIBRATION_OP_IDS = [
  "calibration.rubrics.create",
  "calibration.rubrics.bumpVersion",
  "calibration.rubrics.get",
  "calibration.predictions.create",
  "calibration.predictions.lock",
  "calibration.predictions.get",
  "calibration.predictions.list",
  "calibration.results.create",
  "calibration.overview",
  // 复盘飞轮回流 轨B (Learning→校准): list pending reflowed rule-suggestions + 采纳 one.
  "calibration.suggestions.list",
  "calibration.suggestions.adopt",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createCalibrationTransport(
  serviceFactory: () => CalibrationService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        rubricId?: string;
        predictionId?: string;
        suggestionId?: string;
      };

      switch (endpoint.id) {
        case "calibration.rubrics.create": {
          const b = (body ?? {}) as {
            name: string;
            dimensions: { key: string; label: string; weight: number }[];
          };
          const dto = await service.createRubric(ctx, b);
          return { data: dto, meta: { requestId } };
        }
        case "calibration.rubrics.bumpVersion": {
          const b = (body ?? {}) as {
            dimensions: { key: string; label: string; weight: number }[];
            changeSummary?: string;
          };
          const dto = await service.bumpRubricVersion(ctx, p.rubricId ?? "", {
            dimensions: b.dimensions,
            changeSummary: b.changeSummary ?? "",
          });
          return { data: dto, meta: { requestId } };
        }
        case "calibration.rubrics.get": {
          const dto = await service.getRubric(ctx, p.rubricId ?? "");
          return { data: dto, meta: { requestId } };
        }
        case "calibration.predictions.create": {
          const b = (body ?? {}) as {
            subjectType: "content_output" | "publication";
            subjectId: string;
            rubricVersionId: string;
            predictedMetrics?: Record<string, unknown>;
            predictedConversion?: Record<string, unknown>;
            confidence: "high" | "med" | "low";
          };
          const dto = await service.createPrediction(ctx, {
            subjectType: b.subjectType,
            subjectId: b.subjectId,
            rubricVersionId: b.rubricVersionId,
            predictedMetrics: b.predictedMetrics ?? {},
            predictedConversion: b.predictedConversion ?? {},
            confidence: b.confidence,
          });
          return { data: dto, meta: { requestId } };
        }
        case "calibration.predictions.lock": {
          const dto = await service.lockPrediction(ctx, p.predictionId ?? "");
          return { data: dto, meta: { requestId } };
        }
        case "calibration.predictions.get": {
          const dto = await service.getPrediction(ctx, p.predictionId ?? "");
          return { data: dto, meta: { requestId } };
        }
        case "calibration.predictions.list": {
          // The contract query is paginationQuery (page/pageSize, 1-based). Convert to
          // limit/offset; the list envelope mirrors ai.conversations.list.
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listPredictions(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "calibration.results.create": {
          const b = (body ?? {}) as {
            ingestionRunId?: string;
            actualMetrics?: Record<string, unknown>;
          };
          const dto = await service.recordResult(ctx, p.predictionId ?? "", {
            // 省略 → 服务端自建 manual run(§C-4 溯源不破)。空串也视作省略。
            ingestionRunId: b.ingestionRunId || undefined,
            actualMetrics: b.actualMetrics ?? {},
          });
          return { data: dto, meta: { requestId } };
        }
        case "calibration.overview": {
          // 校准中心总览 — a read-only aggregate (4 KPI + 待校准内容 + 回流对照 + 经验沉淀),
          // every value DERIVED from real rows at read time (no body/params).
          const overview = await service.getOverview(ctx);
          return { data: overview, meta: { requestId } };
        }
        case "calibration.suggestions.list": {
          // 复盘飞轮回流 轨B — paginated PENDING reflowed rule-suggestions (list envelope).
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listRuleSuggestions(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "calibration.suggestions.adopt": {
          // 采纳 → a NEW RubricVersion (single-resource envelope).
          const dto = await service.adoptRuleSuggestion(
            ctx,
            p.suggestionId ?? "",
          );
          return { data: dto, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
