import type { Endpoint, Transport, RequestContext, CollectionRunResource } from "@creatoros/contract";
import { AuthenticationError, UnsupportedOperationError } from "@creatoros/backend";
import type { createPlatformCollectionService } from "./platform-collection.service";

export const PLATFORM_COLLECTION_OP_IDS = [
  "platforms.capabilities.list", "platforms.bind.begin", "platforms.bind.confirm",
  "platforms.bind.cancel", "platforms.collections.start", "platforms.collections.get",
  "platforms.collections.cancel", "platforms.works.list", "platforms.metrics.read", "platforms.reports.list",
] as const;

type PlatformCollectionService = ReturnType<typeof createPlatformCollectionService>;
type Input = { params?: unknown; query?: unknown; body?: unknown };
type BindAttempt = Awaited<ReturnType<PlatformCollectionService["bindBegin"]>>;
export interface PlatformCollectionHostHooks {
  afterBindBegin?: (ctx: RequestContext, attempt: BindAttempt) => Promise<BindAttempt>;
  afterCollectionStart?: (ctx: RequestContext, run: CollectionRunResource) => void;
  afterCollectionGet?: (ctx: RequestContext, run: CollectionRunResource) => void;
}

// Public transport deliberately has no source page or identity-proof operation.
export function createPlatformCollectionTransport(serviceFactory: () => PlatformCollectionService,
  hooks: PlatformCollectionHostHooks = {}): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { accountId?: string; attemptId?: string; bindAttemptId?: string };
      const q = (query ?? {}) as { cursor?: string | null; pageSize?: number;
        projectId?: string; platformWorkId?: string; metricKey?: string };
      const requestId = ctx.requestId;
      let data: unknown;
      switch (endpoint.id) {
        case "platforms.capabilities.list":
          data = service.listCapabilities(ctx);
          break;
        case "platforms.bind.begin":
          data = await service.bindBegin(ctx, body);
          if (hooks.afterBindBegin) data = await hooks.afterBindBegin(ctx, data as BindAttempt);
          break;
        case "platforms.bind.confirm":
          data = await service.bindConfirm(ctx, { bindAttemptId: p.bindAttemptId });
          break;
        case "platforms.bind.cancel":
          data = await service.bindCancel(ctx, { bindAttemptId: p.bindAttemptId });
          break;
        case "platforms.collections.start": {
          const b = (body ?? {}) as { capability?: string; clientRequestId?: string };
          data = await service.start(ctx, { accountId: p.accountId, capability: b.capability,
            clientRequestId: b.clientRequestId });
          hooks.afterCollectionStart?.(ctx, data as CollectionRunResource);
          break;
        }
        case "platforms.collections.get":
          data = await service.status(ctx, p.accountId ?? "", p.attemptId ?? "");
          hooks.afterCollectionGet?.(ctx, data as CollectionRunResource);
          break;
        case "platforms.collections.cancel":
          data = await service.cancel(ctx, p.accountId ?? "", p.attemptId ?? "");
          break;
        case "platforms.reports.list":
          data=await service.listNativeReports(ctx,{accountId:p.accountId,cursor:q.cursor??null,pageSize:q.pageSize??20});
          break;
        case "platforms.works.list":
          data = await service.listWorks(ctx, { accountId: p.accountId, cursor: q.cursor ?? null,
            pageSize: q.pageSize ?? 20, projectId: q.projectId });
          break;
        case "platforms.metrics.read":
          data = await service.readMetrics(ctx, { accountId: p.accountId, cursor: q.cursor ?? null,
            pageSize: q.pageSize ?? 20, platformWorkId: q.platformWorkId, metricKey: q.metricKey });
          break;
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
      return { data: endpoint.response.parse(data), meta: { requestId } };
    },
  };
}
