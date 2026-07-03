/**
 * Publishing Center selector.
 *
 * Maps the canonical dataset to the `PublishingCenterViewModel` consumed
 * by the Publishing Center page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildPublishingCenterViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset } from "../canonical";
import type { MetricCard as MetricCardVm } from "@/types/view-models";
import type {
  PlatformShare,
  PublicationContentType,
  PublicationRow,
  PublishingCenterViewModel,
  TopContentRow,
} from "@/features/publishing-center/publishing-center-page";

// ---------------------------------------------------------------------------
// Locked content-type tabs (page-specs §13)
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT_TYPE_TABS: PublishingCenterViewModel["contentTypeTabs"] = [
  { id: "all", label: "全部", count: 28 },
  { id: "video", label: "视频", count: 19 },
  { id: "image", label: "图文", count: 6 },
  { id: "audio", label: "音频", count: 3 },
];

// ---------------------------------------------------------------------------
// Locked metrics (4 cards; matches the 4 KPIs visible in the
// reference image — "已发布 / 总播放 / 总互动 / 平均完播率")
// ---------------------------------------------------------------------------

const DEFAULT_METRICS: ReadonlyArray<MetricCardVm> = [
  {
    id: "pc-m-published",
    label: "已发布",
    value: "28",
    delta: "+4",
    trend: "up",
    tone: "positive",
  },
  {
    id: "pc-m-views",
    label: "总播放",
    value: "12.5 万",
    delta: "+18%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "pc-m-engagement",
    label: "总互动",
    value: "3,860",
    delta: "+12%",
    trend: "up",
    tone: "info",
  },
  {
    id: "pc-m-completion",
    label: "平均完播率",
    value: "42%",
    delta: "+2%",
    trend: "up",
    tone: "positive",
  },
];

// ---------------------------------------------------------------------------
// Locked platform comparison + trend + top content (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_PLATFORM_COMPARISON: ReadonlyArray<PlatformShare> = [
  { platform: "bilibili", platformLabel: "哔哩哔哩", share: 0.42, views: "5.3 万" },
  { platform: "xiaohongshu", platformLabel: "小红书", share: 0.24, views: "3.0 万" },
  { platform: "wechatVideo", platformLabel: "微信视频号", share: 0.18, views: "2.2 万" },
  { platform: "douyin", platformLabel: "抖音", share: 0.10, views: "1.3 万" },
  { platform: "youtube", platformLabel: "YouTube", share: 0.06, views: "0.7 万" },
];

const DEFAULT_TREND: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "4 月", value: 1820 },
  { label: "5 月", value: 2460 },
  { label: "6 月", value: 3120 },
  { label: "7 月", value: 2840 },
  { label: "8 月", value: 3380 },
  { label: "9 月", value: 3920 },
];

const DEFAULT_TOP_CONTENT: ReadonlyArray<TopContentRow> = [
  {
    id: "top-1",
    title: "Creator 访谈 EP01 · 与独立创作者的对话",
    platform: "bilibili",
    platformLabel: "哔哩哔哩",
    views: "1.8 万",
    engagement: "互动 412",
  },
  {
    id: "top-2",
    title: "AI Native Browser 1 分钟速览",
    platform: "xiaohongshu",
    platformLabel: "小红书",
    views: "0.9 万",
    engagement: "互动 268",
  },
  {
    id: "top-3",
    title: "本地优先栈趋势观察",
    platform: "wechatVideo",
    platformLabel: "微信视频号",
    views: "0.6 万",
    engagement: "互动 184",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToken(input: string): string {
  // FNV-1a 32-bit. Pure function — no `Math.random`, no `Date.now`.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash =
      (hash +
        ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>>
      0;
  }
  return hash.toString(16).padStart(8, "0");
}

function platformLabel(platform: string): string {
  switch (platform) {
    case "youtube":
      return "YouTube";
    case "bilibili":
      return "哔哩哔哩";
    case "douyin":
      return "抖音";
    case "xiaohongshu":
      return "小红书";
    case "wechatVideo":
      return "微信视频号";
    case "x":
      return "X";
    default:
      return platform;
  }
}

function statusLabel(status: PublicationRow["status"]): string {
  switch (status) {
    case "published":
      return "已发布";
    case "scheduled":
      return "排期中";
    case "draft":
      return "草稿";
    case "removed":
      return "已下架";
    default:
      return status;
  }
}

function formatDate(iso: string): string {
  // The fixture timestamps are fixed; the page never calls `Date.now`.
  // Slice the canonical "YYYY-MM-DD" portion off the ISO string.
  if (iso.length < 10) return iso;
  return iso.slice(0, 10);
}

function formatNumber(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)} 万`;
  }
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// View model builder
// ---------------------------------------------------------------------------

export function buildPublishingCenterViewModel(): PublishingCenterViewModel {
  const publications = canonicalDataset.publications
    .slice()
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .map<PublicationRow>((pub) => {
      const views = sumViewsForPublication(pub.id);
      const likes = sumLikesForPublication(pub.id);
      const engagementTone: PublicationRow["engagementTone"] =
        views > 10000 ? "positive" : views > 1000 ? "neutral" : "warning";
      const publishedAt = pub.publishedAt ?? pub.scheduledAt ?? pub.createdAt;
      return {
        id: pub.id,
        contentTitle: publicationTitle(pub.id),
        projectId: projectIdForPublication(pub.id),
        projectTitle: projectTitleForPublication(pub.id),
        contentType: contentTypeForPublication(pub.id),
        platform: pub.platform,
        platformLabel: platformLabel(pub.platform),
        publishedAt,
        publishedAtLabel: formatDate(publishedAt),
        status: mapPublicationStatus(pub.status),
        statusLabel: statusLabel(mapPublicationStatus(pub.status)),
        hidden: false, // [T-073] fixture 行默认可见
        views: formatNumber(views),
        engagementLabel: `${likes.toLocaleString()} 赞 · ${formatNumber(views)} 播放`,
        engagementTone,
        thumbnailToken: `pub-${hashToken(`${pub.id}:${pub.platform}`)}`,
      };
    });

  // Pad to a reasonable density so the table looks populated against
  // the reference image (the canonical fixture has 3 publications).
  const padded = padPublicationRows(publications);

  return {
    scenario: "default",
    kind: "publishing-center",
    loading: false,
    error: null,
    contentTypeTabs: DEFAULT_CONTENT_TYPE_TABS,
    publications: padded,
    metrics: DEFAULT_METRICS,
    platformComparison: DEFAULT_PLATFORM_COMPARISON,
    trend: DEFAULT_TREND,
    topContent: DEFAULT_TOP_CONTENT,
    pagination: { currentPage: 1, totalPages: 3 },
  };
}

/**
 * Map a publication to one of the content-type tab keys
 * (video / image / audio) by resolving its content output's
 * `contentType`. The reference tabs are 全部 / 视频 / 图文 / 音频, so
 * `short`/`video` collapse to "video", `article` to "image", and
 * `audio`/`podcast` to "audio".
 */
