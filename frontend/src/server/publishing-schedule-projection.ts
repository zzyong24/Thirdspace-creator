import "server-only";

import type { RequestContext } from "@creatoros/contract";
import type {
  ContentCalendarEntryResource,
  ContentCalendarService,
} from "@creatoros/backend/modules/content-calendar";
import type { ProjectsService } from "@creatoros/backend/modules/projects";
import type { PublishingService } from "@creatoros/backend/modules/publishing";
import type { AnalyticsService } from "@creatoros/backend/modules/analytics";
import type { ContentCalendarViewModel } from "@/features/content-calendar/content-calendar-page";
import type {
  PublicationRow,
  PublishingCenterViewModel,
} from "@/features/publishing-center/publishing-center-page";

export interface PublishingScheduleProjection {
  calendar:
    | { state: "ready"; viewModel: ContentCalendarViewModel; error: null }
    | { state: "error"; viewModel: null; error: Error };
  performance: PublishingCenterViewModel;
}

export interface PublishingScheduleProjectionDeps {
  calendar: ContentCalendarService;
  projects: ProjectsService;
  publishing: PublishingService;
  analytics: AnalyticsService;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
interface LatestSnapshot {
  plays: number;
  interactions: number;
  capturedAt: string;
}
interface RailInput {
  publicationId: string;
  platform: string;
  title: string;
  status: PublicationRow["status"];
  snapshot: LatestSnapshot | null;
  coverAssetId: string | null;
}
const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  bilibili: "哔哩哔哩",
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechatVideo: "微信视频号",
  x: "X",
};
const STATUS_LABELS: Record<PublicationRow["status"], string> = {
  published: "已发布",
  scheduled: "排期中",
  draft: "草稿",
  removed: "已下架",
};
const CONTENT_TABS = [
  { id: "all", label: "全部" },
  { id: "video", label: "视频" },
  { id: "image", label: "图文" },
  { id: "audio", label: "音频" },
] as const;

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

function mapStatus(status: string): PublicationRow["status"] {
  if (
    status === "published" ||
    status === "scheduled" ||
    status === "draft" ||
    status === "removed"
  ) {
    return status;
  }
  return status === "scheduling" || status === "publishing"
    ? "scheduled"
    : "draft";
}

function mapContentType(
  contentType: string,
): PublicationRow["contentType"] {
  if (
    contentType === "image" ||
    contentType === "imageText" ||
    contentType === "article"
  ) {
    return "image";
  }
  return contentType === "audio" || contentType === "podcast"
    ? "audio"
    : "video";
}

function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  }
  return value.toLocaleString("zh-CN");
}

function formatPerformance(snapshot: LatestSnapshot | null): {
  views: string;
  engagementLabel: string;
  engagementTone: "positive" | "neutral" | "warning";
} {
  if (!snapshot) {
    return {
      views: "暂无数据",
      engagementLabel: "暂无数据",
      engagementTone: "neutral",
    };
  }
  const rate =
    snapshot.plays > 0 ? snapshot.interactions / snapshot.plays : 0;
  return {
    views: `${formatCount(snapshot.plays)} 播放`,
    engagementLabel:
      snapshot.interactions > 0
        ? `${formatCount(snapshot.interactions)} 互动 · ${(rate * 100).toFixed(1)}%`
        : "0 互动",
    engagementTone:
      rate >= 0.06 ? "positive" : rate >= 0.02 ? "neutral" : "warning",
  };
}

function buildRailFromSnapshots(
  rows: ReadonlyArray<RailInput>,
): Pick<
  PublishingCenterViewModel,
  "metrics" | "platformComparison" | "trend" | "topContent"
> {
  const measured = rows.filter(
    (row): row is RailInput & { snapshot: LatestSnapshot } =>
      row.snapshot !== null,
  );
  const totalPlays = measured.reduce(
    (sum, row) => sum + row.snapshot.plays,
    0,
  );
  const totalInteractions = measured.reduce(
    (sum, row) => sum + row.snapshot.interactions,
    0,
  );
  const metrics: PublishingCenterViewModel["metrics"] = [
    {
      id: "pubc-total-plays",
      label: "总播放",
      value: measured.length ? formatCount(totalPlays) : "—",
      delta: "",
      trend: "flat",
      tone: "info",
    },
    {
      id: "pubc-total-interactions",
      label: "总互动",
      value: measured.length ? formatCount(totalInteractions) : "—",
      delta: "",
      trend: "flat",
      tone: "info",
    },
    {
      id: "pubc-average-engagement",
      label: "平均互动率",
      value: measured.length
        ? `${(totalPlays > 0 ? (totalInteractions / totalPlays) * 100 : 0).toFixed(1)}%`
        : "—",
      delta: "",
      trend: "flat",
      tone: "neutral",
    },
    {
      id: "pubc-published-count",
      label: "已发布",
      value: String(rows.filter((row) => row.status === "published").length),
      delta: "",
      trend: "flat",
      tone: "neutral",
    },
  ];
  const playsByPlatform = new Map<string, number>();
  const playsByDay = new Map<string, number>();
  for (const row of measured) {
    playsByPlatform.set(
      row.platform,
      (playsByPlatform.get(row.platform) ?? 0) + row.snapshot.plays,
    );
    const day = row.snapshot.capturedAt.slice(0, 10);
    playsByDay.set(day, (playsByDay.get(day) ?? 0) + row.snapshot.plays);
  }
  return {
    metrics,
    platformComparison: [...playsByPlatform]
      .sort((a, b) => b[1] - a[1])
      .map(([platform, plays]) => ({
        platform,
        platformLabel: platformLabel(platform),
        share: plays,
        views: formatCount(plays),
      })),
    trend: [...playsByDay]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value })),
    topContent: measured
      .slice()
      .sort(
        (a, b) =>
          b.snapshot.plays - a.snapshot.plays ||
          a.publicationId.localeCompare(b.publicationId),
      )
      .slice(0, 5)
      .map((row) => ({
        id: row.publicationId,
        title: row.title,
        platform: row.platform,
        platformLabel: platformLabel(row.platform),
        coverAssetId: row.coverAssetId,
        views: formatCount(row.snapshot.plays),
        engagement: formatCount(row.snapshot.interactions),
      })),
  };
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  const value = new Date(Date.UTC(year, index, 1));
  return value.toISOString().slice(0, 7);
}

