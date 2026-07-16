import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./reviews.errors";
import type { ReviewsService } from "./reviews.service";

// Reviews transport (foundation §5.4) — the module's 4 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// analytics/publishing transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// single-resource envelope. A persisted op reached with NO ctx is an
// unauthenticated dispatch → AuthenticationError (→401). Ops this transport does
// not own throw UnsupportedOperationError so the composite never masks a real
// error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from REVIEWS_OP_IDS (adding the module = registering it). The
// service already maps rows → contract DTOs (reviews.schema.ts), so the transport
// only threads ctx + shapes the envelope.

export const REVIEWS_OP_IDS = [
  "reviews.create",
  "reviews.list",
  "reviews.get",
  "reviews.insights.create",
  "reviews.complete",
] as const;

type Input = { params?: unknown; body?: unknown };

export function createReviewsTransport(
  serviceFactory: () => ReviewsService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every op is persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒ reject
      // before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        projectId?: string;
        reviewId?: string;
      };

      switch (endpoint.id) {
        case "reviews.create": {
          const b = (body ?? {}) as {
            reviewType: string;
            contentOutputId?: string | null;
          };
          const review = await service.createReview(ctx, p.projectId ?? "", b);
          return { data: review, meta: { requestId } };
        }
        case "reviews.list": {
          const reviews = await service.listReviews(ctx, p.projectId ?? "");
          // [T-356④] isList 端点的响应 envelope 是 listMeta(page/pageSize/total 必填)——此前只返
          // { requestId },client 侧 envelope.parse 必抛 ZodError → readReviewHistory 静默 catch 成
          // 空 → 「复盘记录」永远空(洞察写入全成功、读回被吞,用户以为没写进去)。dispatch 路由不做
          // envelope 校验所以 curl 可读,坑只咬 RSC/浏览器 client。该 op 无分页参数,按全量单页回填。
          return {
            data: reviews,
            meta: {
              requestId,
              page: 1,
              pageSize: Math.max(1, reviews.length),
              total: reviews.length,
            },
          };
        }
        case "reviews.get": {
          const review = await service.getReview(ctx, p.reviewId ?? "");
          return { data: review, meta: { requestId } };
        }
        case "reviews.insights.create": {
          const b = (body ?? {}) as {
            insightType: string;
            title: string;
            description?: string;
          };
          const insight = await service.createInsight(
            ctx,
            p.reviewId ?? "",
            b,
          );
          return { data: insight, meta: { requestId } };
        }
        case "reviews.complete": {
          const review = await service.completeReview(ctx, p.reviewId ?? "");
          return { data: review, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
