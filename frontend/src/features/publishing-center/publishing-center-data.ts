import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildPublishingCenterViewModel } from "@/fixtures/selectors";
import type { MetricCard as MetricCardVm } from "@/types/view-models";
import type {
  PlatformShare,
  PublicationContentType,
  PublicationRow,
  PublishingCenterViewModel,
  TopContentRow,
} from "./publishing-center-page";

/**
 * Publishing Center READ-side data assembly ("发布中心读侧做真").
 *
 * Assembles the REAL publication table by aggregating every user project's
 * publications:
 *   - `projects.list`             → the user's projects,
 *   - `projects.outputs.list`     → each project's ContentOutputs,
 *   - `outputs.publications.list` → each output's REAL publications (a 一稿多平台
 *                                   adapt run creates one publication node per
 *                                   target platform — they all surface here).
 *
 * The REAL publication list drives the `PublicationTable` rows (内容标题 / 项目 /
 * 平台 / 发布时间 / 状态 / 表现). The analytics rail (PublishingMetrics /
 * PlatformComparisonChart / TrendChart / TopContentList) is aggregated REAL
 * too: every publication's latest analytics snapshot
 * (`analytics.publications.get` → `rawMetrics`) is collected ONCE while
 * building each row, then horizontally aggregated by `buildRailFromSnapshots`
 * (总播放 / 总互动 / 平台对比 / 按 capturedAt 日序的趋势 / 播放量 top N) — a pure,
 * deterministic fold (no `Date.now` / `Math.random`). A publication with no
 * snapshot contributes nothing to the rail and renders a neutral "暂无数据" 表现
 * cell rather than a fabricated number.
 *
 * Honest empty state (no more fixture masking):
 *   - per-output: a failed publications read for one output contributes no rows,
 *   - per-pub rail: a failed/empty snapshot read drops that pub from the rail
 *     aggregation but never throws,
 *   - wholesale: if the projects read throws, the WHOLE VM falls back to the
 *     fixture builder (the only remaining fallback — an outright read failure,
 *     not an empty result),
 *   - empty: zero real publications → an HONEST empty VM (publications:[] + an
 *     empty rail), so the page renders its 空态 instead of masking it with the
 *     fixture baseline.
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// Minimal structural DTOs — the contract client returns parsed resources; we
// only read the fields we map, so a narrow shape keeps the helper decoupled.
interface ProjectDto {
  readonly id: string;
  readonly title: string;
}

interface ContentOutputDto {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly contentType: string;
}

interface PublicationDto {
  readonly id: string;
  readonly contentOutputId: string;
  readonly platform: string;
  readonly status: string;
  readonly currentRevisionId: string;
  readonly scheduledAt: string | null;
  readonly publishedAt: string | null;
  readonly removedAt: string | null;
  // [T-073] 平台侧可见性(非空 = 抖音端「仅自己可见/已隐藏」;列表默认过滤)。
  readonly hiddenAt: string | null;
  readonly createdAt: string;
}

interface PublicationRevisionDto {
  readonly id: string;
  readonly title: string;
  readonly revisionNumber: number;
  // [T-078] 作品封面(采集回填 / 用户手选);null = 无封面 → 渐变占位。
  readonly coverAssetId?: string | null;
}

interface MetricSnapshotDto {
  readonly id: string;
  readonly publicationId: string;
  readonly capturedAt: string;
  readonly rawMetrics: Record<string, unknown>;
}

export interface PublishingCenterDataClient {
  listProjects(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listPublications(input: {
    params: { outputId: string };
    // [T-033] hidden: ?hidden=1 全显(私密/未通过);undefined/0/false → 默认过滤。
    query: { page: number; pageSize: number; hidden?: boolean };
    body: undefined;
  }): Promise<unknown>;
  listPublicationRevisions(input: {
    params: { publicationId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getPublicationAnalytics(input: {
    params: { publicationId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
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
  // Publishing's own lifecycle statuses (e.g. "publishing"/"failed") collapse to
  // the nearest table bucket; an unknown value renders as a draft so the row is
  // honest about being not-yet-published rather than claiming "已发布".
  if (status === "scheduling") return "scheduled";
  if (status === "publishing") return "scheduled";
  return "draft";
}

function mapContentType(contentType: string): PublicationContentType {
  if (contentType === "image" || contentType === "imageText" || contentType === "article") {
    return "image";
  }
  if (contentType === "audio" || contentType === "podcast") {
    return "audio";
  }
  return "video";
}

function formatDate(iso: string): string {
  return iso.length < 10 ? iso : iso.slice(0, 10);
}

/**
 * Resolve a publication's REAL current-revision title (the 真标题 stored in
 * `publicationRevisions`) AND its cover ([T-078] coverAssetId — 采集回填/手选).
 * Reads the publication's revisions (newest-first), prefers the row matching
 * `currentRevisionId`, else the newest. A non-empty title wins; anything
 * missing/blank → `null` so the caller falls back to the owning output title
 * placeholder. Try/catch → nulls (never throws into the row build). N+1 over a
 * small publication set — acceptable this wave (one read feeds title + cover).
 */
