import { z } from "zod";

export const id = z.string().min(1);

// ISO-8601 UTC timestamp (e.g. 2026-06-13T02:00:00.000Z). Validated with a
// regex so the schema is independent of zod's evolving string-format API.
export const iso8601 = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// Enums below mirror frontend/src/types/domain.ts exactly (the source of truth).
export const platformId = z.enum([
  "youtube",
  "bilibili",
  "douyin",
  "xiaohongshu",
  "wechatVideo",
  "x",
]);

export const projectStatus = z.enum([
  "active",
  "paused",
  "archived",
  "completed",
]);

export const projectStageName = z.enum([
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
]);

export const stageStatus = z.enum([
  "pending",
  "in_progress",
  "completed",
  "skipped",
]);

export const creationMode = z.enum(["guided", "flexible", "freeform"]);

export const contentType = z.enum(["video", "image", "audio", "article"]);

export const assetType = z.enum([
  "image",
  "video",
  "audio",
  "document",
  "subtitle",
]);

export const publicationStatus = z.enum([
  "draft",
  "scheduled",
  "published",
  "removed",
  "failed",
]);

export const aiTaskStatus = z.enum([
  "queued",
  "running",
  "awaiting_confirmation",
  "succeeded",
  "failed",
  "cancelled",
]);
