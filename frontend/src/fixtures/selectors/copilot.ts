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

// [T-231⑨] chips 从「填 label 的字条」升级为真预调:每个 chip 绑语义最贴的 functionKey
// (发送时置顶该工具,服务端 applyFunctionKey/forcedTool)+ 完整预填话术(与
// ai-copilot-content 的 FUNCTION_KEY_PREFILL 同词条;预填不自动发,T-055b 铁律)。
// 原「优化标题」chip 已删 —— 没有对应工具(诚实优先,不摆做不到的按钮)。
const SUGGESTED_ACTIONS: CopilotContentViewModel["chips"] = [
  {
    id: "analyze",
    label: "分析机会",
    icon: "crosshair",
    functionKey: "topic.generate",
    prefill: "基于我的定位和真实信号,出一批选题候选。",
  },
  {
    id: "script",
    label: "生成脚本",
    icon: "wand",
    functionKey: "script.draft",
    prefill: "帮我为这条内容起草一版完整的分镜口播脚本。",
  },
  {
    id: "assets",
    label: "寻找素材",
    icon: "file-search",
    functionKey: "material.gather",
    prefill: "围绕这条内容的主题帮我搜一批可用素材(案例、数据、金句)。",
  },
  {
    id: "cover",
    label: "生成封面",
    icon: "image",
    functionKey: "material.generate",
    // 话术明确依赖生图模型(未配时工具卡已有「去设置」降级,不另做禁用逻辑)。
    prefill:
      "帮我为这条内容生成几张封面图候选(走我在设置里配置的生图模型;如果我还没配生图模型,请直接告诉我并指路去设置配置)。",
  },
  {
    id: "review",
    label: "发布复盘",
    icon: "line-chart",
    functionKey: "review.analyze",
    prefill: "帮我复盘,提炼可复用的爆款要素沉淀成经验。",
  },
];

// [T-231⑨] 推荐指令同机制升级:绑 functionKey + 完整预填话术(点了填输入框,不自动发)。
// 原「优化标题和封面」改为「生成封面候选」——「优化标题」无对应工具(同 chips 的删除理由),
// 封面有真工具 material.generate,保留有真能力的那半。
const RECOMMENDED_COMMANDS: CopilotContentViewModel["recommendedCommands"] = [
  {
    id: "topic-from-positioning",
    icon: "crosshair",
    tone: "pink",
    title: "基于我的定位出选题",
    description: "结合账号画像生成选题候选",
    functionKey: "topic.generate",
    prefill: "基于我的定位和真实信号,出一批选题候选。",
  },
  {
    id: "video-script",
    icon: "file",
    tone: "violet",
    title: "生成视频脚本大纲",
    description: "基于主题生成结构化脚本",
    functionKey: "script.draft",
    prefill: "帮我为这条内容起草一版完整的分镜口播脚本。",
  },
  {
    id: "find-assets",
    icon: "file-search",
    tone: "mint",
    title: "寻找相关素材",
    description: "在全局素材库中搜索相关素材",
    functionKey: "material.gather",
    prefill: "围绕这条内容的主题帮我搜一批可用素材(案例、数据、金句)。",
  },
  {
    id: "generate-cover",
    icon: "sparkles",
    tone: "orange",
    title: "生成封面候选",
    description: "用配置的生图模型生成封面图候选",
    functionKey: "material.generate",
    prefill:
      "帮我为这条内容生成几张封面图候选(走我在设置里配置的生图模型;如果我还没配生图模型,请直接告诉我并指路去设置配置)。",
  },
  {
    id: "publish-review",
    icon: "line-chart",
    tone: "indigo",
    title: "发布效果复盘",
    description: "分析发布数据并给出优化建议",
    functionKey: "review.analyze",
    prefill: "帮我复盘,提炼可复用的爆款要素沉淀成经验。",
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
// [T-231⑨] 快速开始同机制升级:title 即预填话术,另绑语义工具置顶。
const SMART_RECOMMENDATIONS: CopilotContentViewModel["smartRecommendations"] = [
  { id: "rec-1", title: "基于我的定位出 5 个选题", functionKey: "topic.generate" },
  { id: "rec-2", title: "帮我复盘最近一条发布", functionKey: "review.analyze" },
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