async function resolveRevisionMeta(
  client: PublishingCenterDataClient,
  pub: PublicationDto,
): Promise<{ title: string | null; coverAssetId: string | null }> {
  try {
    const revisions = (await client.listPublicationRevisions({
      params: { publicationId: pub.id },
      query: { page: 1, pageSize: 20 },
      body: undefined,
    })) as ReadonlyArray<PublicationRevisionDto>;
    if (revisions.length === 0) return { title: null, coverAssetId: null };
    const current =
      revisions.find((r) => r.id === pub.currentRevisionId) ?? revisions[0];
    const title = current?.title?.trim();
    return {
      title: title ? title : null,
      coverAssetId: current?.coverAssetId ?? null,
    };
  } catch {
    return { title: null, coverAssetId: null };
  }
}

// 表现 cell formatting — Chinese 万 grouping for large counts.
function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return n.toLocaleString("zh-CN");
}
function numOf(raw: Record<string, unknown>, key: string): number {
  const v = raw[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * The latest analytics snapshot for one publication, normalized to the numbers
 * both the 表现 cell and the rail aggregation need. `null` when there is no
 * snapshot / the read fails — read ONCE per publication so the rail never
 * re-reads (no double N+1).
 */
interface LatestSnapshot {
  readonly plays: number;
  readonly interactions: number;
  /** ISO timestamp of the newest snapshot — drives the real day-series trend. */
  readonly capturedAt: string;
}

/**
 * Resolve a publication's latest analytics snapshot (`analytics.publications.get`
 * → metric snapshots; newest `rawMetrics`, the self-describing payload the seed
 * writes). Returns `null` when there is no snapshot / the read fails, so callers
 * keep the honest "暂无数据" cell and drop the pub from the rail aggregation
 * rather than fabricating numbers.
 */
async function resolveLatestSnapshot(
  client: PublishingCenterDataClient,
  publicationId: string,
): Promise<LatestSnapshot | null> {
  try {
    const snapshots = (await client.getPublicationAnalytics({
      params: { publicationId },
      query: { page: 1, pageSize: 20 },
      body: undefined,
    })) as ReadonlyArray<MetricSnapshotDto>;
    if (!snapshots || snapshots.length === 0) return null;
    const latest = snapshots
      .slice()
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]!;
    const raw = latest.rawMetrics ?? {};
    return {
      // [T-082] 键名归一:真采集(douyin-cdp ingestion)写 `views`,演示/fixture 写
      // `plays`。与 backend analytics.repository playsOf 同口径——优先 `views`,
      // 缺失再回退 `plays`,否则真数据全显 0。
      plays: numOf(raw, "views") || numOf(raw, "plays"),
      interactions:
        numOf(raw, "likes") +
        numOf(raw, "comments") +
        numOf(raw, "shares") +
        numOf(raw, "favorites"),
      capturedAt: latest.capturedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Format a publication's latest snapshot into the table's 表现 cell. `null`
 * snapshot → the honest "暂无数据" trio rather than a fabricated number.
 */
function formatPerformance(
  snapshot: LatestSnapshot | null,
): { views: string; engagementLabel: string; engagementTone: "positive" | "neutral" | "warning" } {
  if (!snapshot) {
    return { views: "暂无数据", engagementLabel: "暂无数据", engagementTone: "neutral" };
  }
  const { plays, interactions } = snapshot;
  const rate = plays > 0 ? interactions / plays : 0;
  // tone: ≥6% interaction rate is strong, ≥2% ok, below is weak (douyin heuristics)
  const tone = rate >= 0.06 ? "positive" : rate >= 0.02 ? "neutral" : "warning";
  return {
    views: `${formatCount(plays)} 播放`,
    engagementLabel:
      interactions > 0
        ? `${formatCount(interactions)} 互动 · ${(rate * 100).toFixed(1)}%`
        : "0 互动",
    engagementTone: tone,
  };
}

/**
 * Per-publication input to the analytics rail aggregation. Carries the fields
 * the rail folds over: 平台 (grouping), 标题 (top-content label), publication
 * status (已发布 count), and the latest snapshot (plays / interactions /
 * capturedAt). A pub with no snapshot has `snapshot: null` and contributes to
 * the 已发布 count but not to play/interaction/trend totals.
 */
interface RailInput {
  readonly publicationId: string;
  readonly platform: string;
  readonly title: string;
  readonly status: PublicationRow["status"];
  readonly snapshot: LatestSnapshot | null;
  // [T-082] 真封面透传:热门内容行复用 revision.coverAssetId(T-078 同款渲染链)。
  readonly coverAssetId: string | null;
}

interface AssembledRows {
  readonly rows: ReadonlyArray<PublicationRow>;
  readonly railInputs: ReadonlyArray<RailInput>;
}

/**
 * Build the REAL publication rows (and the rail aggregation inputs) by walking
 * projects → outputs → publications. Returns `null` (not an empty result) when
 * the projects read throws, so the caller can distinguish "read failed → fall
 * back wholesale" from "read ok, zero rows → honest empty".
 */
async function assembleRealRows(
  client: PublishingCenterDataClient,
  opts: { includeHidden?: boolean } = {},
): Promise<AssembledRows | null> {
  let projects: ReadonlyArray<ProjectDto>;
  try {
    projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 500 },
      body: undefined,
    })) as ReadonlyArray<ProjectDto>;
  } catch {
    return null;
  }
  // [T-050] demo 项目过滤集退役:demo 行已从 DB 物理删除,list 返回的全是真项目。
  const projectTitleById = new Map<string, string>();
  for (const project of projects) {
    projectTitleById.set(project.id, project.title);
  }

  // For each project, resolve its outputs (so we can title each publication and
  // attribute it to a project), then list each output's publications.
  const perProject = await Promise.all(
    projects.map(async (project) => {
      let outputs: ReadonlyArray<ContentOutputDto>;
      try {
        outputs = (await client.listOutputs({
          params: { projectId: project.id },
          query: undefined,
          body: undefined,
        })) as ReadonlyArray<ContentOutputDto>;
      } catch {
        return [] as ReadonlyArray<{ row: PublicationRow; railInput: RailInput }>;
      }

      const outputById = new Map<string, ContentOutputDto>();
      for (const output of outputs) outputById.set(output.id, output);

      const publicationLists = await Promise.all(
        outputs.map(async (output) => {
          try {
            // [T-033] 默认过滤 hidden + 未通过(opts.includeHidden 兜底是「全显」开关透传)。
            return (await client.listPublications({
              params: { outputId: output.id },
              query: {
                page: 1,
                pageSize: 50,
                hidden: opts.includeHidden ? true : undefined,
              },
              body: undefined,
            })) as ReadonlyArray<PublicationDto>;
          } catch {
            return [] as ReadonlyArray<PublicationDto>;
          }
        }),
      );

      return Promise.all(
        publicationLists.flat().map<Promise<{ row: PublicationRow; railInput: RailInput }>>(async (pub) => {
        const output = outputById.get(pub.contentOutputId);
        const status = mapStatus(pub.status);
        // 发布时间: prefer the real published timestamp, then the scheduled one,
        // then creation — so排期中 rows still show their scheduled date.
        const when = pub.publishedAt ?? pub.scheduledAt ?? pub.createdAt;
        // 内容标题: the publication's REAL current-revision title (the 真标题/文案
        // stored in publicationRevisions, read via publications.revisions.list).
        // Falls back to the owning output's title placeholder when the revision
        // read yields nothing (empty title / read fails). A platform suffix
        // disambiguates a 一稿多平台 fan-out where one output has N rows.
        const [revisionMeta, snapshot] = await Promise.all([
          resolveRevisionMeta(client, pub),
          // Read the publication's latest snapshot ONCE — it feeds both the
          // table 表现 cell and the rail aggregation, so no double N+1.
          resolveLatestSnapshot(client, pub.id),
        ]);
        const revisionTitle = revisionMeta.title;
        const performance = formatPerformance(snapshot);
        const fallbackTitle = output
          ? `${output.title} · ${platformLabel(pub.platform)}`
          : platformLabel(pub.platform);
        // 标题 (rail top-content) prefers the bare revision title (no platform
        // suffix); falls back to the output title, then the platform label.
        const railTitle = revisionTitle ?? output?.title ?? platformLabel(pub.platform);
        return {
          row: {
            id: pub.id,
            contentTitle: revisionTitle
              ? `${revisionTitle} · ${platformLabel(pub.platform)}`
              : fallbackTitle,
            projectId: project.id,
            projectTitle: projectTitleById.get(project.id) ?? project.id,
            contentType: mapContentType(output?.contentType ?? "video"),
            platform: pub.platform,
            platformLabel: platformLabel(pub.platform),
            publishedAt: when,
            publishedAtLabel: formatDate(when),
            status,
            statusLabel: STATUS_LABELS[status],
            // [T-073] 平台侧已隐藏:列表默认过滤,可切「显示已隐藏」(徽标标注)。
            hidden: pub.hiddenAt != null,
            // 表现: REAL play count + engagement from the publication's latest
            // analytics snapshot. No snapshot → the honest "暂无数据" cell.
            views: performance.views,
            engagementLabel: performance.engagementLabel,
            engagementTone: performance.engagementTone,
            thumbnailToken: `pub-${pub.id}`,
            // [T-078] 真封面(采集回填/手选的 revision.coverAssetId);null → 渐变占位。
            coverAssetId: revisionMeta.coverAssetId,
          },
          railInput: {
            publicationId: pub.id,
            platform: pub.platform,
            title: railTitle,
            status,
            snapshot,
            // [T-082] 封面随行透传到热门内容(此前收集了却在映射时丢弃)。
            coverAssetId: revisionMeta.coverAssetId,
          },
        };
        }),
      );
    }),
  );

  const assembled = perProject.flat();
  const rows = assembled
    .map((entry) => entry.row)
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const railInputs = assembled.map((entry) => entry.railInput);
  return { rows, railInputs };
}

