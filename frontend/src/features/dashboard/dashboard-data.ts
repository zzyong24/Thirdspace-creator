import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  CreationSuggestion,
  DashboardViewModel,
  TodoRow,
} from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

/**
 * 今日台 读侧装配(T-063b · 北极星 SPEC §3)。
 *
 * 首页从「路标」变「行动队列」:统一队列列出今天该干的事,六类源全部复用既有读 op
 * (无新契约),装配失败逐源降级(该源不渲行),只有核心 `pages.dashboard.get` 失败
 * 才整页错误态 —— 降级写法参照 experience-data.ts。
 *
 * 六类源 → 读法:
 *   1. project     进行中项目的下一步  ← getDashboard 的 todos(阶段推进类)+ suggestions
 *   2. publish     该发布/该复盘       ← 同一 todos 里 stage=publishing/review 的分类
 *   3. candidate   待裁决选题          ← candidates.list 里 status=pool 的 top 3
 *   4. learning    待裁决经验          ← learnings.list 里 validationStatus=candidate
 *   5. calibration 待采纳校准建议      ← calibration.suggestions.list(读侧只有 pending)
 *   6. signal      新采集信号          ← audienceSignals.list 最近 24h 计数(倒序分页首页)
 */

// ---------------------------------------------------------------------------
// ViewModel 类型
// ---------------------------------------------------------------------------

/** 队列行的六类源(data-kind 同名)。 */
export type TodayActionKind =
  | "project"
  | "candidate"
  | "learning"
  | "calibration"
  | "publish"
  | "signal";

/** 单条行动:一句话(带真实对象名/数字)+ 一键直达链接。 */
export interface TodayActionVm {
  readonly id: string;
  readonly kind: TodayActionKind;
  readonly text: string;
  readonly href: string;
}

export interface TodayViewModel {
  /** 核心 getDashboard 读失败 → true,页面渲染整页错误态。 */
  readonly loadError: boolean;
  /** 问候头/继续创作卡/趋势行的数据源(loadError 时为 null)。 */
  readonly dashboard: DashboardViewModel | null;
  /** 行动队列(六类源装配;全空 → 页面渲染引导空态)。 */
  readonly actions: ReadonlyArray<TodayActionVm>;
}

// ---------------------------------------------------------------------------
// 读侧 client seam(最小结构 DTO,只读用到的字段;单测注入假 client)
// ---------------------------------------------------------------------------

interface CandidateDto {
  readonly id: string;
  readonly title: string;
  readonly status: "pool" | "promoted" | "dropped";
}

interface LearningDto {
  readonly id: string;
  readonly title: string;
  readonly validationStatus: "candidate" | "validated" | "discarded";
  readonly createdAt: string;
}

interface RuleSuggestionDto {
  readonly id: string;
}

interface AudienceSignalDto {
  readonly id: string;
  readonly createdAt: string;
}

