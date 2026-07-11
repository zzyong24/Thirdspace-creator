import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./topic-attribution.errors";
import type { TopicAttributionService } from "./topic-attribution.service";

// [T-235d] TopicAttribution transport(foundation §5.4,照 trend-sources.transport 先例)——
// 选题归因**只读** 1 op over REAL SQL,同 /api/v1/dispatch。写侧不走契约 op(归因由采集实绩
// 触发的后台 runner 落库)。no-ctx → AuthenticationError(401);本 transport 不认的 op →
// UnsupportedOperationError(composite 不掩真错)。

export const TOPIC_ATTRIBUTION_OP_IDS = ["topics.attributions.list"] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createTopicAttributionTransport(
  serviceFactory: () => TopicAttributionService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { query } = (input ?? {}) as Input;

      switch (endpoint.id) {
        case "topics.attributions.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            publicationId?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listAttributions(ctx, {
            page,
            pageSize,
            publicationId: q.publicationId,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