function contentTypeForPublication(
  publicationId: string,
): PublicationContentType {
  const pub = canonicalDataset.publications.find(
    (row) => row.id === publicationId,
  );
  if (!pub) return "video";
  const output = canonicalDataset.contentOutputs.find(
    (row) => row.id === pub.contentOutputId,
  );
  return mapContentType(output?.contentType ?? "video");
}

function mapContentType(contentType: string): PublicationContentType {
  switch (contentType) {
    case "article":
    case "image":
    case "post":
      return "image";
    case "audio":
    case "podcast":
      return "audio";
    case "video":
    case "short":
    default:
      return "video";
  }
}

function sumViewsForPublication(publicationId: string): number {
  const snapshotIds = canonicalDataset.metricSnapshots
    .filter((row) => row.publicationId === publicationId)
    .map((row) => row.id);
  return canonicalDataset.metricValues
    .filter(
      (row) =>
        snapshotIds.includes(row.metricSnapshotId) && row.metricKey === "views",
    )
    .reduce((acc, row) => acc + row.numericValue, 0);
}

function sumLikesForPublication(publicationId: string): number {
  const snapshotIds = canonicalDataset.metricSnapshots
    .filter((row) => row.publicationId === publicationId)
    .map((row) => row.id);
  return canonicalDataset.metricValues
    .filter(
      (row) =>
        snapshotIds.includes(row.metricSnapshotId) && row.metricKey === "likes",
    )
    .reduce((acc, row) => acc + row.numericValue, 0);
}

function publicationTitle(publicationId: string): string {
  const revision = canonicalDataset.publicationRevisions.find(
    (row) => row.publicationId === publicationId,
  );
  if (revision) return revision.title;
  const pub = canonicalDataset.publications.find((row) => row.id === publicationId);
  return pub ? publicationLabelFromPlatform(pub.platform) : "未命名内容";
}

function publicationLabelFromPlatform(platform: string): string {
  switch (platform) {
    case "youtube":
      return "YouTube 视频";
    case "bilibili":
      return "哔哩哔哩视频";
    case "douyin":
      return "抖音视频";
    case "xiaohongshu":
      return "小红书图文";
    case "wechatVideo":
      return "微信视频号视频";
    case "x":
      return "X 推文";
    default:
      return "已发布内容";
  }
}

