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
