// [T-212a] Benchmark 模块 schema surface —— re-export 契约 DTO + Row→DTO mapper（DTO 由显式
// mapper 构建，NEVER Drizzle row 直出；同 material-links / candidate 约定）。
import {
  benchmarkSourceResource,
  benchmarkWorkResource,
  benchmarkWorkListItemResource,
} from "@creatoros/contract";
import type {
  BenchmarkSourceRow,
  BenchmarkWorkRow,
} from "./benchmark.repository";

export {
  benchmarkSourceResource,
  benchmarkWorkResource,
  benchmarkWorkListItemResource,
};

export type BenchmarkSourceResource = (typeof benchmarkSourceResource)["_output"];
export type BenchmarkWorkResource = (typeof benchmarkWorkResource)["_output"];
// [T-349b] 对标作品列表投影(信号源弹窗「对标作品」面板)。
export type BenchmarkWorkListItemResource =
  (typeof benchmarkWorkListItemResource)["_output"];

export function toBenchmarkSourceDto(
  row: BenchmarkSourceRow,
): BenchmarkSourceResource {
  return {
    id: row.id,
    userId: row.userId,
    groupId:row.groupId??null,
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

// [T-349b] 对标作品列表投影 mapper —— 只取面板渲染 + 逐字稿两态需要的字段(显式投影,
//   NEVER Drizzle row 直出)。origin 隔离:transcript/transcriptStatus 出自 benchmark_works 自身。
export function toBenchmarkWorkListItemDto(
  row: BenchmarkWorkRow,
): BenchmarkWorkListItemResource {
  return {
    id: row.id,
    awemeId: row.awemeId,
    platform: row.platform,
    description: row.description,
    diggCount: row.diggCount,
    isViral: row.isViral,
    transcript: row.transcript ?? null,
    transcriptStatus: row.transcriptStatus ?? null,
  };
}

export function toBenchmarkWorkDto(
  row: BenchmarkWorkRow,
): BenchmarkWorkResource {
  return {
    id: row.id,
    userId: row.userId,
    groupId:row.groupId??null,
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
