import { z } from "zod";
import { id, iso8601, platformId } from "../primitives";

export const creativeOutputType = z.enum(["image", "video", "article"]);
export const creativeKind = z.enum([
  "title", "body", "sections", "summary", "tags", "cardBriefs", "cover", "image_card", "script",
  "publish_title", "description", "publish_tags", "publish_cover",
]);
export const creativeOwner = z.enum(["graphic_post", "output_script", "wechat_article", "publication"]);
export const creativeResultStatus = z.enum(["queued", "running", "awaiting_confirmation", "succeeded", "failed", "cancelled", "adopted"]);
export const creativeCapabilityState = z.enum(["supported", "known_unavailable", "unknown"]);
export const creativeCapability = z.object({
  platform: platformId.nullable(), outputType: creativeOutputType, kind: creativeKind,
  state: creativeCapabilityState, reasonCode: z.string().nullable(), lastVerifiedAt: iso8601.nullable(),
}).strict();
export const creativeCandidateRef = z.object({ owner: creativeOwner, id }).strict();
export const creativeResult = z.object({
  resultId: id, projectId: id, outputId: id, outputType: creativeOutputType,
  targetPlatform: platformId.nullable(), targetSectionId: id.nullable(), kind: creativeKind, status: creativeResultStatus,
  typedCandidateRef: creativeCandidateRef.nullable(), taskId: id.nullable(),
  baseVersionId: id.nullable(), ruleSnapshotRef: id.nullable(),
  appliedRules: z.enum(["applied", "not_applied"]), sourceRefs: z.array(z.unknown()),
  value: z.unknown().nullable(), retryRequestId: z.string().min(8).max(128).nullable().optional(), errorCode: z.string().nullable(), retryOf: id.nullable(),
  createdAt: iso8601, updatedAt: iso8601,
}).strict();
export const creativeBundleItem = z.object({kind: creativeKind, targetPlatform: platformId.nullable(), targetSectionId: id.optional(), resultId: id,
  status: creativeResultStatus, errorCode: z.string().nullable()}).strict();
export const creativeBundle = z.object({bundleId: id, outputId: id,
  status: z.enum(["queued", "running", "complete", "partial_completed", "failed", "cancelled"]),
  items: z.array(creativeBundleItem), createdAt: iso8601}).strict();
export type CreativeKind = z.infer<typeof creativeKind>;
export type CreativeOwner = z.infer<typeof creativeOwner>;
export type CreativeResult = z.infer<typeof creativeResult>;
export type CreativeCapability = z.infer<typeof creativeCapability>;
export type CreativeBundle = z.infer<typeof creativeBundle>;