function dateInTimezone(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function num(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function latestSnapshot(
  row:
    | {
        capturedAt: string;
        rawMetrics: unknown;
      }
    | undefined,
): LatestSnapshot | null {
  if (!row) return null;
  const raw =
    row.rawMetrics && typeof row.rawMetrics === "object"
      ? (row.rawMetrics as Record<string, unknown>)
      : {};
  return {
    plays: num(raw, "views") || num(raw, "plays"),
    interactions:
      num(raw, "likes") +
      num(raw, "comments") +
      num(raw, "shares") +
      num(raw, "favorites"),
    capturedAt: row.capturedAt,
  };
}

function errorPerformance(message: string): PublishingCenterViewModel {
  return {
    scenario: "error",
    kind: "publishing-center",
    loading: false,
    error: { code: "publishing_projection_failed", message },
    contentTypeTabs: [],
    publications: [],
    metrics: [],
    platformComparison: [],
    trend: [],
    topContent: [],
    pagination: { currentPage: 1, totalPages: 1 },
  };
}

/**
 * T-599 发布中心服务端批量投影。项目、outputs、publications、revisions、
 * analytics 各至多一次调用；不会随行数产生 N+1。
 */
export async function buildPublishingScheduleProjection(
  deps: PublishingScheduleProjectionDeps,
  ctx: RequestContext,
  monthParam?: string,
): Promise<PublishingScheduleProjection> {
  const accountId = ctx.accountId;
  if (!accountId) {
    throw new Error("AccountRequiredError: publishing schedule requires account");
  }

  let calendarContext: Awaited<
    ReturnType<ContentCalendarService["getCalendarRequestContext"]>
  > | null = null;
  let contextError: Error | null = null;
  try {
    calendarContext = await deps.calendar.getCalendarRequestContext(ctx);
  } catch (error) {
    contextError = error instanceof Error ? error : new Error("读取日历上下文失败");
  }

  const month =
    monthParam && MONTH_PATTERN.test(monthParam)
      ? monthParam
      : (calendarContext?.today.slice(0, 7) ?? "1970-01");
  const window = {
    from: `${month}-01T00:00:00.000Z`,
    to: `${nextMonth(month)}-01T00:00:00.000Z`,
  };

  const calendarEntriesPromise = calendarContext
    ? deps.calendar
        .listCalendar(ctx, accountId, window, { limit: 500, offset: 0 })
        .then((page) => page.rows)
    : Promise.reject(contextError ?? new Error("日历上下文不可用"));

  const performancePromise = (async () => {
    const projects = await deps.projects.listProjectsForComposition(ctx);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const outputs = await deps.projects.listOutputRefsByProjects(
      ctx,
      projects.map((project) => project.id),
    );
    const outputById = new Map(outputs.map((output) => [output.outputId, output]));
    const publications = await deps.publishing.listPublicationsByOutputIds(
      ctx,
      outputs.map((output) => output.outputId),
    );
    const [revisionResult, snapshotResult] = await Promise.allSettled([
      deps.publishing.listCurrentRevisionSummariesByPublicationIds(
        ctx,
        publications.map((publication) => publication.id),
      ),
      deps.analytics.listLatestSnapshotsByPublicationIds(
        ctx,
        publications.map((publication) => publication.id),
      ),
    ]);
    const revisions =
      revisionResult.status === "fulfilled" ? revisionResult.value : [];
    const snapshots =
      snapshotResult.status === "fulfilled" ? snapshotResult.value : [];
    const projectionError =
      revisionResult.status === "rejected"
        ? revisionResult.reason
        : snapshotResult.status === "rejected"
          ? snapshotResult.reason
          : null;
    const revisionByPublication = new Map(
      revisions.map((revision) => [revision.publicationId, revision]),
    );
    const snapshotByPublication = new Map(
      snapshots.map((snapshot) => [snapshot.publicationId, snapshot]),
    );

    const rows: PublicationRow[] = [];
    const railInputs: RailInput[] = [];
    for (const publication of publications) {
      const output = outputById.get(publication.contentOutputId);
      if (!output) continue;
      const project = projectById.get(output.projectId);
      if (!project) continue;
      const revision = revisionByPublication.get(publication.id);
      const status = mapStatus(publication.status);
      const when =
        publication.publishedAt ??
        publication.scheduledAt ??
        publication.createdAt;
      const snapshot = latestSnapshot(
        snapshotByPublication.get(publication.id),
      );
      const performance = formatPerformance(snapshot);
      const bareTitle =
        revision?.title.trim() || output.title || platformLabel(publication.platform);
      const title = `${bareTitle} · ${platformLabel(publication.platform)}`;
      rows.push({
        id: publication.id,
        contentTitle: title,
        projectId: project.id,
        projectTitle: project.title,
        contentType: mapContentType(output.contentType),
        platform: publication.platform,
        platformLabel: platformLabel(publication.platform),
        publishedAt: when,
        publishedAtLabel: calendarContext
          ? dateInTimezone(when, calendarContext.effectiveTimezone)
          : when.slice(0, 10),
        status,
        statusLabel: STATUS_LABELS[status],
        hidden: publication.hiddenAt !== null,
        views: performance.views,
        engagementLabel: performance.engagementLabel,
        engagementTone: performance.engagementTone,
        thumbnailToken: `pub-${publication.id}`,
        coverAssetId: revision?.coverAssetId ?? null,
      });
      railInputs.push({
        publicationId: publication.id,
        platform: publication.platform,
        title: bareTitle,
        status,
        snapshot,
        coverAssetId: revision?.coverAssetId ?? null,
      });
    }
    rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const rail = buildRailFromSnapshots(railInputs);
    return {
      projects,
      rows,
      rail,
      projectionError,
      contentTypeTabs: CONTENT_TABS.map((tab) => ({
        ...tab,
        count:
          tab.id === "all"
            ? rows.length
            : rows.filter((row) => row.contentType === tab.id).length,
      })),
    };
  })();

  const [calendarResult, performanceResult] = await Promise.allSettled([
    calendarEntriesPromise,
    performancePromise,
  ]);

  const performance =
    performanceResult.status === "fulfilled"
      ? performanceResult.value.projectionError
        ? errorPerformance(
            performanceResult.value.projectionError instanceof Error
              ? performanceResult.value.projectionError.message
              : "发布表现暂时不可用",
          )
        : ({
          scenario: "default",
          kind: "publishing-center",
          loading: false,
          error: null,
          contentTypeTabs: performanceResult.value.contentTypeTabs,
          publications: performanceResult.value.rows,
          metrics: performanceResult.value.rail.metrics,
          platformComparison: performanceResult.value.rail.platformComparison,
          trend: performanceResult.value.rail.trend,
          topContent: performanceResult.value.rail.topContent,
          pagination: { currentPage: 1, totalPages: 1 },
          } satisfies PublishingCenterViewModel)
      : errorPerformance(
          performanceResult.reason instanceof Error
            ? performanceResult.reason.message
            : "发布表现暂时不可用",
        );

  if (
    !calendarContext ||
    calendarResult.status === "rejected" ||
    performanceResult.status === "rejected"
  ) {
    const reason =
      calendarResult.status === "rejected"
        ? calendarResult.reason
        : performanceResult.status === "rejected"
          ? performanceResult.reason
          : contextError;
    return {
      calendar: {
        state: "error",
        viewModel: null,
        error:
          reason instanceof Error
            ? reason
            : new Error("内容日历暂时不可用"),
      },
      performance,
    };
  }

  const publishedRows = performanceResult.value.rows.filter(
    (row) =>
      Boolean(row.publishedAt) &&
      row.publishedAt.slice(0, 7) !== "" &&
      row.status !== "draft" &&
      row.status !== "scheduled",
  );
  const entries = calendarResult.value as ContentCalendarEntryResource[];
  return {
    calendar: {
      state: "ready",
      error: null,
      viewModel: {
        accountId,
        accounts: [],
        month,
        referenceDateKey: calendarContext.today,
        publications: publishedRows
          .filter(
            (row) =>
              dateInTimezone(
                row.publishedAt,
                calendarContext.effectiveTimezone,
              ).slice(0, 7) === month,
          )
          .map((row) => ({
            id: row.id,
            dateKey: dateInTimezone(
              row.publishedAt,
              calendarContext.effectiveTimezone,
            ),
            title: row.contentTitle.replace(
              new RegExp(` · ${platformLabel(row.platform)}$`),
              "",
            ),
            projectId: row.projectId ?? null,
            platformLabel: row.platformLabel,
            views: row.views,
            coverAssetId: row.coverAssetId ?? null,
          })),
        entries,
        projects: performanceResult.value.projects.map((project) => ({
          id: project.id,
          title: project.title,
        })),
        cadence: null,
        attainment: null,
        window,
      },
    },
    performance,
  };
}
