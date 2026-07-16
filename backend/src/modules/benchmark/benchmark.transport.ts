import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./benchmark.errors";
import type { BenchmarkService } from "./benchmark.service";

// [T-212a] Benchmark transport（foundation §5.4）—— 对标源 4 ops over REAL SQL，同 /api/v1/dispatch。
// no-ctx → AuthenticationError(401)；本 transport 不认的 op → UnsupportedOperationError（composite
// 不掩真错）。opId list = 本模块注册表，persistence-client 从 BENCHMARK_OP_IDS 并入 PERSISTED_OPS。

export const BENCHMARK_OP_IDS = [
  "benchmark.sources.list",
  "benchmark.sources.create",
  "benchmark.sources.toggle",
  "benchmark.sources.remove",
  // [T-349] composition-only op：module transport 不认它(default → UnsupportedOperationError),
  //   persistence-client 的 benchmarkWithTranscribe wrapper 在到达 module transport 前拦截。
  //   列入 OP_IDS 让 PERSISTED_OPS/dispatch 把它路由到 benchmark transport(同 scheduledJobs.runNow
  //   在 SCHEDULING_OP_IDS 却无 module case 的先例)。
  "benchmark.works.transcribe",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createBenchmarkTransport(
  serviceFactory: () => BenchmarkService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { sourceId?: string };

      switch (endpoint.id) {
        case "benchmark.sources.list": {
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listSources(ctx, { page, pageSize });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "benchmark.sources.create": {
          const b = (body ?? {}) as {
            externalAccountId: string;
            nickname?: string | null;
            homeUrl?: string | null;
            note?: string | null;
            platform?: string;
            enabled?: boolean;
          };
          const created = await service.createSource(ctx, {
            externalAccountId: b.externalAccountId,
            nickname: b.nickname ?? null,
            homeUrl: b.homeUrl ?? null,
            note: b.note ?? null,
            platform: b.platform,
            enabled: b.enabled,
          });
          return { data: created, meta: { requestId } };
        }
        case "benchmark.sources.toggle": {
          const b = (body ?? {}) as { enabled?: boolean };
          const updated = await service.toggleSource(
            ctx,
            p.sourceId ?? "",
            b.enabled ?? true,
          );
          return { data: updated, meta: { requestId } };
        }
        case "benchmark.sources.remove": {
          const removed = await service.removeSource(ctx, p.sourceId ?? "");
          return { data: removed, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
