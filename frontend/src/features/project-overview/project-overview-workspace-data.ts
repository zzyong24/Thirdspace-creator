import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildProjectOverviewViewModel } from "@/fixtures/selectors";
import type { ProjectOverviewViewModel } from "@/types/view-models";

/**
 * Project Overview READ-side data assembly ("工作台读侧做真").
 *
 * Assembles a REAL `ProjectOverviewViewModel` for the route from:
 *   - `projects.get`           → projectTitle / stage / progressPct / projectInfo
 *                                (项目创意 + 当前阶段),
 *   - `projects.outputs.list`  → outputs (产物列表),
 *   - `projects.activity.list` → activities (动态).
 *
 * Mirrors the Research template (`research-workspace-data.ts`):
 *   - the contract client is INJECTED so the helper is unit-testable and the
 *     route can thread its session-scoped client (user-scoped reads, SPEC §20),
 *   - degrades gracefully PER FIELD — sections with no project-scoped read op on
 *     the frozen contract surface (per-stage status, asset/file rollups,
 *     publishing, milestones) compose to EMPTY for real projects (cards own
 *     their empty state) and keep the fixture's curated content only for the
 *     canonical demo projects,
 *   - if the `projects.get` READ throws, the WHOLE VM falls back to the fixture
 *     builder (preserving the old behavior for ids absent from the canonical
 *     dataset). A REAL project must NEVER render "未找到项目".
 *
 * Ownership errors are NOT swallowed here — the route maps them to `notFound()`
 * so a cross-user / unknown project 404s instead of leaking a degraded page.
 */

const STAGE_ORDER = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
] as const;

type StageName = (typeof STAGE_ORDER)[number];

// Minimal structural DTOs — the contract client returns parsed resources; we
// only read the fields we map, so a narrow shape keeps the helper decoupled.
interface ProjectDto {
  readonly id: string;
  readonly title: string;
  readonly contentCategory: string;
  readonly creationMode: string;
  readonly status: string;
  readonly currentStage: StageName;
  readonly progressPct: number;
  readonly startedAt: string;
  readonly targetCompletedAt: string | null;
}

interface ContentOutputDto {
  readonly id: string;
  readonly title: string;
  readonly contentType: ProjectOverviewViewModel["outputs"][number]["contentType"];
  readonly status: ProjectOverviewViewModel["outputs"][number]["status"];
}

interface ProjectActivityDto {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
}

export interface ProjectOverviewDataClient {
  getProject(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listActivity(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

/**
 * An OwnershipError surfaces from the dispatch transport with `code` set to the
 * contract `OwnershipError` code (→ HTTP 404 on the wire). The composed op runs
 * in-process here, so the thrown error carries that `.code`; match on it
 * structurally (no class import across the server-only boundary).
 */
export function isOwnershipError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    /Ownership/i.test((err as { code: string }).code)
  );
}

/**
 * Build the REAL Project Overview ViewModel, degrading to the fixture VM on a
 * project-read failure. Ownership errors are RE-THROWN so the route can 404.
 *
 * @param projectId  the (already slug-resolved) canonical project id.
 * @param client     the contract client (server-bound, ideally session-scoped).
 *                   Injected for tests; defaults to the canonical server client.
 */
export async function buildProjectOverviewWorkspaceViewModel(
  projectId: string,
  client: ProjectOverviewDataClient = defaultClient as unknown as ProjectOverviewDataClient,
): Promise<ProjectOverviewViewModel> {
  // The fixture VM is the per-field fallback source for everything that has no
  // real read path this wave, and the WHOLE fallback if the project read fails.
  const fixtureVm = buildProjectOverviewViewModel(projectId);

  let project: ProjectDto;
  try {
    project = (await client.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ProjectDto;
  } catch (err) {
    // Cross-user / unknown project → let the route 404 instead of leaking a
    // degraded page.
    if (isOwnershipError(err)) throw err;
    // Any other read failure → preserve old behavior (fixture VM, which renders
    // "未找到项目" only for ids absent from the canonical dataset).
    return fixtureVm;
  }

  // A canonical/demo project keeps the fixture's curated rollup content; a real
  // project shows empty states (no fake data) for sections without a read op.
  const isFixtureProject = fixtureVm.scenario !== "empty";

  // 产物列表 — real `projects.outputs.list`. Empty array on failure (the card
  // owns its empty state) unless this is a canonical demo project.
  let outputs: ProjectOverviewViewModel["outputs"] = [];
  try {
    const list = (await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<ContentOutputDto>;
    outputs = list.map((output) => ({
      id: output.id,
      title: output.title,
      contentType: output.contentType,
      status: output.status,
    }));
  } catch {
    outputs = isFixtureProject ? fixtureVm.outputs : [];
  }

  // 动态 — real `projects.activity.list`, newest first.
  let activities: ProjectOverviewViewModel["activities"] = [];
  try {
    const list = (await client.listActivity({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<ProjectActivityDto>;
    activities = list
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((activity) => activityToRow(activity));
  } catch {
    activities = isFixtureProject ? fixtureVm.activities : [];
  }

  return {
    scenario: "default",
    kind: "project-overview",
    projectId: project.id,
    // 项目创意 / 当前阶段 — real `projects.get`.
    projectTitle: project.title,
    stage: project.currentStage,
    progressPct: project.progressPct,
    projectInfo: buildProjectInfo(project),
    outputs,
    activities,
    // No per-stage status read op on the frozen surface → fixture content for
    // demo projects, every stage pending for real projects.
    stages: isFixtureProject
      ? fixtureVm.stages
      : STAGE_ORDER.map((stage) => ({
          stage,
          status: "pending" as const,
          progressPct: 0,
        })),
    // No asset / file / publishing / milestones read op on the frozen surface →
    // fixture content for demo projects, EMPTY for real projects so the cards
    // render their empty states instead of fake data.
    assetStats: isFixtureProject ? fixtureVm.assetStats : [],
    recentFiles: isFixtureProject ? fixtureVm.recentFiles : [],
    publishing: isFixtureProject ? fixtureVm.publishing : [],
    milestones: isFixtureProject ? fixtureVm.milestones : [],
    loading: false,
    error: null,
  };
}

function buildProjectInfo(
  project: ProjectDto,
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
  activity: ProjectActivityDto,
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
