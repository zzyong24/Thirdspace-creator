import { z } from "zod";
import { id, iso8601 } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Enums local to this module (not exported by primitives.ts).
// learningType — extended with monetization-weighted types (§4.6):
// conversion_pattern / offer_insight. Additive: existing values still parse.
const learningType = z.enum([
  "strategy",
  "hook",
  "structure",
  "failure",
  "process",
  "conversion_pattern",
  "offer_insight",
]);
const validationStatus = z.enum(["candidate", "validated", "discarded"]);

// Learning extends BaseEntity, Timestamped.
export const learningResource = z.object({
  id,
  userId: id,
  reviewId: id.nullable(),
  learningType,
  title: z.string(),
  insight: z.string(),
  recommendation: z.string(),
  validationStatus,
  confidenceScore: z.number().int(),
  // Reuse signal — how many times this learning has been applied (one row in the
  // learningApplications table per application). Server-derived, read-only; filled
  // by both the list and the single-get read so the contract shape is uniform.
  reuseCount: z.number().int(),
  ...timestamps,
});
export type LearningResource = z.infer<typeof learningResource>;

// LearningApplication extends BaseEntity only (no Timestamped).
export const learningApplicationResource = z.object({
  id,
  learningId: id,
  projectId: id,
  contentOutputId: id.nullable(),
  applicationNote: z.string(),
  outcome: z.record(z.string(), z.unknown()),
  appliedAt: iso8601,
  evaluatedAt: iso8601.nullable(),
});
export type LearningApplicationResource = z.infer<
  typeof learningApplicationResource
>;
