import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./ingestion.errors";
import type { IngestionService } from "./ingestion.service";
import type { IngestionRunRow } from "./ingestion.repository";
import type { IngestionRunResource } from "./ingestion.schema";

// Ingestion transport (foundation §5.4) — the module's 7 contract ops served over
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
  "ingestion.runs.metrics",
  "ingestion.runs.knowledge",
  "ingestion.runs.assets",
  "ingestion.runs.artifacts",
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

type RecordsBody = { records?: Array<Record<string, unknown>> };

export function createIngestionTransport(
  serviceFactory: () => IngestionService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All 7 ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒ reject
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
          const run = await service.refreshDouyin(ctx, {
            externalSourceId: b.externalSourceId ?? "",
            capturedAt: b.capturedAt,
          });
          return { data: toRunResource(run), meta };
        }
        case "ingestion.douyin.login": {
          const result = await service.loginDouyin(ctx);
          return { data: result, meta };
        }
        case "ingestion.douyin.status": {
          const result = await service.checkDouyinStatus(ctx);
          return { data: result, meta };
        }
        case "ingestion.douyin.throttleStatus": {
          // T-038c:只读限流快照(非 run 资源,不走 toRunResource)。
          const result = await service.getDouyinThrottleStatus(ctx);
          return { data: result, meta };
        }
        case "ingestion.runs.metrics": {
          const run = await service.ingestMetrics(ctx, {
            runId: p.runId ?? "",
            records: ((body ?? {}) as RecordsBody).records ?? [],
          });
          return { data: toRunResource(run), meta };
        }
        case "ingestion.runs.knowledge": {
          const run = await service.ingestKnowledge(ctx, {
            runId: p.runId ?? "",
            records: ((body ?? {}) as RecordsBody).records ?? [],
          });
          return { data: toRunResource(run), meta };
        }
        case "ingestion.runs.assets": {
          const run = await service.ingestAssets(ctx, {
            runId: p.runId ?? "",
            records: ((body ?? {}) as RecordsBody).records ?? [],
          });
          return { data: toRunResource(run), meta };
        }
        case "ingestion.runs.artifacts": {
          const run = await service.ingestArtifacts(ctx, {
            runId: p.runId ?? "",
            records: ((body ?? {}) as RecordsBody).records ?? [],
          });
          return { data: toRunResource(run), meta };
        }
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
