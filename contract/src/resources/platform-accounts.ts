import { z } from "zod";
import { id, iso8601, platformId, platformAccountStatus } from "../primitives";

// 七步整合设计 §7.1 — 多账号矩阵. Stores a secret *reference*, never a raw token.
export const platformAccountResource = z.object({
  id,
  userId: id,
  platform: platformId,
  // [T-201b] accountHandle 降级为可编辑显示名(display name),非唯一;身份解析改用 externalAccountId。
  accountHandle: z.string(),
  // [T-201b] 稳定身份锚(抖音 sec_uid);首绑/回填不到时为 null。additive,不参与旧消费者。
  externalAccountId: z.string().nullable(),
  secretReference: z.string().nullable(),
  followerBaseline: z.number().int(),
  status: platformAccountStatus,
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type PlatformAccountResource = z.infer<typeof platformAccountResource>;

const platformCapability=z.object({available:z.boolean(),reason:z.string().trim().min(1)});
/** 真实装配能力，不代表某个账号已经登录或已完成采集。 */
export const platformAccountCapabilitiesResource=z.object({
  platform:platformId,
  bind:platformCapability.extend({method:z.enum(["qr","none"])}),
  collect:platformCapability,
  publish:platformCapability,
  draft:platformCapability,
  manual:platformCapability,
});
export type PlatformAccountCapabilitiesResource=z.infer<typeof platformAccountCapabilitiesResource>;

export const accountBindingStart=z.object({groupId:id,platform:platformId,expectedGroupVersion:z.number().int().positive(),idempotencyKey:z.string().min(1).max(160)}).strict();
export const accountBindingResource=z.object({runId:id,groupId:id,platform:platformId,status:z.enum(["queued","waiting_verification","verifying","finalizing","cancel_requested","cancelled","succeeded","failed"]),accountId:id.nullable(),error:z.string().nullable(),createdAt:iso8601,updatedAt:iso8601}).strict().refine(row=>row.status!=="succeeded"||row.accountId!==null,{message:"绑定成功必须包含真实账号ID"});
export type AccountBindingResource=z.infer<typeof accountBindingResource>;

/** 默认采集计划资格证据；不代表当前登录态。 */
export const accountCollectionPlanReadinessResource = z.object({
  accountId: id,
  platform: platformId,
  status: platformAccountStatus,
  collectAvailable: z.boolean().nullable(),
  planEvidence: z.enum(["verified", "missing", "unknown"]),
}).strict();
export type AccountCollectionPlanReadinessResource = z.infer<typeof accountCollectionPlanReadinessResource>;
