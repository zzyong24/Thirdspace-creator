/**
 * Experience Center selector (Task 22 / page-specs §14).
 *
 * Builds the `ExperienceViewModel` consumed by the Experience Center
 * page. The page is a global resource-center route whose default render
 * is sourced from deterministic locked constants (D-010) rather than the
 * canonical dataset, so SSR output is byte-stable. Pure and
 * deterministic — no `Date.now`, `Math.random` or network access. Pages
 * import `buildExperienceViewModel` from `@/fixtures/selectors` and never
 * shape this data inline.
 *
 * The view-model and row types live with the page JSX, so they are
 * imported type-only from the page module to keep a single source of
 * truth for the shared shapes.
 */

import type {
  DiscoveryRow,
  ExperienceCategory,
  ExperienceRecord,
  ExperienceTabDescriptor,
  ExperienceViewModel,
  PopularExperience,
  QuickAction,
  SummaryCardVm,
  ValueOverviewVm,
} from "@/features/experience/experience-page";

// ---------------------------------------------------------------------------
// Locked default tabs (page-specs §14 — 7 tabs in approved order)
// ---------------------------------------------------------------------------

const DEFAULT_TABS: ReadonlyArray<ExperienceTabDescriptor> = [
  { id: "all", label: "全部" },
  { id: "topic", label: "选题策划" },
  { id: "script", label: "脚本结构" },
  { id: "shoot", label: "拍摄执行" },
  { id: "edit", label: "后期剪辑" },
  { id: "engage", label: "互动运营" },
  { id: "review", label: "复盘沉淀" },
];

// ---------------------------------------------------------------------------
// Locked default summary cards (4 cards; matches the 4 KPIs visible in
// the reference image).
// ---------------------------------------------------------------------------

const DEFAULT_SUMMARY_CARDS: ReadonlyArray<SummaryCardVm> = [
  {
    id: "exp-m-total",
    label: "总经验沉淀",
    value: "642",
    delta: "+18",
    trend: "up",
    tone: "positive",
  },
  {
    id: "exp-m-verified",
    label: "已验证经验",
    value: "386",
    delta: "+12",
    trend: "up",
    tone: "positive",
  },
  {
    id: "exp-m-reuse",
    label: "平均复用率",
    value: "62%",
    delta: "+4%",
    trend: "up",
    tone: "info",
  },
  {
    id: "exp-m-improvement",
    label: "待改进项",
    value: "24",
    delta: "-3",
    trend: "down",
    tone: "warning",
  },
];

// ---------------------------------------------------------------------------
// Locked default discoveries (list with effect data column)
// ---------------------------------------------------------------------------

const DEFAULT_DISCOVERIES: ReadonlyArray<DiscoveryRow> = [
  {
    id: "disc-1",
    title: "反差开场在科普类内容里效果最佳",
    source: "AI Native Browser",
    type: "脚本结构",
    effectLabel: "完播率 +14%",
  },
  {
    id: "disc-2",
    title: "凌晨 11 点发布的短视频评论率更高",
    source: "Creator 访谈 EP01",
    type: "互动运营",
    effectLabel: "评论率 +22%",
  },
  {
    id: "disc-3",
    title: "字幕字体加粗能显著提升移动端完播",
    source: "Prompt Craft EP01",
    type: "后期剪辑",
    effectLabel: "完播率 +9%",
  },
  {
    id: "disc-4",
    title: "失败案例：长铺垫开头会让用户流失",
    source: "第二大脑搭建手册",
    type: "复盘沉淀",
    effectLabel: "流失率 +18%",
  },
];

// ---------------------------------------------------------------------------
// Locked default categories (6 cards including failures)
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES: ReadonlyArray<ExperienceCategory> = [
  { id: "experience-topic", name: "选题策划", count: 124, tone: "brand" },
  { id: "experience-script", name: "脚本结构", count: 86, tone: "info" },
  { id: "experience-shoot", name: "拍摄执行", count: 72, tone: "success" },
  { id: "experience-edit", name: "后期剪辑", count: 64, tone: "info" },
  { id: "experience-engage", name: "互动运营", count: 48, tone: "warning" },
  { id: "experience-failures", name: "失败案例", count: 36, tone: "warning" },
];

