/**
 * Adapter: contract `publishingCenterPage` DTO → the rich `PublishingCenterViewModel`
 * the PublishingCenterPage renders (Task 5 server-read switch, module Q decision (a)).
 *
 * The composed DTO is the lean page projection (rows/metrics/platformComparison/
 * trend/topContent); the page VM is a presentation-specific shape (per-row labels,
 * content-type tabs with counts, pagination). This adapter denormalizes the labels
 * from fixed maps so SSR output stays stable — pure + deterministic, no `Date.now`,
 * `Math.random`, or network.
 */

import type { MetricCard as MetricCardVm } from "@/types/view-models";
import type {
  ContentTypeTab,
  PlatformShare,
  PublicationContentType,
  PublicationRow,
  PublishingCenterViewModel,
  TopContentRow,
} from "./publishing-center-page";

interface PublishingCenterPageLike {
  scenario: string;
  rows: ReadonlyArray<{
    id: string;
    title: string;
    projectId: string;
    projectTitle: string;
    platform: string;
    publishedAt: string;
    status: string;
    views: number;
    engagement: number;
  }>;
  metrics: ReadonlyArray<MetricCardVm>;
  platformComparison: ReadonlyArray<{ platform: string; value: number }>;
  trend: ReadonlyArray<{ label: string; value: number }>;
  topContent: ReadonlyArray<{ id: string; title: string; value: string }>;
  contentTabs: ReadonlyArray<{ id: string; label: string }>;
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
  return "published";
}

function mapContentType(_platform: string): PublicationContentType {
  // The lean DTO does not carry the source output's contentType; default to
  // "video" (the dominant tab). The content-type filter still works for rows the
  // composer later enriches.
  return "video";
}

function formatNumber(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString();
}

function formatDate(iso: string): string {
  return iso.length < 10 ? iso : iso.slice(0, 10);
}

export function publishingCenterPageToViewModel(
  page: PublishingCenterPageLike,
): PublishingCenterViewModel {
  const publications: ReadonlyArray<PublicationRow> = page.rows.map((r) => {
    const status = mapStatus(r.status);
    const engagementTone: PublicationRow["engagementTone"] =
      r.views > 10000 ? "positive" : r.views > 1000 ? "neutral" : "warning";
    return {
      id: r.id,
      contentTitle: r.title,
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      contentType: mapContentType(r.platform),
      platform: r.platform,
      platformLabel: platformLabel(r.platform),
      publishedAt: r.publishedAt,
      publishedAtLabel: formatDate(r.publishedAt),
      status,
      statusLabel: STATUS_LABELS[status],
      views: formatNumber(r.views),
      engagementLabel: `${r.engagement.toLocaleString()} 互动 · ${formatNumber(r.views)} 播放`,
      engagementTone,
      thumbnailToken: `pub-${r.id}`,
    };
  });

  const contentTypeTabs: ReadonlyArray<ContentTypeTab> = page.contentTabs.map(
    (t) => ({
      id: t.id,
      label: t.label,
      count:
        t.id === "all"
          ? publications.length
          : publications.filter((p) => p.contentType === t.id).length,
    }),
  );

  const platformComparison: ReadonlyArray<PlatformShare> =
    page.platformComparison.map((p) => ({
      platform: p.platform,
      platformLabel: platformLabel(p.platform),
      share: p.value,
      views: formatNumber(p.value),
    }));

  const topContent: ReadonlyArray<TopContentRow> = page.topContent.map((t) => ({
    id: t.id,
    title: t.title,
    platform: "",
    platformLabel: "",
    views: t.value,
    engagement: "",
  }));

  return {
    scenario: "default",
    kind: "publishing-center",
    loading: false,
    error: null,
    contentTypeTabs,
    publications,
    metrics: [...page.metrics],
    platformComparison,
    trend: [...page.trend],
    topContent,
    pagination: { currentPage: 1, totalPages: 1 },
  };
}
