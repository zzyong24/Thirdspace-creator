/**
 * Adapter: contract `globalSearchPage` DTO → the FE `SearchViewModel` the
 * SearchPage renders (Task 5 "server read switch"). The op-backed `/search`
 * route fetches `pages.search.get` server-side and maps the grouped page DTO into
 * the page's view-model shape (the DTO and the VM differ in field names: DTO
 * `projects[].snippet/stage` → VM `brief/currentStage`, DTO `history[].searchedAt`
 * → VM `searchedAtLabel`, etc.).
 *
 * Pure + deterministic — no `Date.now`, `Math.random`, or network. Labels are
 * looked up from fixed maps so SSR output stays stable.
 */

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
} from "./search-page";

interface GlobalSearchPageLike {
  query: string;
  resultTabs: ReadonlyArray<{ id: string; label: string; count: number }>;
  projects: ReadonlyArray<{ id: string; title: string; stage: string; progressPct: number; snippet: string }>;
  knowledge: ReadonlyArray<{ id: string; title: string; excerpt: string; tags: ReadonlyArray<string> }>;
  assets: ReadonlyArray<{ id: string; title: string; assetType: string }>;
  videos: ReadonlyArray<{ id: string; title: string; platform: string; durationLabel: string }>;
  filters: ReadonlyArray<{ id: string; label: string; options: ReadonlyArray<string> }>;
  quickActions: ReadonlyArray<{ id: string; label: string }>;
  history: ReadonlyArray<{ id: string; query: string; searchedAt: string }>;
  tips: ReadonlyArray<string>;
}

const STAGE_LABELS: Record<string, string> = {
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
  subtitle: "字幕",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  bilibili: "哔哩哔哩",
  douyin: "抖音",
  xiaohongshu: "小红书",
  wechatVideo: "微信视频号",
  x: "X",
};

const QUICK_ACTION_HREFS: Record<string, string> = {
  "qa-new-project": "/projects/new",
  "qa-knowledge": "/knowledge",
  "qa-assets": "/assets",
};

const QUICK_ACTION_DESCRIPTIONS: Record<string, string> = {
  "qa-new-project": "从一个空模板开始",
  "qa-knowledge": "浏览所有沉淀的笔记",
  "qa-assets": "跳转到素材中心",
};

const FILTER_TONES: Record<string, SearchFilterOption["tone"]> = {
  "f-type": "neutral",
  "f-stage": "neutral",
  "f-tag": "brand",
  "f-date": "info",
};

export function globalSearchPageToViewModel(
  page: GlobalSearchPageLike,
): SearchViewModel {
  const resultTypeTabs: ReadonlyArray<ResultTypeTab> = page.resultTabs.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.count,
  }));

  const projectResults: ReadonlyArray<ProjectResult> = page.projects.map((p) => ({
    id: p.id,
    title: p.title,
    currentStage: p.stage,
    currentStageLabel: STAGE_LABELS[p.stage] ?? p.stage,
    progressPct: p.progressPct,
    statusLabel: "进行中",
    brief: p.snippet,
    tags: [],
  }));

  const knowledgeResults: ReadonlyArray<KnowledgeResult> = page.knowledge.map((k) => ({
    id: k.id,
    title: k.title,
    typeLabel: "知识",
    updatedAt: "",
    excerpt: k.excerpt,
  }));

  const assetResults: ReadonlyArray<AssetResult> = page.assets.map((a) => ({
    id: a.id,
    title: a.title,
    typeLabel: ASSET_TYPE_LABELS[a.assetType] ?? a.assetType,
    token: a.id,
  }));

  const videoResults: ReadonlyArray<VideoResult> = page.videos.map((v) => ({
    id: v.id,
    title: v.title,
    platform: v.platform,
    platformLabel: PLATFORM_LABELS[v.platform] ?? v.platform,
    publishedAtLabel: "",
    views: "",
    token: v.id,
  }));

  const filters: ReadonlyArray<SearchFilterOption> = page.filters.map((f) => ({
    id: f.id,
    label: f.label,
    count: f.options.length,
    tone: FILTER_TONES[f.id] ?? "neutral",
  }));

  const quickActions: ReadonlyArray<QuickAction> = page.quickActions.map((qa) => ({
    id: qa.id,
    label: qa.label,
    description: QUICK_ACTION_DESCRIPTIONS[qa.id] ?? "",
    href: QUICK_ACTION_HREFS[qa.id] ?? "/",
  }));

  const history: ReadonlyArray<HistoryItem> = page.history.map((h) => ({
    id: h.id,
    query: h.query,
    resultCount: 0,
    // The DTO carries an ISO timestamp; render the date portion (deterministic,
    // no Date.now). The history rows link by `query`, not this label.
    searchedAtLabel: h.searchedAt.slice(0, 10),
  }));

  return {
    resultTypeTabs,
    projectResults,
    knowledgeResults,
    assetResults,
    videoResults,
    filters,
    quickActions,
    history,
    tips: page.tips,
  };
}