// ---------------------------------------------------------------------------
// Locked default records (recent records table)
// ---------------------------------------------------------------------------

const DEFAULT_RECORDS: ReadonlyArray<ExperienceRecord> = [
  {
    id: "rec-1",
    title: "反差开场公式 · 科普类",
    category: "脚本结构",
    updatedAt: "2026-05-30",
    reuseCount: 18,
  },
  {
    id: "rec-2",
    title: "凌晨发布窗口 · 短视频",
    category: "互动运营",
    updatedAt: "2026-05-22",
    reuseCount: 12,
  },
  {
    id: "rec-3",
    title: "字幕加粗 · 移动端",
    category: "后期剪辑",
    updatedAt: "2026-05-15",
    reuseCount: 9,
  },
  {
    id: "rec-4",
    title: "失败案例 · 长铺垫开头",
    category: "复盘沉淀",
    updatedAt: "2026-05-08",
    reuseCount: 6,
  },
  {
    id: "rec-5",
    title: "选题切入角度 · 趋势观察",
    category: "选题策划",
    updatedAt: "2026-04-30",
    reuseCount: 11,
  },
];

// ---------------------------------------------------------------------------
// Locked default value overview + application effect + popular + actions
// ---------------------------------------------------------------------------

const DEFAULT_VALUE_OVERVIEW: ValueOverviewVm = {
  totalLabel: "总经验沉淀 642",
  verifiedLabel: "已验证 386",
  reuseRate: 62,
  improvementLabel: "待改进 24",
};

const DEFAULT_APPLICATION_EFFECT: ReadonlyArray<{
  readonly label: string;
  readonly value: number;
}> = [
  { label: "2 月", value: 24 },
  { label: "3 月", value: 36 },
  { label: "4 月", value: 52 },
  { label: "5 月", value: 68 },
  { label: "6 月", value: 84 },
];

const DEFAULT_POPULAR_EXPERIENCES: ReadonlyArray<PopularExperience> = [
  {
    id: "pop-1",
    title: "反差开场公式 · 科普类",
    category: "脚本结构",
    usage: "被引用 18 次",
  },
  {
    id: "pop-2",
    title: "凌晨发布窗口 · 短视频",
    category: "互动运营",
    usage: "被引用 12 次",
  },
  {
    id: "pop-3",
    title: "字幕加粗 · 移动端",
    category: "后期剪辑",
    usage: "被引用 9 次",
  },
];

const DEFAULT_QUICK_ACTIONS: ReadonlyArray<QuickAction> = [
  {
    id: "qa-new",
    label: "新建经验",
    hint: "把这次的复盘沉淀下来",
  },
  {
    id: "qa-import",
    label: "从项目导入",
    hint: "把已发布项目作为经验",
  },
  {
    id: "qa-failure",
    label: "记录失败案例",
    hint: "失败也要被记住",
  },
];

// ---------------------------------------------------------------------------
// View model — pure builder so SSR output is deterministic
// ---------------------------------------------------------------------------

export function buildExperienceViewModel(): ExperienceViewModel {
  return {
    tabs: DEFAULT_TABS,
    summaryCards: DEFAULT_SUMMARY_CARDS,
    discoveries: DEFAULT_DISCOVERIES,
    categories: DEFAULT_CATEGORIES,
    records: DEFAULT_RECORDS,
    valueOverview: DEFAULT_VALUE_OVERVIEW,
    applicationEffect: DEFAULT_APPLICATION_EFFECT,
    popularExperiences: DEFAULT_POPULAR_EXPERIENCES,
    quickActions: DEFAULT_QUICK_ACTIONS,
  };
}
