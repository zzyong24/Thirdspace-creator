import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildPublishingViewModel } from "@/fixtures/selectors";
import type {
  CalendarWiring,
  PlatformComparisonRow,
  PlatformMetricStat,
  PreviewStats,
  PublishingRightRail,
} from "./publishing-interactive-region";
import type { PlatformId, PublicationStatus } from "@/types/domain";
import type { PlatformPublishCard, PublishingViewModel } from "@/types/view-models";

/**
 * Publishing Workspace READ-side data assembly ("workspace 读侧做真").
 *
 * Assembles a REAL `PublishingViewModel` for the project Publishing stage from:
 *   - `projects.list`             → resolve the URL slug to a canonical project id,
 *   - `projects.outputs.list`     → the project's ContentOutputs,
 *   - `outputs.publications.list` → each output's REAL publications (a 一稿多平台
 *                                   adapt run creates one node per platform).
 *
 * The REAL publication list drives the `platforms` cards (platform + status +
 * scheduledAt + account label). Everything that has no real read path this wave
 * (form, preview, checklist, tips, tabs) is kept from the fixture VM for the
 * canonical demo projects, and EMPTY / blank for real projects so the
 * BasicInformationForm / preview render their own empty states instead of fake
 * data.
 *
 * Degrades gracefully:
 *   - per-field: a project with no real publications keeps fixture cards for the
 *     canonical demo project, EMPTY for a real project (the panel owns the empty
 *     state),
 *   - wholesale: if the project can't be resolved against the real list, the
 *     whole VM falls back to the fixture builder (which surfaces "未找到项目" only
 *     for ids absent from the canonical dataset). A REAL project must NEVER
 *     render "未找到项目".
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
}

interface PublicationDto {
  readonly id: string;
  readonly contentOutputId: string;
  readonly platform: PlatformId;
  readonly accountReference: string;
  readonly status: PublicationStatus;
  readonly currentRevisionId: string;
  readonly scheduledAt: string | null;
}

interface PublicationRevisionDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly revisionNumber: number;
  readonly platformTags: ReadonlyArray<string>;
}

export interface PublishingDataClient {
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
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listPublicationRevisions(input: {
    params: { publicationId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listAccounts(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getPublicationAnalytics(input: {
    params: { publicationId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

// Account row — only the fields we read to pick the active publishing account.
interface PlatformAccountDto {
  readonly id: string;
  readonly status: string;
}

// Metric snapshot — the self-describing analytics payload (`rawMetrics`) the
// seed writes per publication, read via `analytics.publications.get`.
interface MetricSnapshotDto {
  readonly id: string;
  readonly publicationId: string;
  readonly capturedAt: string;
  readonly rawMetrics: Record<string, unknown>;
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  bilibili: "哔哩哔哩",
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechatVideo: "微信视频号",
  x: "X",
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

// Chinese 万 grouping for large counts (mirrors publishing-center-data).
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
 * Resolve the 内容日历 wiring (GAP-PUBW-1 AC1): the first ACTIVE platform account
 * (else the first account) + a DETERMINISTIC weekStart base instant (C-5 — never
 * wall-clock). `weekStart` is injected by the caller (route) so SSR stays
 * deterministic. Returns `undefined` when no account exists or the read fails →
 * the calendar stays inert (no client-invented entry state, C-2).
 */
