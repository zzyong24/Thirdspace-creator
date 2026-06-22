/**
 * Project Overview route (Task 12).
 *
 * `/projects/[projectId]` renders the project-overview Header mode page
 * (page-specs §4). The route lives inside the `(creator)` segment so the
 * shared AppShell (one Sidebar + one TopHeader in `project-overview`
 * mode) wraps it; the page itself is a Server Component.
 *
 * The URL `[projectId]` segment may carry either:
 *   1. A canonical project id (e.g. `project-ainativebrowser`), or
 *   2. A kebab-cased slug derived from the project title
 *      (e.g. `ai-native-browser`).
 * The slug is resolved against the REAL persisted project list
 * (`projects.list`) so the feature module can stay agnostic.
 *
 * The page view model is composed SERVER-SIDE from the REAL contract ops
 * `projects.get` (title/stage/progress/info), `projects.outputs.list`
 * (outputs) and `projects.activity.list` (activities), threaded through the
 * session ctx so reads stay user-scoped and a cross-user / unknown project
 * 404s (notFound). Sections with no read path yet (per-stage status,
 * asset/file rollups, milestones, per-project publishing) compose to empty —
 * they slot real data once those upstream reads land. A resolution failure
 * degrades to the feature's own default render so SSR never crashes.
 */

import { notFound } from "next/navigation";

import { ProjectOverviewPage } from "@/features/project-overview/project-overview-page";
import { resolveSession } from "@/lib/session.server";
import { createServerClient, client } from "@/lib/contract-client.server";
import type {
  ProjectOverviewViewModel,
} from "@/types/view-models";

interface ProjectOverviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

type Client = ReturnType<typeof createServerClient>;

const STAGE_ORDER = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
] as const;

export default async function ProjectOverviewRoute({
  params,
}: ProjectOverviewRouteProps) {
  const { projectId } = await params;
  const resolvedId = await resolveProjectIdParam(projectId);

  // Wave-4 server-read switch (module Q): read through the session ctx so a
  // cross-user / unknown project raises OwnershipError → 404, never a leaked
  // page (foundation §2; SPEC §20). With no session (SSR fallback / tests) the
  // feature renders its own default so SSR never crashes.
  const session = await resolveSession();
  if (!session) {
    return <ProjectOverviewPage projectId={resolvedId} />;
  }

  const scoped = createServerClient(session.ctx);
  let viewModel: ProjectOverviewViewModel | undefined;
  try {
    viewModel = await buildOverviewViewModel(scoped, resolvedId);
  } catch (err) {
    if (isOwnershipError(err)) notFound();
    // Any other read failure degrades to the feature's default render.
    viewModel = undefined;
  }

  return <ProjectOverviewPage projectId={resolvedId} viewModel={viewModel} />;
}

/**
 * Compose the Project Overview view model from REAL contract reads.
 *
 * - `projects.get` → projectTitle, stage, progressPct, projectInfo.
 * - `projects.outputs.list` → outputs.
 * - `projects.activity.list` → activities.
 *
 * The remaining VM sections (`stages` per-stage status, `assetStats`,
 * `recentFiles`, `milestones`, `publishing`) have no project-scoped read op on
 * the frozen contract surface (SPEC §13), so they compose to empty rather than
 * reintroducing fixtures. They render their card empty-states until those reads
 * land.
 */
async function buildOverviewViewModel(
  scoped: Client,
  projectId: string,
): Promise<ProjectOverviewViewModel> {
  const [project, outputs, activities] = await Promise.all([
    scoped.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    }) as Promise<ProjectResource>,
    scoped.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    }) as unknown as Promise<ReadonlyArray<ContentOutputResource>>,
    scoped.listActivity({
      params: { projectId },
      query: undefined,
      body: undefined,
    }) as unknown as Promise<ReadonlyArray<ProjectActivityResource>>,
  ]);

  return {
    scenario: "default",
    kind: "project-overview",
    projectId: project.id,
    projectTitle: project.title,
    stage: project.currentStage,
    progressPct: project.progressPct,
    // No per-stage status read op → every stage defaults to pending.
    stages: STAGE_ORDER.map((stage) => ({
      stage,
      status: "pending" as const,
      progressPct: 0,
    })),
    // No asset / file rollup read op on the frozen surface → empty.
    assetStats: [],
    recentFiles: [],
    activities: activities
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((activity) => activityToRow(activity)),
    projectInfo: buildProjectInfo(project),
    outputs: outputs.map((output) => ({
      id: output.id,
      title: output.title,
      contentType: output.contentType,
      status: output.status,
    })),
    // No per-project publishing read op on the frozen surface → empty.
    publishing: [],
    // No milestones read op on the frozen surface → empty.
    milestones: [],
    loading: false,
    error: null,
  };
}

