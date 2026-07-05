import { z } from "zod";
import { id, iso8601, platformId, projectStageName, publicationStatus } from "../primitives";

// PAGE composition DTO for the Dashboard page. Modeled from
// `DashboardViewModel` in frontend/src/types/view-models.ts. Page DTOs project
// canonical resources into view-specific shapes, so fields are modeled with
// z.object/z.array rather than reusing raw resource schemas.

// Shared building blocks (view-models.ts) ------------------------------------

export const metricCard = z.object({
  id,
  label: z.string(),
  value: z.string(),
  delta: z.string(),
  trend: z.enum(["up", "down", "flat"]),
  tone: z.enum(["neutral", "positive", "negative", "warning", "info"]),
});
export type MetricCard = z.infer<typeof metricCard>;

const taskStatus = z.enum(["todo", "in_progress", "done", "blocked"]);
const taskPriority = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
// OutputStageName is a subset of ProjectStageName for the page projection;
// TodoRow.stage is `ProjectStageName | OutputStageName`, of which
// ProjectStageName is the superset.
const todoStage = projectStageName;

const continueCreating = z.object({
  heading: z.string(),
  projectId: id,
  projectTitle: z.string(),
  stage: projectStageName,
  progressPct: z.number(),
  updatedAt: iso8601,
});

const todoRow = z.object({
  id,
  title: z.string(),
  projectId: id,
  projectTitle: z.string(),
  stage: todoStage,
  dueAt: iso8601.nullable(),
  priority: taskPriority,
  status: taskStatus,
});

const topicRow = z.object({
  id,
  title: z.string(),
  heat: z.number(),
  trend: z.enum(["up", "down", "flat"]),
});

const publicationCompactRow = z.object({
  id,
  title: z.string(),
  platform: platformId,
  status: publicationStatus,
  views: z.number(),
  engagement: z.number(),
  publishedAt: iso8601,
});

const dataOverview = z.object({
  metrics: z.array(metricCard),
  trend: z.array(z.object({ label: z.string(), value: z.number() })),
});

const creationSuggestion = z.object({
  id,
  title: z.string(),
  description: z.string(),
  category: z.string(),
});

const viewModelError = z.object({ code: z.string(), message: z.string() });

export const dashboardPage = z.object({
  scenario: z.enum(["default", "empty", "loading", "error", "selected"]),
  kind: z.literal("dashboard"),
  loading: z.boolean(),
  error: viewModelError.nullable(),
  metrics: z.array(metricCard),
  // 诚实空态(T-143 ③):无进行中项目时为 null,前端渲染「还没有进行中的项目」空态,
  // 不再回退演示假项目 / sentinel 占位。
  continueCreating: continueCreating.nullable(),
  todos: z.array(todoRow),
  trendingTopics: z.array(topicRow),
  recentPublications: z.array(publicationCompactRow),
  dataOverview,
  suggestions: z.array(creationSuggestion),
  assistantPrompt: z.string(),
});
export type DashboardPage = z.infer<typeof dashboardPage>;
