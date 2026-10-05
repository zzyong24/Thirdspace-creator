import "server-only";
import { readCachedPageValue } from "@/lib/page-read-cache.server";

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
  /** 仅展示投影使用；日历与时区每次读取。 */
  readRevision?: () => Promise<string>;
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
  kuaishou: "快手",
  xiaohongshu: "小红书",
  wechatOfficial: "公众号",
  wechatVideo: "视频号",
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
  dailyPlayTrend: PublishingCenterViewModel["trend"],
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
  for (const row of measured) {
    playsByPlatform.set(
      row.platform,
      (playsByPlatform.get(row.platform) ?? 0) + row.snapshot.plays,
    );
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
    // 历史趋势必须来自 append-only metric_snapshots 的逐日查询；最新快照集合只负责
    // 当前总量/榜单。若拿 latest-per-publication 再按日分组，每轮采集都会把前一天从
    // 查询结果中替掉，曲线将永久退化成单点。
    trend: dailyPlayTrend,
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

function createDateFormatter(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return (instant: string): string => {
    const parts = formatter.formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  };
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
  const accountId = ctx.accountId ?? null;
  if (!ctx.groupId && !accountId) {
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

  const dateInTimezone = createDateFormatter(calendarContext?.effectiveTimezone ?? "UTC");
  const month =
    monthParam && MONTH_PATTERN.test(monthParam)
      ? monthParam
      : (calendarContext?.today.slice(0, 7) ?? "1970-01");
  const window = {
    from: `${month}-01T00:00:00.000Z`,
    to: `${nextMonth(month)}-01T00:00:00.000Z`,
  };

  const calendarEntriesPromise = calendarContext
    ? (ctx.groupId
        ? deps.calendar.listGroupCalendar(ctx, ctx.groupId, window, { limit:500,offset:0 })
        : deps.calendar.listCalendar(ctx, accountId!, window, {limit:500,offset:0}))
        .then((page) => page.rows)
    : Promise.reject(contextError ?? new Error("日历上下文不可用"));

  let sharedProjects:Array<{id:string;title:string;schedulable?:boolean}>|null=null;
  const readPerformance = async () => {
    const creativeContext = ctx.groupId ? {...ctx,accountId:null,membershipVersion:undefined} : ctx;
    const projects = (await deps.projects.listProjectsForComposition(creativeContext)).map(({id,title,status,source,currentStage})=>({id,title,schedulable:status!=="archived"&&status!=="completed"&&source!=="imported"&&currentStage!=="review"}));
    sharedProjects=projects;
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const outputs = await deps.projects.listOutputRefsByProjects(
      creativeContext,
      projects.map((project) => project.id),
    );
    const outputById = new Map(outputs.map((output) => [output.outputId, output]));
    const publications = await deps.publishing.listPublicationsByOutputIds(
      ctx,
      outputs.map((output) => output.outputId),
    );
    const publicationIds = publications.map((publication) => publication.id);
    const [revisionResult, snapshotResult, dailyTrendResult] = await Promise.allSettled([
      deps.publishing.listCurrentRevisionSummariesByPublicationIds(
        ctx,
        publicationIds,
      ),
      deps.analytics.listLatestSnapshotsByPublicationIds(
        ctx,
        publicationIds,
      ),
      deps.analytics.getDailyPlayTrend(ctx, {
        publicationIds,
        days: 7,
      }),
    ]);
    const revisions =
      revisionResult.status === "fulfilled" ? revisionResult.value : [];
    const snapshots =
      snapshotResult.status === "fulfilled" ? snapshotResult.value : [];
    const dailyPlayTrend =
      dailyTrendResult.status === "fulfilled"
        ? dailyTrendResult.value.map((point) => ({
            label: point.day,
            value: point.plays,
          }))
        : [];
    const projectionError =
      revisionResult.status === "rejected"
        ? revisionResult.reason
        : snapshotResult.status === "rejected"
          ? snapshotResult.reason
          : dailyTrendResult.status === "rejected"
            ? dailyTrendResult.reason
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
      const rawMetrics = snapshotByPublication.get(publication.id)?.rawMetrics;
      const raw = rawMetrics && typeof rawMetrics === "object" ? rawMetrics as Record<string, unknown> : {};
      const measuredValue = (keys: string[]): number | null => {
        for (const key of keys) { const value = raw[key]; if (typeof value === "number" && Number.isFinite(value)) return value; }
        return null;
      };
      const article = publication.platform === "wechatOfficial";
      const metricValue = measuredValue(article ? ["reads", "read_count", "views"] : ["views", "plays"]);
      const bareTitle =
        revision?.title.trim() || output.title || platformLabel(publication.platform);
      const title = bareTitle;
      rows.push({
        id: publication.id,
        accountId: publication.accountId ?? null,
        accountName: publication.accountReference ?? undefined,
        revisionId: publication.currentRevisionId,
        capturedAt: snapshot?.capturedAt ?? null,
        dateKind: publication.publishedAt ? "published" : publication.scheduledAt ? "scheduled" : "created",
        metricKind: article ? "reads" : "views",
        metricValue,
        likes: measuredValue(["likes"]),
        comments: measuredValue(["comments"]),
        shares: measuredValue(["shares"]),
        contentTitle: title,
        projectId: project.id,
        projectTitle: project.title,
        contentType: mapContentType(output.contentType),
        platform: publication.platform,
        platformLabel: platformLabel(publication.platform),
        publishedAt: when,
        publishedAtLabel: calendarContext
          ? dateInTimezone(when)
          : when.slice(0, 10),
        status,
        statusLabel: ({failed:"发布失败",publishing:"发布中",scheduling:"排期中"} as Record<string,string>)[publication.status] ?? STATUS_LABELS[status],
        hidden: publication.hiddenAt !== null,
        views: ctx.groupId ? metricValue === null ? "—" : `${formatCount(metricValue)} ${article ? "阅读" : "播放"}` : performance.views,
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
    const rail = buildRailFromSnapshots(railInputs, dailyPlayTrend);
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
  };
  const performancePromise = deps.readRevision && calendarContext
    ? readCachedPageValue({
        ctx,
        key: ["projection", "publishing-performance", calendarContext.effectiveTimezone, calendarContext.today],
        readRevision: deps.readRevision,
        read: readPerformance,
        isCacheable: value => !value.projectionError,
        maxAgeMs: 30_000,
      })
    : readPerformance();

  const [calendarResult, performanceResult, cadenceResult] = await Promise.allSettled([
    calendarEntriesPromise,
    performancePromise,
    ctx.groupId ? deps.calendar.getGroupCadence({...ctx,accountId:null,membershipVersion:undefined},ctx.groupId) : Promise.resolve(null),
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
    (performanceResult.status === "rejected" && !(ctx.groupId && sharedProjects))
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

  const publishedRows = (performanceResult.status === "fulfilled" ? performanceResult.value.rows : []).filter(
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
        groupId:ctx.groupId??null,
        accounts: [],
        month,
        referenceDateKey: calendarContext.today,
        publications: publishedRows
          .filter(
            (row) =>
              dateInTimezone(row.publishedAt).slice(0, 7) === month,
          )
          .map((row) => ({
            id: row.id,
            dateKey: dateInTimezone(row.publishedAt),
            title: row.contentTitle,
            projectId: row.projectId ?? null,
            platformLabel: row.platformLabel,
            views: row.views,
            coverAssetId: row.coverAssetId ?? null,
          })),
        entries,
        projects: (performanceResult.status === "fulfilled" ? performanceResult.value.projects : (sharedProjects??[])).map((project) => ({
          id: project.id,
          title: project.title,
          schedulable:project.schedulable,
        })),
        publicationsUnavailable:performanceResult.status === "rejected",
        cadence: cadenceResult.status === "fulfilled" ? cadenceResult.value : null,
        cadenceUnavailable:cadenceResult.status === "rejected",
        attainment: null,
        window,
      },
    },
    performance,
  };
}
