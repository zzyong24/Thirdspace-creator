import { z } from "zod";
import { id, iso8601 } from "../primitives.js";

// Enums below mirror frontend/src/types/domain.ts exactly. None are exported
// from primitives.ts (shared file), so they are defined locally here.
const reviewType = z.enum(["project", "output"]);
const reviewStatus = z.enum(["in_progress", "completed", "abandoned"]);
const insightType = z.enum(["success", "issue", "action", "hypothesis"]);

// Review extends BaseEntity only (no Timestamped); it declares its own
// createdAt + completedAt fields explicitly.
export const reviewResource = z.object({
  id,
  projectId: id,
  contentOutputId: id.nullable(),
  reportArtifactId: id.nullable(),
  reviewType,
  status: reviewStatus,
  periodStart: iso8601,
  periodEnd: iso8601,
  createdAt: iso8601,
  completedAt: iso8601.nullable(),
});
export type ReviewResource = z.infer<typeof reviewResource>;

// ReviewPublication extends BaseEntity only (no Timestamped).
export const reviewPublicationResource = z.object({
  id,
  reviewId: id,
  publicationId: id,
});
export type ReviewPublicationResource = z.infer<
  typeof reviewPublicationResource
>;

// ReviewInsight extends BaseEntity only (no Timestamped).
export const reviewInsightResource = z.object({
  id,
  reviewId: id,
  insightType,
  title: z.string(),
  description: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  priority: z.number().int(),
});
export type ReviewInsightResource = z.infer<typeof reviewInsightResource>;
