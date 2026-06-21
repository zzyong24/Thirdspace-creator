import { z } from "zod";
import { id, iso8601, platformId, platformAccountStatus } from "../primitives";

// 七步整合设计 §7.1 — 多账号矩阵. Stores a secret *reference*, never a raw token.
export const platformAccountResource = z.object({
  id,
  userId: id,
  platform: platformId,
  accountHandle: z.string(),
  secretReference: z.string().nullable(),
  followerBaseline: z.number().int(),
  status: platformAccountStatus,
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type PlatformAccountResource = z.infer<typeof platformAccountResource>;
