import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import { benchmarkSourceResource } from "../resources/benchmark";

const sourceParams = z.object({ sourceId: id });

// [T-212a] Benchmark 对标源 CRUD ops（list/create/toggle enabled/remove）。破坏性/状态变更走
// POST（同 accounts.archive / material-links.delete 约定）。对标作品由采集 job 落库，无 write op
// （T-212c 拆解转化才读它），故此处只暴露"源"的契约。
export const benchmarkOperations = {
  listBenchmarkSources: defineEndpoint({
    id: "benchmark.sources.list",
    method: "GET",
    path: "/benchmark/sources",
    query: paginationQuery,
    response: benchmarkSourceResource,
    isList: true,
    fr: ["FR-BENCHMARK-SOURCE-LIST"],
  }),
  createBenchmarkSource: defineEndpoint({
    id: "benchmark.sources.create",
    method: "POST",
    path: "/benchmark/sources",
    body: z.object({
      externalAccountId: z.string().min(1), // sec_uid
      nickname: z.string().nullable().optional(),
      homeUrl: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
      platform: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
    response: benchmarkSourceResource,
    fr: ["FR-BENCHMARK-SOURCE-CREATE"],
  }),
  toggleBenchmarkSource: defineEndpoint({
    id: "benchmark.sources.toggle",
    method: "POST",
    path: "/benchmark/sources/:sourceId/toggle",
    params: sourceParams,
    body: z.object({ enabled: z.boolean() }),
    response: benchmarkSourceResource,
    fr: ["FR-BENCHMARK-SOURCE-TOGGLE"],
  }),
  removeBenchmarkSource: defineEndpoint({
    id: "benchmark.sources.remove",
    method: "POST",
    path: "/benchmark/sources/:sourceId/remove",
    params: sourceParams,
    response: benchmarkSourceResource,
    fr: ["FR-BENCHMARK-SOURCE-REMOVE"],
  }),
} as const;