// How many rows the 热门内容 rail block shows (D2: top-5).
const TOP_CONTENT_N = 5;

interface RailBlocks {
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly platformComparison: ReadonlyArray<PlatformShare>;
  readonly trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly topContent: ReadonlyArray<TopContentRow>;
}

// 互动率 percentage label, fixed to one decimal (deterministic).
function ratePct(interactions: number, plays: number): string {
  const rate = plays > 0 ? interactions / plays : 0;
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Aggregate the analytics rail (指标 / 平台对比 / 趋势 / 热门内容) from the REAL
 * per-publication snapshots collected while building the rows. PURE +
 * deterministic — a fold over `railInputs`, no `Date.now` / `Math.random` /
 * network — so SSR output is stable.
 *
 * Aggregation口径 (INTERACTION_SPEC GAP-PUBC-1):
 *   - metrics: 总播放 = Σplays; 总互动 = Σ(likes+comments+shares+favorites);
 *     平均互动率 = 总互动/总播放; 已发布数 = status==='published' 行数. delta 留空
 *     (no historical baseline → no fabricated trend). No-snapshot pubs show "—".
 *   - platformComparison: group by platform, Σplays per group, descending;
 *     `share` is the raw Σplays (the chart renders proportions from it).
 *   - trend: bucket Σplays by the snapshot `capturedAt` DATE (real day-series),
 *     ascending; no snapshots → empty array.
 *   - topContent: pubs with a snapshot, by plays descending, top N.
 *
 * An empty `railInputs` (or one with no snapshots) yields empty/`—` blocks so
 * the page renders honest 空态 instead of fabricating data.
 */
function buildRailFromSnapshots(railInputs: ReadonlyArray<RailInput>): RailBlocks {
  const withSnapshot = railInputs.filter(
    (r): r is RailInput & { snapshot: LatestSnapshot } => r.snapshot !== null,
  );
  const hasSnapshot = withSnapshot.length > 0;

  const totalPlays = withSnapshot.reduce((acc, r) => acc + r.snapshot.plays, 0);
  const totalInteractions = withSnapshot.reduce(
    (acc, r) => acc + r.snapshot.interactions,
    0,
  );
  const publishedCount = railInputs.filter((r) => r.status === "published").length;

  // 指标卡 — `—` when there is no snapshot to derive a real number from (D3:
  // distinguish "no data" from a real 0). delta stays "" (no baseline).
  const metrics: ReadonlyArray<MetricCardVm> = [
    {
      id: "pubc-total-plays",
      label: "总播放",
      value: hasSnapshot ? formatCount(totalPlays) : "—",
      delta: "",
      trend: "flat",
      tone: "info",
    },
    {
      id: "pubc-total-interactions",
      label: "总互动",
      value: hasSnapshot ? formatCount(totalInteractions) : "—",
      delta: "",
      trend: "flat",
      tone: "info",
    },
    {
      id: "pubc-avg-engagement",
      label: "平均互动率",
      value: hasSnapshot ? ratePct(totalInteractions, totalPlays) : "—",
      delta: "",
      trend: "flat",
      tone: "neutral",
    },
    {
      id: "pubc-published-count",
      label: "已发布",
      value: publishedCount.toLocaleString("zh-CN"),
      delta: "",
      trend: "flat",
      tone: "positive",
    },
  ];

  // 平台对比 — Σplays per platform, descending; empty groups absent.
  const playsByPlatform = new Map<string, number>();
  for (const r of withSnapshot) {
    playsByPlatform.set(
      r.platform,
      (playsByPlatform.get(r.platform) ?? 0) + r.snapshot.plays,
    );
  }
  const platformComparison: ReadonlyArray<PlatformShare> = [...playsByPlatform.entries()]
    .filter(([, plays]) => plays > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([platform, plays]) => ({
      platform,
      platformLabel: platformLabel(platform),
      share: plays,
      views: `${formatCount(plays)} 播放`,
    }));

  // 趋势 — Σplays bucketed by snapshot capturedAt DATE, ascending (real day序).
  const playsByDate = new Map<string, number>();
  for (const r of withSnapshot) {
    const day = formatDate(r.snapshot.capturedAt);
    playsByDate.set(day, (playsByDate.get(day) ?? 0) + r.snapshot.plays);
  }
  const trend = [...playsByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));

  // 热门内容 — pubs with a snapshot, plays descending, top N.
  const topContent: ReadonlyArray<TopContentRow> = withSnapshot
    .slice()
    .sort(
      (a, b) =>
        b.snapshot.plays - a.snapshot.plays ||
        a.publicationId.localeCompare(b.publicationId),
    )
    .slice(0, TOP_CONTENT_N)
    .map((r) => ({
      id: r.publicationId,
      title: r.title,
      platform: r.platform,
      platformLabel: platformLabel(r.platform),
      // [T-082] 真封面(revision.coverAssetId);null → 渐变占位。
      coverAssetId: r.coverAssetId,
      views: `${formatCount(r.snapshot.plays)} 播放`,
      engagement:
        r.snapshot.interactions > 0
          ? `${formatCount(r.snapshot.interactions)} 互动`
          : "0 互动",
    }));

  return { metrics, platformComparison, trend, topContent };
}

