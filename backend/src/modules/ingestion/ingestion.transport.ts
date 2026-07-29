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
          // [T-595] 公开 API 不再允许绕过创作者中心可见性闸门直接“抓指标即入库”。
          // 真采集统一由 scheduled self.metrics canonical collector 执行：先确认公开，再调用
          // ingestApprovedDouyinBatch。保留 endpoint id 只为旧客户端得到明确升级错误。
          throw new Error(
            "直接刷新作品指标已退役，请运行“我的作品指标”采集任务以先确认作品公开状态",
          );
        }
        case "ingestion.douyin.login": {
          // [T-136] 号取 ctx.accountId(见 refresh 注释);扫码落该号独立登录态目录。
          // [T-330] body.forceNew(「扫码绑定新抖音号」)→ staging 隔离扫码链;forceNew 只是
          //   行为开关(不指号),不经 ctx 属主校验路径,读 body 安全。
          const b = (body ?? {}) as {
            forceNew?: boolean;
            site?: "douyin.com" | "douhot.douyin.com";
          };
          const result = await service.loginDouyin(ctx, {
            forceNew: b.forceNew === true,
            site: b.site,
          });
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
