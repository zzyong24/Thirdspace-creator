import { z } from "zod";
import { id, iso8601, platformId, projectStageName, publicationStatus, contentType } from "../primitives";
import { metricCard } from "./dashboard";

// PAGE composition DTO for the Project Overview page. Modeled from
// `ProjectOverviewViewModel` in frontend/src/types/view-models.ts.

const viewModelError = z.object({ code: z.string(), message: z.string() });

// ContentOutput["status"] — the output status enum from the domain model.
const outputStatus = z.enum([
  "drafting",
  "recording",
  "editing",
  "ready",
  "published",
]);

// ContentOutputSummary (view-models.ts) -------------------------------------
const contentOutputSummary = z.object({
  id,
  title: z.string(),
  contentType,
  status: outputStatus,
});

const stageRow = z.object({
  stage: projectStageName,
  status: z.enum(["pending", "in_progress", "completed", "skipped"]),
  progressPct: z.number(),
});

const recentFile = z.object({
  id,
  name: z.string(),
  type: z.string(),
  fileKind: z.enum(["document", "script", "shot", "data"]),
  updatedAt: iso8601,
});

const activity = z.object({
  id,
  title: z.string(),
  occurredAt: iso8601,
  tone: z.enum(["info", "positive", "warning"]),
  eventType: z.string(),
});

const projectInfoRow = z.object({ label: z.string(), value: z.string() });

const publishingRow = z.object({
  id,
  platform: platformId,
  status: publicationStatus,
  publishedAt: iso8601.nullable(),
});

const milestone = z.object({
  id,
  title: z.string(),
  targetAt: iso8601,
  status: z.enum(["pending", "completed", "missed"]),
});

export const projectOverviewPage = z.object({
  scenario: z.enum(["default", "empty", "loading", "error", "selected"]),
  kind: z.literal("project-overview"),
  loading: z.boolean(),
  error: viewModelError.nullable(),
  projectId: id,
  projectTitle: z.string(),
  stage: projectStageName,
  progressPct: z.number(),
  stages: z.array(stageRow),
  assetStats: z.array(metricCard),
  recentFiles: z.array(recentFile),
  activities: z.array(activity),
  projectInfo: z.array(projectInfoRow),
  outputs: z.array(contentOutputSummary),
  publishing: z.array(publishingRow),
  milestones: z.array(milestone),
});
export type ProjectOverviewPage = z.infer<typeof projectOverviewPage>;
