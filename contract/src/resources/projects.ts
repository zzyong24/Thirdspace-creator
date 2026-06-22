import { z } from "zod";
import {
  id,
  iso8601,
  projectStatus,
  projectStageName,
  stageStatus,
  creationMode,
  contentType,
} from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

export const projectResource = z.object({
  id,
  userId: id,
  title: z.string(),
  brief: z.string(),
  contentCategory: z.string(),
  creationMode,
  status: projectStatus,
  currentStage: projectStageName,
  progressPct: z.number().int().min(0).max(100),
  starred: z.boolean(),
  startedAt: iso8601,
  targetCompletedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
  archivedAt: iso8601.nullable(),
  ...timestamps,
});
export type ProjectResource = z.infer<typeof projectResource>;

// ProjectStage — per-stage progress row for the 6-stage pipeline (project_stages
// table). Read-only view consumed by the Project Overview stepper so it reflects
// real per-stage status instead of a derived `currentStage`.
export const projectStageResource = z.object({
  stage: projectStageName,
  status: stageStatus,
  progressPct: z.number().int().min(0).max(100),
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
});
export type ProjectStageResource = z.infer<typeof projectStageResource>;

const outputStatus = z.enum([
  "drafting",
  "recording",
  "editing",
  "ready",
  "published",
]);

// ContentRole — monetization-weighted intent layer (七步整合设计 §4.4).
// Declares whether a content output is meant to drive traffic, build trust, or
// convert. Optional so existing outputs (created before the field) keep parsing.
export const contentRole = z.enum(["traffic", "trust", "conversion"]);
export type ContentRole = z.infer<typeof contentRole>;

export const contentOutputResource = z.object({
  id,
  projectId: id,
  title: z.string(),
  contentType,
  format: z.string(),
  aspectRatio: z.string(),
  targetDurationSeconds: z.number(),
  status: outputStatus,
  contentRole: contentRole.nullable().optional(),
  primaryAssetId: id.nullable(),
  ...timestamps,
});
export type ContentOutputResource = z.infer<typeof contentOutputResource>;

const taskStatus = z.enum(["todo", "in_progress", "done", "blocked"]);
// TaskPriority is a numeric 1..5 in the domain model.
const taskPriority = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// Task extends BaseEntity only (no Timestamped).
export const taskResource = z.object({
  id,
  projectId: id,
  contentOutputId: id.nullable(),
  // stage is ProjectStageName | OutputStageName; ProjectStageName is the superset.
  stage: projectStageName,
  title: z.string(),
  description: z.string(),
  status: taskStatus,
  priority: taskPriority,
  dueAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
});
export type TaskResource = z.infer<typeof taskResource>;

// ProjectActivity extends BaseEntity only (no Timestamped).
export const projectActivityResource = z.object({
  id,
  projectId: id,
  eventType: z.string(),
  entityType: z.string(),
  entityId: id,
  eventData: z.record(z.string(), z.unknown()),
  occurredAt: iso8601,
});
export type ProjectActivityResource = z.infer<typeof projectActivityResource>;
