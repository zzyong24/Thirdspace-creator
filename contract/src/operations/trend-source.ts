import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import { trendSourceResource } from "../resources/trend-source";

const sourceParams = z.object({ sourceId: id });

// [T-235b] 热点信源 CRUD ops(list/create/toggle enabled/remove),照 benchmark.sources.* 先例。
// 破坏性/状态变更走 POST(同 accounts.archive / benchmark.sources.toggle 约定)。信源信号不落库
// (出题时即抓即用拼 brief),故此处只暴露「源」的契约。
export const trendSourceOperations = {
  listTrendSources: defineEndpoint({
    id: "trend.sources.list",
    method: "GET",
    path: "/trend/sources",
    query: paginationQuery,
    response: trendSourceResource,
    isList: true,
    fr: ["FR-TREND-SOURCE-LIST"],
  }),
  createTrendSource: defineEndpoint({
    id: "trend.sources.create",
    method: "POST",
    path: "/trend/sources",
    body: z.object({
      url: z.string().min(1),
      name: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
      // 缺省按 URL 派生(feed 特征 → rss,否则 web);显式传入优先。
      sourceType: z.enum(["web", "rss"]).optional(),
      enabled: z.boolean().optional(),
    }),
    response: trendSourceResource,
    fr: ["FR-TREND-SOURCE-CREATE"],
  }),
  toggleTrendSource: defineEndpoint({
    id: "trend.sources.toggle",
    method: "POST",
    path: "/trend/sources/:sourceId/toggle",
    params: sourceParams,
    body: z.object({ enabled: z.boolean() }),
    response: trendSourceResource,
    fr: ["FR-TREND-SOURCE-TOGGLE"],
  }),
  removeTrendSource: defineEndpoint({
    id: "trend.sources.remove",
    method: "POST",
    path: "/trend/sources/:sourceId/remove",
    params: sourceParams,
    response: trendSourceResource,
    fr: ["FR-TREND-SOURCE-REMOVE"],
  }),
} as const;
