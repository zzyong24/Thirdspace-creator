import { z } from "zod";
import { id, iso8601 } from "../primitives";

// [T-212a] 对标源 + 对标作品（选题/对标强化，SPEC 2026-07-11 §2.1）。单一 wire-shape 真源；
// 模块 benchmark.schema.ts re-export（同 material-links / candidate 约定）。

// BenchmarkSource —— 用户登记的"他号"对标博主（douyin sec_uid）。
export const benchmarkSourceResource = z.object({
  id,
  userId: id,
  accountId: id.nullable(), // 按抖音号隔离（哪个号在对标）
  platform: z.string(),
  externalAccountId: z.string(), // sec_uid（稳定身份键）
  nickname: z.string().nullable(),
  homeUrl: z.string().nullable(),
  note: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type BenchmarkSourceResource = z.infer<typeof benchmarkSourceResource>;

// BenchmarkWork —— 采集到的对标作品（含 detectViral 爆款判定 + 拆解状态）。
export const benchmarkWorkResource = z.object({
  id,
  userId: id,
  accountId: id.nullable(),
  sourceId: id,
  sourceExternalAccountId: z.string(),
  platform: z.string(),
  awemeId: z.string(),
  description: z.string(),
  diggCount: z.number().int(),
  commentCount: z.number().int().nullable(),
  collectCount: z.number().int().nullable(),
  shareCount: z.number().int().nullable(),
  duration: z.number().int().nullable(),
  createTime: z.string().nullable(),
  isViral: z.boolean(),
  viralMultiple: z.number().nullable(),
  teardownStatus: z.string(), // pending 待拆 | done（T-212c 转化后）
  capturedAt: iso8601,
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type BenchmarkWorkResource = z.infer<typeof benchmarkWorkResource>;
