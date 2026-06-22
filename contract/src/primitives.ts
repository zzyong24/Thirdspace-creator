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

// ── contract v0.4 (seven-step) enums ───────────────────────────────────────
// content_role is the §4.4 意图层 intent label, shared by Projects, Monetization
// and Candidate. It is already defined locally in resources/projects.ts as
// `contentRole`; the canonical enum lives here so the new modules import one
// source of truth. (Both spell the same three values.)
export const contentRole = z.enum(["traffic", "trust", "conversion"]);

// §3 positioning — gate subject + statement authorship.
export const positioningSubjectType = z.enum(["candidate", "project"]);
export const statementAuthorType = z.enum(["human", "ai"]);

// §4 monetization.
export const productStatus = z.enum(["active", "retired"]);
export const offerStatus = z.enum(["active", "expired"]);
export const leadSource = z.enum(["survey", "manual", "entry_code", "wecom"]);
export const attributionMethod = z.enum([
  "entry_code",
  "survey",
  "self_report",
  "inferred",
  "manual",
]);
export const attributionConfidence = z.enum(["high", "med", "low"]);
export const leadStatus = z.enum(["new", "qualified", "won", "lost"]);
export const conversionEventType = z.enum([
  "profile_visit",
  "follow",
  "lead",
  "inquiry",
  "signup",
  "purchase",
  "repurchase",
]);
export const attributionModelType = z.enum([
  "time_decay",
  "position_based",
  "last_touch",
]);

// §5 candidate.
export const candidateSource = z.enum(["trend", "benchmark", "demand", "idea"]);
export const candidateStatus = z.enum(["pool", "promoted", "dropped"]);
export const audienceSignalSource = z.enum([
  "comment",
  "dm",
  "consultation",
  "review",
]);

// §6 calibration.
export const predictionStatus = z.enum(["draft", "locked"]);
export const calibrationConfidence = z.enum(["high", "med", "low"]);
export const calibrationSubjectType = z.enum([
  "content_output",
  "publication",
]);

// §7.1 platform account.
export const platformAccountStatus = z.enum(["active", "archived"]);

// §7.2 content calendar.
export const calendarEntryStatus = z.enum(["planned", "published", "missed"]);
export const cadenceFrequency = z.enum([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "custom",
]);
