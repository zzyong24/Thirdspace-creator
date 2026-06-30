/**
 * AI Copilot selector.
 *
 * Maps fixture data to the `CopilotContentViewModel` consumed by the AI
 * Copilot dialog content. The Copilot dialog is a fixture-only surface
 * (page-specs §16 "禁止改变": no real agent network, D-001) so the data
 * is a locked, deterministic block rather than a projection over the
 * relational canonical entities — but it now flows through the selector
 * layer like every other page so the dialog content imports
 * `buildCopilotViewModel` instead of owning inline fixture constants.
 *
 * Pure and deterministic — no `Date.now`, `Math.random` or network.
 */

import type { CopilotContentViewModel } from "@/features/copilot/ai-copilot-content";

const SUGGESTED_ACTIONS: CopilotContentViewModel["chips"] = [
  { id: "analyze", label: "分析机会", icon: "crosshair" },
  { id: "script", label: "生成脚本", icon: "wand" },
  { id: "assets", label: "寻找素材", icon: "file-search" },
  { id: "title", label: "优化标题", icon: "sparkles" },
  { id: "cover", label: "生成封面", icon: "image" },
  { id: "review", label: "发布复盘", icon: "line-chart" },
];

const RECOMMENDED_COMMANDS: CopilotContentViewModel["recommendedCommands"] = [
  {
    id: "topic-from-positioning",
    icon: "crosshair",
    tone: "pink",
    title: "基于我的定位出选题",
    description: "结合账号画像生成选题候选",
  },
  {
    id: "video-script",
    icon: "file",
    tone: "violet",
    title: "生成视频脚本大纲",
    description: "基于主题生成结构化脚本",
  },
  {
    id: "find-assets",
    icon: "file-search",
    tone: "mint",
    title: "寻找相关素材",
    description: "在全局素材库中搜索相关素材",
  },
  {
    id: "title-cover",
    icon: "sparkles",
    tone: "orange",
    title: "优化标题和封面",
    description: "生成更吸引人的标题和封面",
  },
  {
    id: "publish-review",
    icon: "line-chart",
    tone: "indigo",
    title: "发布效果复盘",
    description: "分析发布数据并给出优化建议",
  },
];

const RECENT_TASKS: CopilotContentViewModel["recentTasks"] = [
  {
    id: "task-1",
    title: "分析 AI Native Browser 的核心机会",
    project: "AI Native Browser 深度解析",
    meta: "2 小时前",
  },
  {
    id: "task-2",
    title: "生成脚本：浏览器隐私趋势",
    project: "下一代浏览器的机会与未来",
    meta: "昨天 16:30",
  },
  {
    id: "task-3",
    title: "寻找 B-roll 素材：用户使用场景",
    project: "AI 浏览器功能拆解",
    meta: "昨天 10:15",
  },
  {
    id: "task-4",
    title: "优化标题：AI 浏览器真的来了吗？",
    project: "AI Native Browser 深度解析",
    meta: "2 天前",
  },
  {
    id: "task-5",
    title: "复盘视频发布效果",
    project: "Comet 产品分析报告",
    meta: "3 天前",
  },
];

// 继续任务原为 cont-1..4 硬编码 fixture。Copilot 需要一个 CROSS-project 的进行中
// 任务流,而该 op 尚不存在(projects.tasks.list 是 project-scoped — 见 INTERACTION_SPEC
// GAP-COP-1 / D-COP-a)。与其把假任务伪装成真进度,不如返回空数组让 UI 渲染诚实空态
// 「暂无进行中的任务」并保留「规划中」徽章,直到全局任务流 op 落地。
const CONTINUING_TASKS: CopilotContentViewModel["continuingTasks"] = [];

const QUICK_ENTRIES: CopilotContentViewModel["quickEntries"] = [
  { id: "new-project", icon: "plus", title: "新建项目" },
  { id: "open-project", icon: "folder", title: "打开项目" },
  { id: "search", icon: "search", title: "全局搜索" },
  { id: "assets", icon: "image", title: "素材中心" },
  { id: "publish", icon: "send", title: "发布中心" },
  { id: "knowledge", icon: "book", title: "知识库" },
];

// bug #5:原为「分析竞品策略 / 寻找最新数据」——「竞品/对标」方向已砍(用户决策),且这块原配的
// 「检测到你最近在研究『AI 浏览器』」是 fixture 假数据。改成不编造来源、不涉对标的通用创作起点,
// 点了直接填入对话框,走真实后端。
const SMART_RECOMMENDATIONS: CopilotContentViewModel["smartRecommendations"] = [
  { id: "rec-1", title: "基于我的定位出 5 个选题" },
  { id: "rec-2", title: "帮我复盘最近一条发布" },
];

export function buildCopilotViewModel(): CopilotContentViewModel {
  return {
    scenario: "default",
    kind: "ai-copilot",
    prompt: "",
    chips: SUGGESTED_ACTIONS,
    recommendedCommands: RECOMMENDED_COMMANDS,
    recentTasks: RECENT_TASKS,
    continuingTasks: CONTINUING_TASKS,
    quickEntries: QUICK_ENTRIES,
    smartRecommendations: SMART_RECOMMENDATIONS,
    loading: false,
    error: null,
  };
}