/**
 * Build the REAL Publishing Center ViewModel.
 *
 * Wholesale fixture fallback survives ONLY for an outright projects-read
 * failure (`realRows === null`); a successful read with zero rows returns an
 * HONEST empty VM (publications:[] + an empty rail) so the page shows its 空态
 * rather than masking it.
 *
 * @param client  the contract client (server-bound). Injected for tests.
 */
export async function buildPublishingCenterViewModelReal(
  client: PublishingCenterDataClient = defaultClient as unknown as PublishingCenterDataClient,
  opts: { includeHidden?: boolean } = {},
): Promise<PublishingCenterViewModel> {
  // [T-050] fixture VM 只剩 tab 结构(锁定顺序/文案)来源;读失败不再整套回退
  // demo 数据,改渲染诚实错误态(空表 + error 文案)。
  const fixtureVm = buildPublishingCenterViewModel();
  const errorVm = (): PublishingCenterViewModel => ({
    scenario: "default",
    kind: "publishing-center",
    loading: false,
    error: { code: "read_failed", message: "发布数据读取失败,请刷新重试" },
    contentTypeTabs: fixtureVm.contentTypeTabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      count: 0,
    })),
    publications: [],
    metrics: buildRailFromSnapshots([]).metrics,
    platformComparison: [],
    trend: buildRailFromSnapshots([]).trend,
    topContent: [],
    pagination: { currentPage: 1, totalPages: 1 },
  });

  let assembled: AssembledRows | null;
  try {
    assembled = await assembleRealRows(client, { includeHidden: opts.includeHidden });
  } catch {
    return errorVm();
  }

  // Projects read failed (threw) → honest error VM (a read failure, not an
  // empty result). A successful empty read falls through to the honest empty
  // VM below.
  if (assembled === null) {
    return errorVm();
  }

  const realRows = assembled.rows;
  const rail = buildRailFromSnapshots(assembled.railInputs);

  // The content-type tab LABELS come from the fixture (locked order/labels);
  // the COUNTS reflect the real rows (zero when empty).
  const contentTypeTabs = fixtureVm.contentTypeTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count:
      tab.id === "all"
        ? realRows.length
        : realRows.filter((row) => row.contentType === tab.id).length,
  }));

  // Zero real rows → an HONEST empty VM. publications:[] drives the page's
  // existing 空态; the rail is the empty/`—` skeleton from buildRailFromSnapshots
  // (no fixture masking). Non-zero → real rows + real aggregated rail.
  return {
    scenario: "default",
    kind: "publishing-center",
    loading: false,
    error: null,
    contentTypeTabs,
    publications: realRows,
    metrics: rail.metrics,
    platformComparison: rail.platformComparison,
    trend: rail.trend,
    topContent: rail.topContent,
    pagination: { currentPage: 1, totalPages: 1 },
  };
}
