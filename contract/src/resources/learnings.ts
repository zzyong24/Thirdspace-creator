import { z } from "zod";
import { id, iso8601 } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Enums local to this module (not exported by primitives.ts).
// learningType — extended with monetization-weighted types (§4.6):
// conversion_pattern / offer_insight. `editing` is the post-production (后期剪辑)
// bucket (GAP-EXP-edit). [T-183] edit_delta 是改稿信号源:用户手改 AI 产出的脚本时,
// before→after 差异沉淀成的「该创作者偏好」候选(飞轮最强品味信号)。Additive:
// existing values still parse.
const learningType = z.enum([
  "strategy",
  "hook",
  "structure",
  "failure",
  "process",
  "editing",
  "conversion_pattern",
  "offer_insight",
  "edit_delta",
]);
const validationStatus = z.enum(["candidate", "validated", "discarded"]);

// Learning extends BaseEntity, Timestamped.
export const learningResource = z.object({
  id,
  userId: id,
  reviewId: id.nullable(),
  // [T-118a gate-F3] 来源作品(project-scoped 复盘读的锚)。nullable —— 手录/非复盘来源无归属
  // 作品;review.analyze 采纳的经验带上任务的 projectId。additive + optional:旧 payload 不带
  // 该键仍解析(零破坏),后端 DTO mapper 始终填(null 或真值)。
  projectId: id.nullable().optional(),
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
