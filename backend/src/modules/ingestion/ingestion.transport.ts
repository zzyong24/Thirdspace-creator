import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./ingestion.errors";
import type { IngestionService } from "./ingestion.service";
import type { IngestionRunRow } from "./ingestion.repository";
import type { IngestionRunResource } from "./ingestion.schema";

// Ingestion transport (foundation §5.4) — the module's契约 ops(run create/complete/get
// + 抖音四 op;[T-248 批C] 四个 batch-push op 已删)served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// publishing/analytics transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// single envelope `{ data: ingestionRunResource, meta: { requestId } }`. A persisted
// op reached with NO ctx is an unauthenticated dispatch → AuthenticationError
// (→401). Ops this transport does not own throw UnsupportedOperationError so the
// composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from INGESTION_OP_IDS (adding the module = registering it).

export const INGESTION_OP_IDS = [
  "ingestion.runs.create",
  "ingestion.douyin.refresh",
  "ingestion.douyin.login",
  "ingestion.douyin.status",
  "ingestion.douyin.throttleStatus",
  // [T-248 批C] 四个 batch-push op(runs.metrics/knowledge/assets/artifacts)已删 ——
  // 真实采集在服务端直接调 ingestion service 层(ingestMetrics 等),不经契约 dispatch。
  "ingestion.runs.complete",
  "ingestion.runs.get",
] as const;

// Drizzle run row → ingestionRunResource DTO. Drops user_id and never leaks the row
// type (SPEC §9). startedAt/completedAt are nullable ISO text.
function toRunResource(row: IngestionRunRow): IngestionRunResource {
  return {
    id: row.id,
    externalSourceId: row.externalSourceId,
    runType: row.runType,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    recordsReceived: row.recordsReceived,
    recordsWritten: row.recordsWritten,
    recordsRejected: row.recordsRejected,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
  };
}

type Input = { params?: unknown; body?: unknown };

export function createIngestionTransport(
  serviceFactory: () => IngestionService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All owned ops are persisted. No ctx ⇒ unauthenticated dispatch ⇒ reject
      // before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { runId?: string };
      const meta = { requestId };

      switch (endpoint.id) {
        case "ingestion.runs.create": {
          const b = (body ?? {}) as {
            externalSourceId?: string;
            runType?: string;
            idempotencyKey?: string;
          };
          const run = await service.createRun(ctx, {
            externalSourceId: b.externalSourceId ?? "",
            runType: b.runType ?? "",
            idempotencyKey: b.idempotencyKey ?? "",
          });
          return { data: toRunResource(run), meta };
        }
        case "ingestion.douyin.refresh": {
          const b = (body ?? {}) as {
            externalSourceId?: string;
            capturedAt?: string;
          };
          // [T-136 §D/§A 切片 c] 号来自 **ctx.accountId**(x-account-id header 经
          //   resolveRequestContext 属主校验的唯一可信路径),不读 body.accountId —— body 的
          //   accountId 是 additive 客户端声明位,客户端应同步写 header;transport 认 body 会绕过
          //   §A BLOCKER-1 属主校验(伪造 body.accountId 指他人号)。service 从 ctx.accountId 取号。
          const run = await service.refreshDouyin(ctx, {
            externalSourceId: b.externalSourceId ?? "",
            capturedAt: b.capturedAt,
          });
          return { data: toRunResource(run), meta };
        }
        case "ingestion.douyin.login": {
          // [T-136] 号取 ctx.accountId(见 refresh 注释);扫码落该号独立登录态目录。
          const result = await service.loginDouyin(ctx);
          return { data: result, meta };
        }
        case "ingestion.douyin.status": {
          // [T-136] 号取 ctx.accountId;status 按该号返回(sourceReady 针对该号的源)。
          const result = await service.checkDouyinStatus(ctx);
          return { data: result, meta };
        }
        case "ingestion.douyin.throttleStatus": {
          // T-038c:只读限流快照(非 run 资源,不走 toRunResource)。
          const result = await service.getDouyinThrottleStatus(ctx);
          return { data: result, meta };
        }
        // [T-248 批C] runs.metrics/knowledge/assets/artifacts 四个 case 已随契约 op 删除;
        // service 层 ingestMetrics/ingestKnowledge/ingestAssets/ingestArtifacts 原样保留
        // (persistence-client 等进程内调用方不受影响)。
        case "ingestion.runs.complete": {
          const b = (body ?? {}) as { status?: string };
          const run = await service.completeRun(ctx, {
            runId: p.runId ?? "",
            status: b.status,
          });
          return { data: toRunResource(run), meta };
        }
        case "ingestion.runs.get": {
          const run = await service.getRun(ctx, p.runId ?? "");
          return { data: toRunResource(run), meta };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
