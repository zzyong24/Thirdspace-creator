/**
 * Global Search selector.
 *
 * Maps the canonical dataset to the `SearchViewModel` consumed by the
 * Global Search page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. The page imports
 * `buildSearchViewModel` from `@/fixtures/selectors` and never
 * dereferences `canonicalDataset` for data shaping.
 *
 * Page-local result types (`ProjectResult`, `KnowledgeResult`,
 * `AssetResult`, `VideoResult`, …) are imported type-only from the
 * page module, since the page's JSX still consumes them directly.
 */

import { canonicalDataset } from "../canonical";
import type {
  AssetResult,
  HistoryItem,
  KnowledgeResult,
  ProjectResult,
  QuickAction,
  ResultTypeTab,
  SearchFilterOption,
  SearchViewModel,
  VideoResult,
} from "@/features/search/search-page";

// ---------------------------------------------------------------------------
// Locked default view model
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<string, string> = {
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
};

const RESULT_TYPE_TABS: ReadonlyArray<ResultTypeTab> = [
  { id: "project", label: "项目", count: 12 },
  { id: "knowledge", label: "知识", count: 38 },
  { id: "asset", label: "素材", count: 84 },
  { id: "video", label: "视频", count: 19 },
];

const DEFAULT_FILTERS: ReadonlyArray<SearchFilterOption> = [
  { id: "f-type", label: "类型", count: 4, tone: "neutral" },
  { id: "f-stage", label: "阶段", count: 6, tone: "neutral" },
  { id: "f-tag", label: "标签", count: 28, tone: "brand" },
  { id: "f-date", label: "更新时间", count: 5, tone: "info" },
];

const DEFAULT_QUICK_ACTIONS: ReadonlyArray<QuickAction> = [
  {
    id: "qa-new-project",
    label: "新建项目",
    description: "从一个空模板开始",
    href: "/projects/new",
  },
  {
    id: "qa-knowledge",
    label: "查看知识库",
    description: "浏览所有沉淀的笔记",
    href: "/knowledge",
  },
  {
    id: "qa-assets",
    label: "上传素材",
    description: "跳转到素材中心",
    href: "/assets",
  },
];

const DEFAULT_TIPS: ReadonlyArray<string> = [
  "使用引号精确匹配: 'AI Browser'",
  "使用 - 排除关键词: 浏览器 -Chrome",
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

function formatDate(iso: string): string {
  if (iso.length < 10) return iso;
  return iso.slice(0, 10);
}

function knowledgeTypeLabel(type: string): string {
  switch (type) {
    case "note":
      return "笔记";
    case "reference":
      return "参考";
    case "inspiration":
      return "灵感";
    case "snippet":
      return "片段";
    case "transcript":
      return "记录";
    default:
      return type;
  }
}

function assetTypeLabel(type: string): string {
  switch (type) {
    case "image":
      return "图片";
    case "video":
      return "视频";
    case "audio":
      return "音频";
    case "document":
      return "文档";
    case "subtitle":
      return "字幕";
    default:
      return type;
  }
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

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "进行中";
    case "paused":
      return "已暂停";
    case "archived":
      return "已归档";
    case "completed":
      return "已完成";
    default:
      return status;
  }
}

function tagsForEntity(
  entityType: "project" | "knowledge" | "asset",
  entityId: string,
): ReadonlyArray<string> {
  const links = canonicalDataset.entityTags.filter(
    (row) => row.entityType === entityType && row.entityId === entityId,
  );
  return links
    .map(
      (link) => canonicalDataset.tags.find((tag) => tag.id === link.tagId)?.name,
    )
    .filter((name): name is string => Boolean(name));
}

function publicationTitle(publicationId: string): string {
  const revision = canonicalDataset.publicationRevisions.find(
    (row) => row.publicationId === publicationId,
  );
  if (revision) return revision.title;
  const pub = canonicalDataset.publications.find(
    (row) => row.id === publicationId,
  );
  return pub ? `${platformLabel(pub.platform)} 内容` : "未命名内容";
}

function publicationViews(publicationId: string): number {
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

function formatViews(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString();
}

function relativeDate(iso: string): string {
  // The canonical dataset ships fixed timestamps. We translate them
  // to a coarse "x days ago" label so the search history list stays
  // human-readable without ever invoking `Date.now`. The mapping
  // uses the FIXED_NOW anchor baked into the canonical dataset.
  const FIXED_NOW_ISO = "2026-06-13T10:00:00+08:00";
  const fixedMs = new Date(FIXED_NOW_ISO).getTime();
  const ms = new Date(iso).getTime();
  const diffDays = Math.max(
    0,
    Math.floor((fixedMs - ms) / (24 * 60 * 60 * 1000)),
  );
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return `${Math.floor(diffDays / 30)} 个月前`;
}

// ---------------------------------------------------------------------------
// View model builder
// ---------------------------------------------------------------------------

export function buildSearchViewModel(): SearchViewModel {
  const projects = canonicalDataset.projects.slice(0, 3).map<ProjectResult>(
    (project) => ({
      id: project.id,
      title: project.title,
      currentStage: project.currentStage,
      currentStageLabel: STAGE_LABELS[project.currentStage] ?? project.currentStage,
      progressPct: project.progressPct,
      statusLabel: statusLabel(project.status),
      brief: project.brief,
      tags: tagsForEntity("project", project.id),
    }),
  );

  const knowledge = canonicalDataset.knowledgeItems
    .slice(0, 3)
    .map<KnowledgeResult>((item) => {
      const revision = canonicalDataset.knowledgeRevisions.find(
        (row) => row.knowledgeItemId === item.id,
      );
      return {
        id: item.id,
        title: item.title,
        typeLabel: knowledgeTypeLabel(item.knowledgeType),
        updatedAt: formatDate(item.updatedAt),
        excerpt: revision?.content?.slice(0, 80) ?? "暂无摘要",
      };
    });

  const assets = canonicalDataset.assets.slice(0, 4).map<AssetResult>(
    (asset) => ({
      id: asset.id,
      title: asset.name,
      typeLabel: assetTypeLabel(asset.assetType),
      token: `asset-${hashToken(asset.id)}`,
    }),
  );

  const videos = canonicalDataset.publications
    .slice(0, 3)
    .map<VideoResult>((pub) => ({
      id: pub.id,
      title: publicationTitle(pub.id),
      platform: pub.platform,
      platformLabel: platformLabel(pub.platform),
      publishedAtLabel: formatDate(pub.publishedAt ?? pub.createdAt),
      views: formatViews(publicationViews(pub.id)),
      token: `video-${hashToken(`${pub.id}:${pub.platform}`)}`,
    }));

  const history = canonicalDataset.searchHistory.map<HistoryItem>(
    (row) => ({
      id: row.id,
      query: row.query,
      resultCount: row.resultCount,
      searchedAtLabel: relativeDate(row.searchedAt),
    }),
  );

  return {
    resultTypeTabs: RESULT_TYPE_TABS,
    projectResults: projects,
    knowledgeResults: knowledge,
    assetResults: assets,
    videoResults: videos,
    filters: DEFAULT_FILTERS,
    quickActions: DEFAULT_QUICK_ACTIONS,
    history,
    tips: DEFAULT_TIPS,
  };
}
