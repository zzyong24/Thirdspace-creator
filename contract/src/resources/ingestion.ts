import { z } from "zod";
import { id, iso8601 } from "../primitives";

// All three entities extend BaseEntity only. ExternalSource additionally
// carries a single `createdAt` field (it does NOT extend Timestamped).

export const externalSourceResource = z.object({
  id,
  userId: id,
  sourceType: z.string(),
  name: z.string(),
  sourceIdentifier: z.string(),
  secretReference: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type ExternalSourceResource = z.infer<typeof externalSourceResource>;

export const ingestionRunResource = z.object({
  id,
  externalSourceId: id,
  runType: z.string(),
  idempotencyKey: z.string(),
  status: z.string(),
  recordsReceived: z.number().int(),
  recordsWritten: z.number().int(),
  recordsRejected: z.number().int(),
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
});
export type IngestionRunResource = z.infer<typeof ingestionRunResource>;

export const ingestionErrorResource = z.object({
  id,
  ingestionRunId: id,
  recordKey: z.string(),
  errorCode: z.string(),
  errorMessage: z.string(),
  rejectedPayload: z.record(z.string(), z.unknown()),
});
export type IngestionErrorResource = z.infer<typeof ingestionErrorResource>;

// 抖音采集限流网关的**只读可观测快照**(T-038c / SPEC §4.5 [gate-F4] 透传链)。
// 单个 channel(creator-center / iesdouyin)的当前退避态:是否 cooldown、剩多久、
// 已连续退避几次、上次请求时刻。数据源是 DouyinRequestGateway.getChannelStatus 的
// 内存镜像(重启后由 douyin_throttle_state 恢复),读侧不落新表、纯实时。
export const douyinChannelThrottleStatus = z.object({
  channel: z.enum(["creator-center", "iesdouyin"]),
  // cooldown 是否激活(gateway 因连续风控信号设了未到期的 cooldownUntil)。
  cooldownActive: z.boolean(),
  // 距 cooldown 到期还剩多少毫秒(未激活为 0)。前端据此算「约 N 分钟」。
  cooldownEtaMs: z.number().int().nonnegative(),
  // 已连续退避次数(每次 throttled 累加,一次 ok 清零)。前端显「已退避 K 次」。
  consecutiveThrottles: z.number().int().nonnegative(),
  // 上次对该 channel 发起请求的 epoch ms(从未请求为 null)。
  lastRequestAt: z.number().int().nullable(),
});
export type DouyinChannelThrottleStatus = z.infer<
  typeof douyinChannelThrottleStatus
>;

// 两个 channel 的限流快照聚合(读侧 op 一次返齐,前端按 sourceKind 映射消费)。
export const douyinThrottleStatusResource = z.object({
  channels: z.array(douyinChannelThrottleStatus),
});
export type DouyinThrottleStatusResource = z.infer<
  typeof douyinThrottleStatusResource
>;