function buildProjectInfo(
  project: ProjectResource,
): ProjectOverviewViewModel["projectInfo"] {
  return [
    { label: "项目类型", value: project.contentCategory },
    { label: "创建模式", value: creationModeLabel(project.creationMode) },
    { label: "开始时间", value: formatRecentTimestamp(project.startedAt) },
    {
      label: "目标完成",
      value: project.targetCompletedAt
        ? formatRecentTimestamp(project.targetCompletedAt)
        : "—",
    },
    { label: "状态", value: projectStatusLabel(project.status) },
  ];
}

function activityToRow(
  activity: ProjectActivityResource,
): ProjectOverviewViewModel["activities"][number] {
  switch (activity.eventType) {
    case "artifact_updated":
      return {
        id: activity.id,
        title: "脚本被更新",
        occurredAt: activity.occurredAt,
        tone: "info",
        eventType: activity.eventType,
      };
    case "evidence_linked":
      return {
        id: activity.id,
        title: "研究阶段关联了新证据",
        occurredAt: activity.occurredAt,
        tone: "positive",
        eventType: activity.eventType,
      };
    case "milestone_completed":
      return {
        id: activity.id,
        title: "里程碑已完成",
        occurredAt: activity.occurredAt,
        tone: "positive",
        eventType: activity.eventType,
      };
    default:
      return {
        id: activity.id,
        title: "项目状态变化",
        occurredAt: activity.occurredAt,
        tone: "info",
        eventType: activity.eventType,
      };
  }
}

function creationModeLabel(mode: string): string {
  const labels: Readonly<Record<string, string>> = {
    guided: "引导式",
    flexible: "省心模式",
    freeform: "自由模式",
  };
  return labels[mode] ?? mode;
}

function projectStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    active: "进行中",
    paused: "已暂停",
    archived: "已归档",
    completed: "已完成",
  };
  return labels[status] ?? status;
}

function formatRecentTimestamp(iso: string): string {
  // Render as a deterministic YYYY-MM-DD HH:mm label (Server Component, fixed
  // Asia/Shanghai timezone anchored on FIXED_NOW).
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return iso;
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * An OwnershipError surfaces from the dispatch transport with `code` set to the
 * contract `OwnershipError` code (→ HTTP 404 on the wire). The composed op is
 * called in-process here, so the thrown error carries that `.code`; match on it
 * structurally (no class import across the server-only boundary).
 */
function isOwnershipError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    /Ownership/i.test((err as { code: string }).code)
  );
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id against the
 * REAL persisted project list (`projects.list`).
 *
 * - If `param` matches a known canonical id, return it unchanged.
 * - Otherwise, look for a project whose kebab-cased title equals `param`
 *   (e.g. `AI Native Browser 深度解析` → `ai-native-browser`).
 * - If no project matches (or the read fails), return the original param so the
 *   page renders its "未找到项目" empty state instead of crashing.
 */
async function resolveProjectIdParam(param: string): Promise<string> {
  if (!param) return param;
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; title: string }>;
    if (projects.some((project) => project.id === param)) {
      return param;
    }
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    return match?.id ?? param;
  } catch {
    return param;
  }
}

function slugifyTitle(title: string): string {
  // Keep only ASCII letters/digits so a title like
  // "AI Native Browser 深度解析" collapses to "ai-native-browser"
  // (the trailing CJK segment is dropped, not retained as "-深度解析").
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Local structural aliases for the contract resources we read. Imported as
// types only via the client return shapes above.
type ProjectResource = {
  readonly id: string;
  readonly title: string;
  readonly contentCategory: string;
  readonly creationMode: string;
  readonly status: string;
  readonly currentStage: (typeof STAGE_ORDER)[number];
  readonly progressPct: number;
  readonly startedAt: string;
  readonly targetCompletedAt: string | null;
};

type ContentOutputResource = {
  readonly id: string;
  readonly title: string;
  readonly contentType: ProjectOverviewViewModel["outputs"][number]["contentType"];
  readonly status: ProjectOverviewViewModel["outputs"][number]["status"];
};

type ProjectActivityResource = {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
};
