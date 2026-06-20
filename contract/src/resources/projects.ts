import { z } from "zod";
import {
  id,
  iso8601,
  projectStatus,
  projectStageName,
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

const outputStatus = z.enum([
  "drafting",
  "recording",
  "editing",
  "ready",
  "published",
]);

export const contentOutputResource = z.object({
  id,
  projectId: id,
  title: z.string(),
  contentType,
  format: z.string(),
  aspectRatio: z.string(),
  targetDurationSeconds: z.number(),
  status: outputStatus,
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