function projectIdForPublication(publicationId: string): string | undefined {
  const pub = canonicalDataset.publications.find(
    (row) => row.id === publicationId,
  );
  if (!pub) return undefined;
  const output = canonicalDataset.contentOutputs.find(
    (row) => row.id === pub.contentOutputId,
  );
  return output?.projectId;
}

function projectTitleForPublication(publicationId: string): string {
  const pub = canonicalDataset.publications.find(
    (row) => row.id === publicationId,
  );
  if (!pub) return "未关联项目";
  const output = canonicalDataset.contentOutputs.find(
    (row) => row.id === pub.contentOutputId,
  );
  if (!output) return "未关联项目";
  const project = canonicalDataset.projects.find(
    (row) => row.id === output.projectId,
  );
  return project?.title ?? "未关联项目";
}

function mapPublicationStatus(
  status: string,
): PublicationRow["status"] {
  switch (status) {
    case "published":
      return "published";
    case "scheduled":
      return "scheduled";
    case "draft":
      return "draft";
    case "removed":
      return "removed";
    default:
      return "published";
  }
}

function padPublicationRows(
  rows: ReadonlyArray<PublicationRow>,
): ReadonlyArray<PublicationRow> {
  if (rows.length >= 8) return rows;
  const extras: ReadonlyArray<PublicationRow> = [
    {
      id: "row-ainativebrowser-bilibili",
      contentTitle: "AI Native Browser 主视频",
      projectTitle: "AI Native Browser 深度解析",
      contentType: "video",
      platform: "bilibili",
      platformLabel: "哔哩哔哩",
      publishedAt: "2026-05-28T20:00:00+08:00",
      publishedAtLabel: "2026-05-28",
      status: "published",
      statusLabel: "已发布",
      hidden: false, // [T-073] fixture 行默认可见
      views: "1.4 万",
      engagementLabel: "624 赞 · 1.4 万 播放",
      engagementTone: "positive",
      thumbnailToken: "pub-pad-bilibili",
    },
    {
      id: "row-ainativebrowser-youtube",
      contentTitle: "AI Native Browser · 双语字幕版",
      projectTitle: "AI Native Browser 深度解析",
      contentType: "video",
      platform: "youtube",
      platformLabel: "YouTube",
      publishedAt: "2026-05-22T19:30:00+08:00",
      publishedAtLabel: "2026-05-22",
      status: "published",
      statusLabel: "已发布",
      hidden: false, // [T-073] fixture 行默认可见
      views: "4,820",
      engagementLabel: "286 赞 · 4,820 播放",
      engagementTone: "neutral",
      thumbnailToken: "pub-pad-youtube",
    },
    {
      id: "row-secondbrain-xhs",
      contentTitle: "第二大脑搭建 · 速读卡片",
      projectTitle: "第二大脑搭建手册",
      contentType: "image",
      platform: "xiaohongshu",
      platformLabel: "小红书",
      publishedAt: "2026-05-15T18:00:00+08:00",
      publishedAtLabel: "2026-05-15",
      status: "published",
      statusLabel: "已发布",
      hidden: false, // [T-073] fixture 行默认可见
      views: "6,420",
      engagementLabel: "412 赞 · 6,420 播放",
      engagementTone: "positive",
      thumbnailToken: "pub-pad-xhs",
    },
    {
      id: "row-promptcraft-douyin",
      contentTitle: "Prompt Craft EP01 · 任务拆解",
      projectTitle: "Prompt Craft 系列短片",
      contentType: "video",
      platform: "douyin",
      platformLabel: "抖音",
      publishedAt: "2026-05-08T20:00:00+08:00",
      publishedAtLabel: "2026-05-08",
      status: "scheduled",
      statusLabel: "排期中",
      hidden: false, // [T-073] fixture 行默认可见
      views: "2,180",
      engagementLabel: "118 赞 · 2,180 播放",
      engagementTone: "neutral",
      thumbnailToken: "pub-pad-douyin",
    },
    {
      id: "row-podcast-wechat",
      contentTitle: "Creator 访谈 · 微信视频号版",
      projectTitle: "Creator 访谈播客启动计划",
      contentType: "audio",
      platform: "wechatVideo",
      platformLabel: "微信视频号",
      publishedAt: "2026-04-17T19:00:00+08:00",
      publishedAtLabel: "2026-04-17",
      status: "published",
      statusLabel: "已发布",
      hidden: false, // [T-073] fixture 行默认可见
      views: "3,860",
      engagementLabel: "182 赞 · 3,860 播放",
      engagementTone: "positive",
      thumbnailToken: "pub-pad-wechat",
    },
  ];
  return [...rows, ...extras].slice(0, 8);
}
