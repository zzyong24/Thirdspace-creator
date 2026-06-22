import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildPublishingCenterViewModel } from "@/fixtures/selectors";
import type {
  PublicationContentType,
  PublicationRow,
  PublishingCenterViewModel,
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
 * 平台 / 发布时间 / 状态). The analytics rail (PublishingMetrics /
 * PlatformComparisonChart / TrendChart / TopContentList) has NO real read path
 * this wave — those are kept from the fixture VM (the page's existing baseline)
 * so the rail does not regress. We do not fabricate per-row 表现 (views /
 * engagement) numbers for real rows: real publications carry no analytics
 * snapshot here, so each real row renders a neutral "暂无数据" 表现 cell instead
 * of a fake play count.
 *
 * Degrades gracefully:
 *   - per-output: a failed publications read for one output contributes no rows,
 *   - wholesale: if the projects read throws, the WHOLE VM falls back to the
 *     fixture builder (preserving the existing visual baseline),
 *   - empty: zero real publications → fall back to the fixture baseline so the
 *     page does not regress to an empty table while the canonical seed is empty.
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
  readonly createdAt: string;
}

interface PublicationRevisionDto {
  readonly id: string;
  readonly title: string;
  readonly revisionNumber: number;
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
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listPublicationRevisions(input: {
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
 * `publicationRevisions`). Reads the publication's revisions (newest-first),
 * prefers the row matching `currentRevisionId`, else the newest. A non-empty
 * title wins; anything missing/blank → `null` so the caller falls back to the
 * owning output title placeholder. Try/catch → `null` (never throws into the
 * row build). N+1 over a small publication set — acceptable this wave.
 */
async function resolveRevisionTitle(
  client: PublishingCenterDataClient,
  pub: PublicationDto,
): Promise<string | null> {
  try {
    const revisions = (await client.listPublicationRevisions({
      params: { publicationId: pub.id },
      query: { page: 1, pageSize: 20 },
      body: undefined,
    })) as ReadonlyArray<PublicationRevisionDto>;
    if (revisions.length === 0) return null;
    const current =
      revisions.find((r) => r.id === pub.currentRevisionId) ?? revisions[0];
    const title = current?.title?.trim();
    return title ? title : null;
  } catch {
    return null;
  }
}

/**
 * Build the REAL publication rows by walking projects → outputs → publications.
 * Returns `null` (not `[]`) when the projects read throws, so the caller can
 * distinguish "read failed → fall back wholesale" from "read ok, zero rows".
 */
async function assembleRealRows(
  client: PublishingCenterDataClient,
): Promise<ReadonlyArray<PublicationRow> | null> {
  let projects: ReadonlyArray<ProjectDto>;
  try {
    projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<ProjectDto>;
  } catch {
    return null;
  }

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
        return [] as ReadonlyArray<PublicationRow>;
      }

      const outputById = new Map<string, ContentOutputDto>();
      for (const output of outputs) outputById.set(output.id, output);

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

      return Promise.all(
        publicationLists.flat().map<Promise<PublicationRow>>(async (pub) => {
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
        const revisionTitle = await resolveRevisionTitle(client, pub);
        const fallbackTitle = output
          ? `${output.title} · ${platformLabel(pub.platform)}`
          : platformLabel(pub.platform);
        return {
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
          // 表现: no analytics snapshot for real publications this wave — keep it
          // honest (no fabricated play count). The cell renders 暂无数据.
          views: "暂无数据",
          engagementLabel: "暂无数据",
          engagementTone: "neutral",
          thumbnailToken: `pub-${pub.id}`,
        };
        }),
      );
    }),
  );

  return perProject
    .flat()
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Build the REAL Publishing Center ViewModel, degrading to the fixture VM.
 *
 * @param client  the contract client (server-bound). Injected for tests.
 */
export async function buildPublishingCenterViewModelReal(
  client: PublishingCenterDataClient = defaultClient as unknown as PublishingCenterDataClient,
): Promise<PublishingCenterViewModel> {
  // The fixture VM is the analytics-rail source (no real read path) and the
  // WHOLE fallback when the projects read fails or there are no real rows.
  const fixtureVm = buildPublishingCenterViewModel();

  let realRows: ReadonlyArray<PublicationRow> | null;
  try {
    realRows = await assembleRealRows(client);
  } catch {
    return fixtureVm;
  }

  // Projects read failed, or there are no real publications yet → keep the
  // fixture baseline so the page does not regress to an empty table.
  if (realRows === null || realRows.length === 0) {
    return fixtureVm;
  }

  // REAL publication rows win for the table; the analytics rail (metrics /
  // platformComparison / trend / topContent) stays fixture-sourced — it has no
  // real read path this wave and is honestly the demo baseline.
  const contentTypeTabs = fixtureVm.contentTypeTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count:
      tab.id === "all"
        ? realRows.length
        : realRows.filter((row) => row.contentType === tab.id).length,
  }));

  return {
    scenario: "default",
    kind: "publishing-center",
    loading: false,
    error: null,
    contentTypeTabs,
    publications: realRows,
    metrics: fixtureVm.metrics,
    platformComparison: fixtureVm.platformComparison,
    trend: fixtureVm.trend,
    topContent: fixtureVm.topContent,
    pagination: { currentPage: 1, totalPages: 1 },
  };
}
