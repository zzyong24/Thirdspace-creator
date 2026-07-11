// [T-212a] Benchmark 模块 schema surface —— re-export 契约 DTO + Row→DTO mapper（DTO 由显式
// mapper 构建，NEVER Drizzle row 直出；同 material-links / candidate 约定）。
import {
  benchmarkSourceResource,
  benchmarkWorkResource,
} from "@creatoros/contract";
import type {
  BenchmarkSourceRow,
  BenchmarkWorkRow,
} from "./benchmark.repository";

export { benchmarkSourceResource, benchmarkWorkResource };

export type BenchmarkSourceResource = (typeof benchmarkSourceResource)["_output"];
export type BenchmarkWorkResource = (typeof benchmarkWorkResource)["_output"];

export function toBenchmarkSourceDto(
  row: BenchmarkSourceRow,
): BenchmarkSourceResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId ?? null,
    platform: row.platform,
    externalAccountId: row.externalAccountId,
    nickname: row.nickname ?? null,
    homeUrl: row.homeUrl ?? null,
    note: row.note ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toBenchmarkWorkDto(
  row: BenchmarkWorkRow,
): BenchmarkWorkResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId ?? null,
    sourceId: row.sourceId,
    sourceExternalAccountId: row.sourceExternalAccountId,
    platform: row.platform,
    awemeId: row.awemeId,
    description: row.description,
    diggCount: row.diggCount,
    commentCount: row.commentCount ?? null,
    collectCount: row.collectCount ?? null,
    shareCount: row.shareCount ?? null,
    duration: row.duration ?? null,
    createTime: row.createTime ?? null,
    isViral: row.isViral,
    viralMultiple: row.viralMultiple ?? null,
    // [T-235b] 发现方式维度(黑马雷达)。
    discovery: row.discovery,
    authorFollowerCount: row.authorFollowerCount ?? null,
    discoveryKeyword: row.discoveryKeyword ?? null,
    teardownStatus: row.teardownStatus,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
