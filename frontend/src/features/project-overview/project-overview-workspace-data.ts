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

// `projects.stages.list` rows — per-stage progress for the 6-stage pipeline.
interface ProjectStageDto {
  readonly stage: StageName;
  readonly status: ProjectOverviewViewModel["stages"][number]["status"];
  readonly progressPct: number;
}

// `materialLinks.list` rows — the project↔library edges (用料链, Plan A4).
interface MaterialLinkDto {
  readonly id: string;
  readonly entityType: "knowledge" | "asset";
  readonly entityId: string;
  readonly role: string;
  readonly stage: string;
  readonly createdAt: string;
}

// `assets.get` resource — we only read the display fields.
interface AssetDto {
  readonly id: string;
  readonly assetType: "image" | "video" | "audio" | "document" | "subtitle";
  readonly name: string;
  readonly updatedAt: string;
}

// `outputs.publications.list` rows — a 一稿多平台 publication per platform.
interface PublicationDto {
  readonly id: string;
  readonly platform: string;
  readonly status: string;
  readonly publishedAt: string | null;
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
  listStages(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listActivity(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listMaterialLinks(input: {
    params: undefined;
    query: { projectId: string; page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getAsset(input: {
    params: { assetId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listPublications(input: {
    params: { outputId: string };
    query: { page: number; pageSize: number };
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

  // Demo / canonical projects keep their curated fixture rollups untouched
  // (spec: "demo 项目行为不变"). Only REAL projects fan out to the live read ops
  // below, so the rest of this function early-returns the fixture content for
  // them.
  if (isFixtureProject) {
    return {
      scenario: "default",
      kind: "project-overview",
      projectId: project.id,
      projectTitle: project.title,
      stage: project.currentStage,
      progressPct: project.progressPct,
      projectInfo: buildProjectInfo(project),
      outputs,
      activities,
      stages: fixtureVm.stages,
      assetStats: fixtureVm.assetStats,
      recentFiles: fixtureVm.recentFiles,
      publishing: fixtureVm.publishing,
      milestones: fixtureVm.milestones,
      loading: false,
      error: null,
    };
  }

  // ---- REAL project from here: every section degrades to EMPTY on failure ----

  // 阶段 stepper — real `projects.stages.list` (per-stage status/progress from the
  // project_stages table), ordered onto the canonical STAGE_ORDER. Falls back to
  // the `currentStage` + `progressPct` derivation if the read fails or returns no
  // rows (a project seeded before the stage rows existed).
  let stages: ProjectOverviewViewModel["stages"];
  try {
    const list = (await client.listStages({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<ProjectStageDto>;
    stages =
      list.length > 0
        ? orderStages(list, project.currentStage, project.progressPct)
        : buildStages(project.currentStage, project.progressPct);
  } catch {
    stages = buildStages(project.currentStage, project.progressPct);
  }

  // 资产概览 + 最近文件 — both derive from `materialLinks.list` (用料链). Fetch
  // once; the asset rows additionally fan out to `assets.get` for display fields.
  let assetStats: ProjectOverviewViewModel["assetStats"] = [];
  let recentFiles: ProjectOverviewViewModel["recentFiles"] = [];
  try {
    const links = (await client.listMaterialLinks({
      params: undefined,
      query: { projectId, page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<MaterialLinkDto>;

    // 资产概览: real, derivable counts (素材/知识 from links, 产出/已发布 from
    // outputs + publishing). A zero count is an honest "0", not fake data.
    const assetLinks = links.filter((l) => l.entityType === "asset");
    const knowledgeCount = links.filter(
      (l) => l.entityType === "knowledge",
    ).length;

    // 最近文件: the project's linked ASSET items, resolved via `assets.get` for
    // name/type/updatedAt, newest first, capped at a small N.
    const assets = await Promise.all(
      assetLinks.map(async (link) => {
        try {
          return (await client.getAsset({
            params: { assetId: link.entityId },
            query: undefined,
            body: undefined,
          })) as AssetDto;
        } catch {
          return null;
        }
      }),
    );
    const resolvedAssets = assets.filter((a): a is AssetDto => a !== null);
    recentFiles = resolvedAssets
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: assetTypeLabel(asset.assetType),
        fileKind: assetFileKind(asset.assetType),
        updatedAt: asset.updatedAt,
      }));

    assetStats = buildAssetStats({
      assetCount: assetLinks.length,
      knowledgeCount,
      outputCount: outputs.length,
      // `publishedCount` is computed below from `publishing`; fill after.
      publishedCount: 0,
      activityCount: activities.length,
    });
  } catch {
    // Material-links read failed — empty so the cards render their empty states.
    assetStats = [];
    recentFiles = [];
  }

  // 发布状态 — fan out from outputs to `outputs.publications.list`. One row per
  // (output, platform) publication; newest publish first.
  let publishing: ProjectOverviewViewModel["publishing"] = [];
  try {
    const perOutput = await Promise.all(
      outputs.map(async (output) => {
        try {
          return (await client.listPublications({
            params: { outputId: output.id },
            query: { page: 1, pageSize: 50 },
            body: undefined,
          })) as ReadonlyArray<PublicationDto>;
        } catch {
          return [] as ReadonlyArray<PublicationDto>;
        }
      }),
    );
    const rows = perOutput
      .flat()
      .map((pub) => ({
        id: pub.id,
        platform: normalizePlatform(pub.platform),
        status: mapPublicationStatus(pub.status),
        publishedAt: pub.publishedAt,
      }))
      .sort((a, b) =>
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
      );
    publishing = rows;
  } catch {
    publishing = [];
  }

  // Back-fill the 已发布 stat now that publishing is known.
  if (assetStats.length > 0) {
    const publishedCount = publishing.filter(
      (p) => p.status === "published",
    ).length;
    assetStats = assetStats.map((stat) =>
      stat.id === "stat-published"
        ? { ...stat, value: String(publishedCount) }
        : stat,
    );
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
    // 阶段 stepper — real `projects.stages.list` (degrades to the derivation).
    stages,
    assetStats,
    recentFiles,
    publishing,
    // 里程碑 has no producer / read op — real projects show the card's empty
    // state ("里程碑将随阶段推进自动生成").
    milestones: [],
    loading: false,
    error: null,
  };
}

/**
 * Derive per-stage status from the project's `currentStage` + `progressPct`.
 * No per-stage read op exists on the frozen surface, so we project the single
 * pointer onto the canonical STAGE_ORDER: stages before current are `completed`
 * (100%), the current stage is `in_progress` carrying the real `progressPct`,
 * and stages after current are `pending` (0%). The current stage always exists,
 * so a real project is never "all pending" again.
 */
function buildStages(
  currentStage: StageName,
  progressPct: number,
): ProjectOverviewViewModel["stages"] {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  return STAGE_ORDER.map((stage, index) => {
    if (currentIndex < 0) {
      return { stage, status: "pending" as const, progressPct: 0 };
    }
    if (index < currentIndex) {
      return { stage, status: "completed" as const, progressPct: 100 };
    }
    if (index === currentIndex) {
      return {
        stage,
        status: "in_progress" as const,
        progressPct,
      };
    }
    return { stage, status: "pending" as const, progressPct: 0 };
  });
}

/**
 * Project the REAL `projects.stages.list` rows onto the canonical STAGE_ORDER so
 * the stepper always renders all six stages in order. A stage with no row falls
 * back to the `currentStage` + `progressPct` derivation for that single slot, so
 * a partially-seeded project never drops a stage.
 */
function orderStages(
  rows: ReadonlyArray<ProjectStageDto>,
  currentStage: StageName,
  progressPct: number,
): ProjectOverviewViewModel["stages"] {
  const byStage = new Map(rows.map((r) => [r.stage, r]));
  const derived = buildStages(currentStage, progressPct);
  return STAGE_ORDER.map((stage, index) => {
    const row = byStage.get(stage);
    if (!row) return derived[index]!;
    return { stage, status: row.status, progressPct: row.progressPct };
  });
}

/**
 * Build the 5-stat 资产概览 from derivable real counts (D-OVW-a: fill the four
 * derivable slots — 素材/知识/产出/已发布 — and use 动态 count for the fifth so
 * no slot is faked). `stat-published` is back-filled after publishing resolves.
 */
function buildAssetStats(counts: {
  assetCount: number;
  knowledgeCount: number;
  outputCount: number;
  publishedCount: number;
  activityCount: number;
}): ProjectOverviewViewModel["assetStats"] {
  const stat = (
    id: string,
    label: string,
    value: number,
  ): ProjectOverviewViewModel["assetStats"][number] => ({
    id,
    label,
    value: String(value),
    delta: "",
    trend: "flat",
    tone: "neutral",
  });
  return [
    stat("stat-assets", "关联素材", counts.assetCount),
    stat("stat-knowledge", "关联知识", counts.knowledgeCount),
    stat("stat-outputs", "产出", counts.outputCount),
    stat("stat-published", "已发布", counts.publishedCount),
    stat("stat-activity", "动态", counts.activityCount),
  ];
}

function assetTypeLabel(assetType: AssetDto["assetType"]): string {
  const labels: Readonly<Record<AssetDto["assetType"], string>> = {
    image: "图片",
    video: "视频",
    audio: "音频",
    document: "文档",
    subtitle: "字幕",
  };
  return labels[assetType] ?? assetType;
}

function assetFileKind(
  assetType: AssetDto["assetType"],
): ProjectOverviewViewModel["recentFiles"][number]["fileKind"] {
  switch (assetType) {
    case "video":
      return "shot";
    case "document":
    case "subtitle":
      return "document";
    default:
      return "data";
  }
}

const KNOWN_PLATFORMS: ReadonlyArray<ProjectOverviewViewModel["publishing"][number]["platform"]> =
  ["youtube", "bilibili", "douyin", "xiaohongshu", "wechatVideo", "x"];

function normalizePlatform(
  platform: string,
): ProjectOverviewViewModel["publishing"][number]["platform"] {
  return (
    KNOWN_PLATFORMS.find((p) => p === platform) ?? "douyin"
  );
}

function mapPublicationStatus(
  status: string,
): ProjectOverviewViewModel["publishing"][number]["status"] {
  switch (status) {
    case "published":
    case "scheduled":
    case "draft":
    case "removed":
    case "failed":
      return status;
    default:
      return "draft";
  }
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