export interface TodayDataClient {
  getDashboard(input: {
    params: undefined;
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listCandidates(input: {
    params: undefined;
    query: { page: number; pageSize: number; sort: string };
    body: undefined;
  }): Promise<unknown>;
  listLearnings(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listRuleSuggestions(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listAudienceSignals(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// 路由助手(原 dashboard-page 的深链逻辑,随队列装配迁到读侧)
// ---------------------------------------------------------------------------

// 六个有真实 `/projects/<id>/<stage>` 路由的项目阶段。TodoRow.stage 也可能是
// OutputStageName(recording/editing/…),无阶段路由 → 回落项目总览。
const PROJECT_STAGE_ROUTES: ReadonlySet<ProjectStageName> = new Set([
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
]);

function isProjectStageRoute(stage: string): stage is ProjectStageName {
  return PROJECT_STAGE_ROUTES.has(stage as ProjectStageName);
}

/** todo 深链:真实阶段 → 阶段工作面;否则项目总览。 */
function todoHref(todo: TodoRow): string {
  return isProjectStageRoute(todo.stage)
    ? `/projects/${todo.projectId}/${todo.stage}`
    : `/projects/${todo.projectId}`;
}

/**
 * 创作建议的深链(原 suggestionCta 逻辑):选题/研究类 → 作品页候选 tab
 * (T-063a 后 /topics 已 301);阶段类 → 活跃项目的该阶段;其余 → 新项目。
 */
function suggestionHref(
  category: string,
  activeProjectId: string,
): string | null {
  if (category === "research" || category === "topic" || category === "planning") {
    return "/projects?tab=candidates";
  }
  if (isProjectStageRoute(category)) {
    return `/projects/${activeProjectId}/${category}`;
  }
  // [T-063b 修] 无真实落点的建议(多为经验提示文本)不进行动队列 —— 之前 fallback
  // /projects/new 让「推进」按钮变假行动(点了到新建页,与建议内容无关)。经验类
  // 提示的正确归宿是 learnings 源(源 4)或对话,不在这里冒充项目下一步。
  return null;
}

// ---------------------------------------------------------------------------
// 六类源装配
// ---------------------------------------------------------------------------

/** 队列里项目推进类行的上限 —— 保持「今天」的聚焦感,不铺全量任务表。 */
const MAX_PROJECT_ROWS = 6;

/**
 * 源 1+2(project / publish):getDashboard 的 todos + suggestions。
 * stage=publishing/review 的 todo 归「该发布/该复盘」(kind=publish),其余为阶段推进
 * (kind=project);suggestions 同理按 category 分流 —— 不造新契约,用现成分类判定。
 */
function actionsFromDashboard(vm: DashboardViewModel): TodayActionVm[] {
  const projectRows: TodayActionVm[] = [];
  const publishRows: TodayActionVm[] = [];

  for (const todo of vm.todos) {
    if (todo.stage === "publishing") {
      publishRows.push({
        id: `publish-${todo.id}`,
        kind: "publish",
        text: `「${todo.projectTitle}」该发布了:${todo.title}`,
        href: todoHref(todo),
      });
    } else if (todo.stage === "review") {
      publishRows.push({
        id: `publish-${todo.id}`,
        kind: "publish",
        text: `「${todo.projectTitle}」该复盘了:${todo.title}`,
        href: todoHref(todo),
      });
    } else {
      projectRows.push({
        id: `project-${todo.id}`,
        kind: "project",
        text: `「${todo.projectTitle}」下一步:${todo.title}`,
        href: todoHref(todo),
      });
    }
  }

  for (const s of vm.suggestions as ReadonlyArray<CreationSuggestion>) {
    const href = suggestionHref(s.category, vm.continueCreating.projectId);
    if (href === null) continue; // 无真实落点 → 不进队列(诚实:队列每行必须可干)
    if (s.category === "publishing" || s.category === "review") {
      publishRows.push({
        id: `publish-${s.id}`,
        kind: "publish",
        text: `${s.title}:${s.description}`,
        href,
      });
    } else {
      projectRows.push({
        id: `project-${s.id}`,
        kind: "project",
        text: `${s.title}:${s.description}`,
        href,
      });
    }
  }

  return [...projectRows.slice(0, MAX_PROJECT_ROWS), ...publishRows];
}

/** 源 3(candidate):status=pool 的候选 top 3 → 一行汇总 + 直达候选 tab。 */
async function candidateAction(
  client: TodayDataClient,
): Promise<TodayActionVm | null> {
  const rows = (await client.listCandidates({
    params: undefined,
    query: { page: 1, pageSize: 100, sort: "predictedScore" },
    body: undefined,
  })) as ReadonlyArray<CandidateDto>;
  const pool = rows.filter((c) => c.status === "pool");
  if (pool.length === 0) return null;
  const top = pool.slice(0, 3).map((c) => `「${c.title}」`).join("");
  const ellipsis = pool.length > 3 ? "…" : "";
  return {
    id: "candidate-pool",
    kind: "candidate",
    text: `${pool.length} 条选题候选待评估:${top}${ellipsis}`,
    href: "/projects?tab=candidates",
  };
}

/** 源 4(learning):validationStatus=candidate 计数 + 最新一条 title。 */
async function learningAction(
  client: TodayDataClient,
): Promise<TodayActionVm | null> {
  const rows = (await client.listLearnings({
    params: undefined,
    query: { page: 1, pageSize: 200 },
    body: undefined,
  })) as ReadonlyArray<LearningDto>;
  const candidates = rows
    .filter((l) => l.validationStatus === "candidate")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (candidates.length === 0) return null;
  return {
    id: "learning-adjudicate",
    kind: "learning",
    text: `${candidates.length} 条经验待裁决:最新「${candidates[0].title}」`,
    href: "/library?tab=experience",
  };
}

/** 源 5(calibration):pending 规则建议计数(读侧只返回 pending,见 calibration.service)。 */
async function calibrationAction(
  client: TodayDataClient,
): Promise<TodayActionVm | null> {
  const rows = (await client.listRuleSuggestions({
    params: undefined,
    query: { page: 1, pageSize: 200 },
    body: undefined,
  })) as ReadonlyArray<RuleSuggestionDto>;
  if (rows.length === 0) return null;
  return {
    id: "calibration-pending",
    kind: "calibration",
    text: `${rows.length} 条校准规则建议待采纳`,
    href: "/settings?tab=calibration",
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 源 6(signal):audience_signals 最近 24h 计数。列表按 createdAt 倒序
 * (candidate.repository listSignals),首页 100 条内数 24h 窗口即够诚实
 * (超 100 条/天时显示的是保守下界,不编数)。
 */
async function signalAction(
  client: TodayDataClient,
  now: Date,
): Promise<TodayActionVm | null> {
  const rows = (await client.listAudienceSignals({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as ReadonlyArray<AudienceSignalDto>;
  const cutoff = now.getTime() - DAY_MS;
  const fresh = rows.filter((s) => {
    const t = Date.parse(s.createdAt ?? "");
    return Number.isFinite(t) && t >= cutoff;
  });
  if (fresh.length === 0) return null;
  // 首页 100 条全部落在窗口内 ⇒ 真实数可能更多,显示「100+」而不是假装恰好 100(诚实下界)。
  const capped = rows.length >= 100 && fresh.length === rows.length;
  return {
    id: "signal-fresh",
    kind: "signal",
    text: `今天有 ${fresh.length}${capped ? "+" : ""} 条新评论信号`,
    href: "/projects?tab=candidates",
  };
}

// ---------------------------------------------------------------------------
// 装配入口
// ---------------------------------------------------------------------------

const ERROR_VM: TodayViewModel = {
  loadError: true,
  dashboard: null,
  actions: [],
};

/**
 * 装配今日台 ViewModel。核心 `getDashboard` 失败 → `loadError: true`(整页错误态,
 * 禁 fixture 兜底);其余四个源逐一 try/catch,失败只是该源不渲行(诚实降级)。
 *
 * @param now 时间种子(signal 源的 24h 窗口);测试注入固定值保确定性。
 */
export async function buildTodayViewModel(
  client: TodayDataClient = defaultClient as unknown as TodayDataClient,
  now: Date = new Date(),
): Promise<TodayViewModel> {
  let dashboard: DashboardViewModel;
  try {
    dashboard = (await client.getDashboard({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as DashboardViewModel;
  } catch {
    return ERROR_VM;
  }

  // 逐源降级:失败 → null(该源不渲行),绝不拖垮整页。
  const [candidate, learning, calibration, signal] = await Promise.all([
    candidateAction(client).catch(() => null),
    learningAction(client).catch(() => null),
    calibrationAction(client).catch(() => null),
    signalAction(client, now).catch(() => null),
  ]);

  const actions: TodayActionVm[] = [
    ...actionsFromDashboard(dashboard),
    ...[candidate, learning, calibration, signal].filter(
      (a): a is TodayActionVm => a !== null,
    ),
  ];

  return { loadError: false, dashboard, actions };
}