export async function resolvePublishingCalendarWiring(
  weekStart: string,
  client: PublishingDataClient = defaultClient as unknown as PublishingDataClient,
): Promise<CalendarWiring | undefined> {
  try {
    const accounts = (await client.listAccounts({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<PlatformAccountDto>;
    const active =
      accounts.find((a) => a.status === "active") ?? accounts[0];
    if (!active) return undefined;
    return { accountId: active.id, weekStart };
  } catch {
    return undefined;
  }
}

/**
 * Resolve a publication's latest metric snapshot `rawMetrics` (newest by
 * `capturedAt`) via `analytics.publications.get`. Returns `null` on no-data /
 * read failure so the caller skips that platform rather than fabricating.
 */
async function latestSnapshot(
  client: PublishingDataClient,
  publicationId: string,
): Promise<Record<string, unknown> | null> {
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
    return latest.rawMetrics ?? {};
  } catch {
    return null;
  }
}

/**
 * Assemble the REAL 右栏真来源 (GAP-PUBW-1 AC2/AC3): per-platform metric cards +
 * a comparison table + the preview overlay stats, aggregated from each
 * publication's latest analytics snapshot. Every field degrades to empty (the
 * island renders honest 暂无指标 / hides the preview number row) — never throws,
 * never fabricates. Conversion 口径 is undefined this wave (D-PUBW-c) → each row's
 * `conversion` is `null` and the island hides that column.
 *
 * @param publications  platform → publicationId map (from the route's resolveWiring).
 */
export async function resolvePublishingRightRail(
  publications: Readonly<Record<string, string>>,
  client: PublishingDataClient = defaultClient as unknown as PublishingDataClient,
): Promise<PublishingRightRail> {
  const entries = Object.entries(publications);
  if (entries.length === 0) return {};

  const perPlatform = await Promise.all(
    entries.map(async ([platform, publicationId]) => {
      const raw = await latestSnapshot(client, publicationId);
      if (!raw) return null;
      const plays = numOf(raw, "plays");
      const likes = numOf(raw, "likes");
      const comments = numOf(raw, "comments");
      const shares = numOf(raw, "shares");
      const favorites = numOf(raw, "favorites");
      return {
        platform: platform as PlatformId,
        plays,
        likes,
        comments,
        shares,
        favorites,
      };
    }),
  );

  const live = perPlatform.filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  if (live.length === 0) return {};

  // Metric cards: 累计播放 per platform (most legible single number for the rail).
  const metrics: ReadonlyArray<PlatformMetricStat> = live.map((p) => ({
    id: `pm-${p.platform}`,
    platform: p.platform,
    label: "累计播放",
    value: formatCount(p.plays),
  }));

  // Comparison: 触达 = plays; 转化 left null (no defined 口径 this wave — D-PUBW-c).
  const comparison: ReadonlyArray<PlatformComparisonRow> = live
    .slice()
    .sort((a, b) => b.plays - a.plays)
    .map((p) => ({
      id: `pc-${p.platform}`,
      platform: p.platform,
      label: platformLabel(p.platform),
      reach: formatCount(p.plays),
      conversion: null,
    }));

  // Preview overlay stats: the top (most-played) platform's snapshot.
  const top = live.slice().sort((a, b) => b.plays - a.plays)[0]!;
  const previewStats: PreviewStats = {
    plays: formatCount(top.plays),
    likes: formatCount(top.likes),
    comments: formatCount(top.comments),
  };

  return { metrics, comparison, previewStats };
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id against the
 * REAL persisted project list. A slug like `ai-native-browser` collapses to the
 * canonical `project-ainativebrowser` (matched on the kebab-cased title). If no
 * project matches (or the read fails) the original param is returned so the
 * fixture builder can surface the empty state.
 */
async function resolveProjectId(
  param: string,
  client: PublishingDataClient,
): Promise<{ id: string; isReal: boolean }> {
  if (!param) return { id: param, isReal: false };
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<ProjectDto>;
    const direct = projects.find((project) => project.id === param);
    if (direct) return { id: direct.id, isReal: true };
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    if (match) return { id: match.id, isReal: true };
    return { id: param, isReal: false };
  } catch {
    return { id: param, isReal: false };
  }
}

/**
 * Resolve a publication's REAL current-revision { title, description } (the
 * 真标题/文案 stored in publicationRevisions, read via publications.revisions.list).
 * Prefers the row matching `currentRevisionId`, else the newest. Returns `null`
 * when the read yields nothing or throws (caller keeps its placeholder). N+1 over
 * a small publication set — acceptable this wave.
 */
async function resolveRevision(
  client: PublishingDataClient,
  pub: PublicationDto,
): Promise<{
  title: string;
  description: string;
  // SPEC §8「多平台 标签」做真:标签集从当前 revision.platform_tags 投影到表单。
  tags: ReadonlyArray<string>;
} | null> {
  try {
    const revisions = (await client.listPublicationRevisions({
      params: { publicationId: pub.id },
      query: { page: 1, pageSize: 20 },
      body: undefined,
    })) as ReadonlyArray<PublicationRevisionDto>;
    if (revisions.length === 0) return null;
    const current =
      revisions.find((r) => r.id === pub.currentRevisionId) ?? revisions[0];
    if (!current) return null;
    return {
      title: current.title ?? "",
      description: current.description ?? "",
      tags: Array.isArray(current.platformTags) ? current.platformTags : [],
    };
  } catch {
    return null;
  }
}

function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build the REAL Publishing ViewModel, degrading to the fixture VM on failure.
 *
 * @param projectId  the route segment / project id (canonical id or slug).
 * @param client     the contract client (server-bound). Injected for tests.
 */
export async function buildPublishingWorkspaceViewModel(
  projectId: string,
  client: PublishingDataClient = defaultClient as unknown as PublishingDataClient,
): Promise<PublishingViewModel> {
  const { id: resolvedId, isReal } = await resolveProjectId(projectId, client);

  // The fixture VM is the per-field fallback source for everything with no real
  // read path, and the WHOLE fallback when the project can't be resolved.
  const fixtureVm = buildPublishingViewModel(resolvedId);

  // Unknown / unresolved project → preserve old behavior (fixture VM, which
  // renders the "未找到项目" / empty scenario for unknown ids).
  if (!isReal && fixtureVm.scenario === "empty") {
    return fixtureVm;
  }

  // A canonical/demo project keeps the fixture's curated cards/form/tips; a real
  // project shows empty states (no fake data) when it has no real publications.
  const isFixtureProject = fixtureVm.scenario !== "empty";

  let realCards: ReadonlyArray<PlatformPublishCard> = [];
  // The REAL 标题/文案/标签 from the first publication's current revision (read via
  // publications.revisions.list). Null until/unless we resolve one.
  let realForm: {
    title: string;
    description: string;
    tags: ReadonlyArray<string>;
  } | null = null;

  try {
    const outputs = (await client.listOutputs({
      params: { projectId: resolvedId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<ContentOutputDto>;

    const publicationLists = await Promise.all(
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

    const publications = publicationLists.flat();

    // One platform card per REAL publication (a 一稿多平台 adapt run creates one
    // publication node per target platform).
    realCards = publications.map((pub) => ({
      id: pub.id,
      platform: pub.platform,
      accountLabel: pub.accountReference,
      status: pub.status,
      scheduledAt: pub.scheduledAt ?? null,
    }));

    // 标题/文案 做真: read the first publication's current-revision title/description
    // (the form previously had no real source — placeholder empty for real
    // projects). One extra read per first publication; try/catch → keep null.
    const firstPub = publications[0];
    if (firstPub) {
      realForm = await resolveRevision(client, firstPub);
    }
  } catch {
    // Outputs read failed — keep cards empty; the fallback below picks fixture
    // cards for the canonical demo project.
    realCards = [];
  }

  // REAL publications win. When there are none: fixture cards for the canonical
  // demo project, EMPTY for a real project (the panel owns the empty state).
  const platforms: ReadonlyArray<PlatformPublishCard> =
    realCards.length > 0
      ? realCards
      : isFixtureProject
        ? fixtureVm.platforms
        : [];

  // Preview platform follows the (now possibly real) first card.
  const preview =
    platforms.length > 0
      ? {
          title: fixtureVm.preview.title,
          description: fixtureVm.preview.description,
          platform: platforms[0]!.platform,
        }
      : fixtureVm.preview;

  // Form: fixture content for demo projects, blank slate for real projects. The
  // 标题/文案 are overridden with the REAL current-revision values when we resolved
  // one (a non-empty real title/description wins over the placeholder/fixture).
  const baseForm = isFixtureProject
    ? fixtureVm.form
    : {
        title: "",
        description: "",
        coverLabel: "无封面",
        tags: [],
        category: "未分类",
        series: "无系列",
      };
  const form = realForm
    ? {
        ...baseForm,
        title: realForm.title.trim() ? realForm.title : baseForm.title,
        description: realForm.description.trim()
          ? realForm.description
          : baseForm.description,
        // SPEC §8 标签做真:当前 revision 的 platform_tags 投影到表单(空集 → 沿用 baseForm,
        // 让 demo 项目保留 fixture 标签、真实项目显空)。
        tags: realForm.tags.length > 0 ? realForm.tags : baseForm.tags,
      }
    : baseForm;

  return {
    scenario: "default",
    kind: "publishing",
    projectId: resolvedId,
    // Static page-tab taxonomy — always the fixture's.
    tabs: fixtureVm.tabs,
    form,
    platforms,
    preview,
    // No real source for checklist/tips this wave — fixture for demo projects,
    // empty for real projects.
    checklist: isFixtureProject ? fixtureVm.checklist : [],
    tips: isFixtureProject ? fixtureVm.tips : [],
    loading: false,
    error: null,
  };
}
