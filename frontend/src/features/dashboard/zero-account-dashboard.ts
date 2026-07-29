/**
 * [T-348] 0 号(未绑定任何抖音号)首页的**诚实空 dashboard 视图模型**。
 *
 * 全隔离语义(T-332 S2):0 号没有任何 per-account 数据空间,`pages.dashboard.get`
 * 会抛 AccountRequiredError(strict 门)。首页 route(app/(creator)/page.tsx)捕获后
 * 用本模型降级渲染 —— 顶部 OnboardingCard 引导用户先绑号,其余各卡走**既有诚实空态**:
 *   - 指标全部占位「—」(诚实:还没有数据,不是「0 播放」的假象);
 *   - continueCreating=null → 「还没有进行中的项目」空态;
 *   - todos / trendingTopics / recentPublications / suggestions 全空 → 各自诚实空态;
 *   - dataOverview.trend=[] → 「暂无本周播放趋势」空态。
 *
 * **产品宪法:严禁假数据**。这里不塞任何演示项目 / 演示指标 —— 与 fixtures 的
 * buildDashboardViewModel(演示用)刻意分开:那份是 demo 数据,这份是 0 号真空态。
 */

import type { DashboardViewModel, MetricCard } from "@/types/view-models";

/**
 * 0 号占位指标(5 张,与真实 dashboard 同 id / 同标签 / 同序,保住「一排五指标」视觉恒等式)。
 * 值占位「—」;delta="" → MetricCard 不渲染环比徽标(见 metric-card §T-054);tone 中性。
 */
const ZERO_ACCOUNT_METRICS: ReadonlyArray<MetricCard> = [
  { id: "m-active-projects", label: "进行中项目", value: "—", delta: "", trend: "flat", tone: "neutral" },
  { id: "m-publications", label: "已完成", value: "—", delta: "", trend: "flat", tone: "neutral" },
  { id: "m-views", label: "累计播放", value: "—", delta: "", trend: "flat", tone: "neutral" },
  { id: "m-assets", label: "素材库", value: "—", delta: "", trend: "flat", tone: "neutral" },
  { id: "m-storage", label: "存储使用", value: "—", delta: "", trend: "flat", tone: "neutral" },
];

/**
 * 构造 0 号首页降级视图模型(诚实空:无项目、无发布、无趋势、无待办/建议 → 各卡空态引导)。
 * scenario="empty" 标记这是空态场景(与 default 的真实数据区分)。
 */
export function zeroAccountDashboardViewModel(): DashboardViewModel {
  return {
    scenario: "empty",
    kind: "dashboard",
    metrics: ZERO_ACCOUNT_METRICS,
    continueCreating: null,
    todos: [],
    scheduleReminderReadState: { state: "ready", error: null },
    trendingTopics: [],
    recentPublications: [],
    dataOverview: { metrics: [], trend: [] },
    suggestions: [],
    assistantPrompt: "先绑定一个抖音号,开始你的第一步。",
    loading: false,
    error: null,
  };
}
