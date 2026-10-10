"use client";

/**
 * `AutomationsIsland` —— 自动化 /automations 的 client 交互层(T-007 D6)。
 *
 * 承载 D6 全部读/管交互(纯前端 over D1 契约 op,不碰执行层 D3/D5):
 *  1. 作业列表:每行 name / source_kind(自己作品|评论)/ schedule(cron)/ enabled 开关 /
 *     last_run_at / next_run_at / 最近一次 run 的 status(正常/需重连 Chrome/失败)。
 *     读 scheduledJobs.list(server 首屏传入),行内展开时读 jobRuns.listByJob 取最近 run。
 *  2. 启用开关:Switch toggle → scheduledJobs.setEnabled → router.refresh()。
 *  3. 新建作业:居中 Dialog(照选题弹窗范式)录入 name / source_kind(下拉 self.metrics|comments)
 *     / schedule(cron 文本)/ target(externalSourceId 或 awemeId,按源切换)→ scheduledJobs.create。
 *  4. 运行详情抽屉:点某作业 → 读 jobRuns.listByJob 列历史 run(startedAt/status/itemsNew/
 *     itemsUpdated)+ 选中某 run → 读其 ai_task_id 对应 ai_task_steps(复用 listTaskSteps
 *     渲染范式;run 未产 ai_task 或步骤为空时诚实空态)。
 *  5. 「立即运行」(D5):点击 → scheduledJobs.runNow(手动产 ai_task + job_run,fire-and-forget,
 *     走 triggerScheduledJob 幂等双闸)→ 自动打开运行详情抽屉轮询 ai_task_steps。
 *  6. 「扫码绑定」恢复(D4,SPEC §6):某作业最近一次 run 是 needs_reconnect(登录态过期,调度器
 *     停跑)→ 该行红标「需重连 Chrome」+「扫码绑定」按钮 → 点击调 ingestion.douyin.login(headed
 *     弹 Chromium 扫码,复用 calibration 的现成登录链)→ 登录成功后调 scheduledJobs.runNow 触发
 *     一次恢复(下次到点调度器见最近 run 非 needs_reconnect 自动恢复自动跑)。
 *
 * 最近 run 状态:island 挂载时批量拉每个 job 的最近一次 run(jobRuns.listByJob limit 1)→
 * 每行据此判 needs_reconnect(红标 + 扫码绑定)/ 正常(立即运行)。
 *
 * 诚实空态:D3 采集器尚未落地前,list 可为空(引导空态)、job_run 可为空(抽屉空态)。
 * 不写死、不假装有数据 —— 每个数字都追得到真实 job_run / ai_task_steps。
 *
 * 诚实缺口:「扫码绑定」是 headed 扫码(开本地 Chromium),真恢复卡用户扫码 —— dev 本机可跑,
 * 真扫码恢复待用户。绝不假装登录过。
 *
 * Determinism:唯一非确定来源是用户显式交互;开关/新建/立即运行后 router.refresh() 重读列表。
 */

import * as React from "react";
import {ENDPOINTS, createClient, type AccountCollectionPlanReadinessResource} from "@creatoros/contract";
import {createHttpTransport, HttpTransportError, type FrozenWorkspaceScope} from "@/lib/http-transport";
import { useRouter } from "next/navigation";
import { useAccountsChanged } from "@/lib/account-events";
import {
  Plus,
  Pencil,
  Clock,
  AtSign,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  MessageSquare,
  BarChart3,
  Gauge,
  Inbox,
  Sparkles,
  Flame,
  Lightbulb,
  Star,
  Radar,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import {describeUserError} from "@/lib/ai-error-humanize";
function describeAutomationError(error:unknown,fallback:string){
  if(error instanceof HttpTransportError&&error.details.reason==="account_archived")return "此账号已归档，可查看历史；恢复账号后再管理计划。";
  return describeUserError(error,fallback);
}
import { notifyAccountsChanged } from "@/lib/account-events";
import { Switch } from "@/components/ui/switch";

// [T-359] 新绑号分层启用:默认关的任务开关旁写明**启用前置**(条件齐了一键开)。
// 与 collection-bootstrap 的 enabledByDefault 分层对齐;仅 job 禁用时显示,不啰嗦。
const ENABLEMENT_HINTS: Record<string, string> = {
  favorites: "先去 内容雷达 → 我的收藏 绑定收藏夹",
  benchmark: "先去 内容雷达 登记对标博主",
  "topic.daily": "先去 设置 配好文本模型",
  comments: "有导入作品后再开(评论抓自己作品)",
};

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ScheduledJobResource,
  JobRunResource,
} from "@creatoros/backend/modules/scheduling";
import {
  type Cadence,
  DEFAULT_CADENCE,
  WEEKDAY_LABELS,
  compileCadenceToCron,
  compileCronToCadence,
  describeCadence,
} from "./cadence";
import {
  type CollectionTemplate,
  type SourceKind,
  COLLECTION_TEMPLATES,
} from "./intent";

// 普通创建仅作品、评论和每日选题。流量与内容补全由系统补建，可编辑既有作业。
const SOURCE_META: Partial<
  Record<
    SourceKind,
    { label: string; icon: LucideIcon; targetLabel: string; targetKey: string; targetPlaceholder: string }
  >
> = {
  "self.metrics": {
    label: "作品数据",
    icon: BarChart3,
    targetLabel: "作品来源标识",
    targetKey: "externalSourceId",
    targetPlaceholder: "externalSourceId(留空=抓主页全部作品)",
  },
  comments: {
    label: "评论",
    icon: MessageSquare,
    targetLabel: "作品 awemeId",
    targetKey: "awemeId",
    targetPlaceholder: "awemeId(要抓评论的作品 id)",
  },
  // 仅 __backfillOnly 的新内容补全作业进入列表，未知旧 detail 行仍隐藏。
  "self.detail": {
    label: "封面与内容补全",
    icon: Gauge,
    targetLabel: "作品来源标识",
    targetKey: "externalSourceId",
    targetPlaceholder: "externalSourceId(留空=导出主页全部作品明细)",
  },
};

// 不进 SOURCE_META 的 sourceKind 展示名兜底；退役 kind 只服务历史数据读取。
const EXTRA_SOURCE_LABELS: Record<string, string> = {
  benchmark: "对标爆款",
  "topic.daily": "每日选题",
  favorites: "收藏夹跟拍",
  "intelligence.sync": "内容雷达",
  "self.traffic": "流量来源",
};
const COLLECTION_PRIORITY_LABELS:Record<string,string>={"self.metrics":"作品优先","self.traffic":"流量其次",comments:"评论后台","self.detail":"封面与内容后台"};

// [T-258] 登记源驱动源的模板卡图标(SOURCE_META 无 icon 时兜底,让 6 张卡视觉可辨)。
const EXTRA_SOURCE_ICONS: Record<string, LucideIcon> = {
  benchmark: Flame,
  "topic.daily": Lightbulb,
  favorites: Star,
  "intelligence.sync": Radar,
};

function sourceLabel(kind: string): string {
  return (
    SOURCE_META[kind as SourceKind]?.label ?? EXTRA_SOURCE_LABELS[kind] ?? kind
  );
}

// job_run.status → 中文态 + 视觉。SPEC §4/§6:running|succeeded|failed|needs_reconnect。
type RunStatus = "running" | "succeeded" | "failed" | "needs_reconnect";

const RUN_STATUS_META: Record<
  RunStatus,
  { label: string; icon: LucideIcon; tone: string }
> = {
  running: { label: "运行中", icon: Loader2, tone: "text-brand" },
  succeeded: { label: "完成", icon: CheckCircle2, tone: "text-emerald-600" },
  failed: { label: "失败", icon: AlertTriangle, tone: "text-destructive" },
  // needs_reconnect 醒目:琥珀强调 + 边框底色(T-032b ③),让用户一眼知道要去扫码,别当普通失败略过。
  needs_reconnect: {
    label: "需重连账号",
    icon: RefreshCw,
    tone: "text-amber-600",
  },
};

function runStatusMeta(status: string) {
  return (
    RUN_STATUS_META[status as RunStatus] ?? {
      label: status,
      icon: Clock,
      tone: "text-muted-foreground",
    }
  );
}

// ── T-152 实时采集进度 ─────────────────────────────────────────────────────────
//
// job_run.progress(running 态由采集器 best-effort + 节流写入,前端 2s 轮询已存在)。
// 形状:{ stage, processed, total, message?, updatedAt }。旧 run / 未上报 → null(向后兼容)。

// 采集阶段 key → 中文可读标签(采集器上报的 stage 键)。未知 key 原样显示(诚实降级)。
const PROGRESS_STAGE_LABELS: Record<string, string> = {
  waiting: "等待继续",
  starting: "准备采集",
  login: "校验登录态",
  fetch: "抓取作品",
  cover_backfill: "回填封面",
  comments: "抓取评论",
  export: "导出明细",
  parse: "解析明细",
  ingest: "保存数据",
};

interface RunProgress {
  stage: string;
  processed: number;
  total: number | null;
  message?: string;
  updatedAt?: string;
}

// 宽松读 run.progress(jsonb 自由形状 / 旧脏数据 → 兜住,读不出返 null 不崩)。
function readRunProgress(raw: unknown): RunProgress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.stage !== "string") return null;
  const processed = typeof p.processed === "number" ? p.processed : 0;
  const total = typeof p.total === "number" ? p.total : null;
  return {
    stage: p.stage,
    processed,
    total,
    message: typeof p.message === "string" ? p.message : undefined,
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : undefined,
  };
}

// 进度文案:优先采集器写的 message(已含条数);无则用「阶段 · 已处理 N[/M]」兜底。
function progressText(p: RunProgress): string {
  const stageLabel = PROGRESS_STAGE_LABELS[p.stage] ?? p.stage;
  if (p.message) return `${stageLabel} · ${p.message}`;
  const count = p.total != null ? `${p.processed}/${p.total}` : `${p.processed}`;
  return `${stageLabel} · 已处理 ${count}`;
}

// 进度百分比(total 已知才算;未知 total 返 null → 前端显不定长条,不假造百分比)。
function progressPercent(p: RunProgress): number | null {
  if (p.total == null || p.total <= 0) return null;
  return Math.min(100, Math.round((p.processed / p.total) * 100));
}

// running 态进度条(total 已知 → 定长填充;未知 → 不定长脉冲条 + 阶段文案)。
function RunProgressBar({ progress }: { readonly progress: RunProgress }) {
  const waiting = progress.stage === "waiting";
  const pct = progressPercent(progress);
  return (
    <div
      data-slot="automation-run-progress"
      data-testid="automation-run-progress"
      data-stage={progress.stage}
      className="mt-1 flex flex-col gap-1"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-brand">
        {waiting ? <Clock className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
        <span className="truncate">{progressText(progress)}</span>
      </div>
      {!waiting && <div className="h-1 w-full overflow-hidden rounded-full bg-brand-soft">
        {pct != null ? (
          // total 已知:定长填充条(百分比)。
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        ) : (
          // total 未知(抖音翻页 has_more 才知有无下一页):不定长脉冲条(诚实不假造百分比)。
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
        )}
      </div>}
    </div>
  );
}

// 一次运行的结果文案(T-032b ③):按 status + itemsNew 分档,替死板的「新增 N · 更新 M」。
// 核心是区分 succeeded-0(已完成·无新数据,别显得像失败)vs needs_reconnect(去扫码)vs failed(显真因)。
function runResultText(run: {
  status: string;
  itemsNew: number;
  itemsUpdated: number;
  error: string | null;
}): string {
  switch (run.status) {
    case "running":
      return "采集进行中…";
    case "succeeded":
      // 已登录、跑完:有新数据报新增;0 条是正常结果(作品本就可能没新增/无新评论),不显得像失败。
      return run.itemsNew > 0
        ? `✅ 新增 ${run.itemsNew} 条${run.itemsUpdated > 0 ? ` · 更新 ${run.itemsUpdated} 条` : ""}`
        : run.itemsUpdated > 0 ? `✅ 更新 ${run.itemsUpdated} 条` : "✅ 已完成 · 无新数据";
    case "needs_reconnect":
      return "⚠️ 需重连账号 · 去扫码绑定";
    case "failed":
      return "❌ 采集失败,请稍后重试;若一直失败,去账号管理重新扫码。";
    default:
      return `新增 ${run.itemsNew} · 更新 ${run.itemsUpdated}`;
  }
}

// ── T-038c 采集限流可观测(SPEC §4.5 [gate-F4])────────────────────────────────
//
// 抖音采集经统一限流网关(DouyinRequestGateway),连续撞风控信号会进 cooldown 退避。
// cooldown 期间采集 job 看似「卡住/静默」——这里把网关的实时退避态透传到自动化,
// 让用户诚实看到「限流保护中,约 N 分钟后重试」,而不是以为死了。数据走只读 op
// ingestion.douyin.throttleStatus(读网关内存镜像,不落表),挂载时拉一次。

// 网关的两个 channel(与 contract douyinChannelThrottleStatus.channel 枚举一致)。
type DouyinChannel = "creator-center" | "iesdouyin";

// 单 channel 的退避快照(前端消费的结构,对齐 contract 的 DouyinChannelThrottleStatus)。
interface ChannelThrottle {
  cooldownActive: boolean;
  cooldownEtaMs: number;
  consecutiveThrottles: number;
  lastRequestAt: number | null;
}

// job 的 sourceKind → 采集实际走的网关 channel。
//   self.metrics / self.detail → creator-center(抓创作者中心指标 / 明细导出)。
//   comments                   → creator-center(评论采集实际走创作者中心评论管理页,
//     非 iesdouyin;修正 stale 口径,与 douyin-request-gateway/T-176 退避 channel 对齐)。
function channelForSourceKind(sourceKind: string): DouyinChannel | null {
  // 聚合雷达可能同时包含网页、RSS、抖音和热点宝，不能冒充 creator-center 单通道；
  // 每日选题也不是抖音采集任务。
  if (
    sourceKind === "intelligence.sync" ||
    sourceKind === "topic.daily"
  ) {
    return null;
  }
  return "creator-center";
}

// cooldown 剩余毫秒 → 人话「约 N 分钟」。不足 1 分钟显「不到 1 分钟」(不显 0 分钟误导)。
function formatEtaMinutes(etaMs: number): string {
  if (etaMs <= 0) return "即将恢复";
  const mins = Math.ceil(etaMs / 60_000);
  return mins <= 1 ? "不到 1 分钟" : `约 ${mins} 分钟`;
}

// 限流横幅文案(诚实、人话)。仅在对应 channel cooldownActive 时显示。
function throttleBannerText(t: ChannelThrottle): string {
  const eta = formatEtaMinutes(t.cooldownEtaMs);
  const times =
    t.consecutiveThrottles > 0 ? `(已连续退避 ${t.consecutiveThrottles} 次)` : "";
  return `⏳ 限流保护中,下次${eta}后重试${times}`;
}

// ── 时间格式(与项目列表页一致的紧凑相对时刻,但这里给绝对更适合"下次运行")──────

function formatDateTime(iso: string | null, timeZone?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  if(timeZone==="Asia/Shanghai")return new Intl.DateTimeFormat("zh-CN",{timeZone,month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(t));
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

// 列表页把 cron 反解成友好中文(SPEC §8.1「cron 绝不显示给用户」)。不可解则降级显示原 cron。
function formatScheduleFriendly(cron: string, timeZone?: unknown): string {
  const cadence = compileCronToCadence(cron);
  const text=cadence ? describeCadence(cadence) : cron;
  return timeZone==="Asia/Shanghai" ? `${text}${cadence?.mode==="interval"&&cadence.unit==="hours"&&!cadence.minute?" · 00 分":""} · 北京时间` : text;
}

// ── ai_task_steps 行(复用选题弹窗步骤渲染范式)────────────────────────────────

interface TaskStep {
  stepNo: number;
  kind: string;
  text: string;
}

// ── 单个作业行 ────────────────────────────────────────────────────────────────

// D4「扫码绑定」恢复的按钮相位(某行 needs_reconnect 时)。
export type LoginPhase = "idle" | "logging_in" | "recovering";

// [T-332 S4·§6.3] 当前号 badge 数据(server 页解析好 handle 传下来;island 不自拉)。
export interface CurrentAccountBadge {
  readonly id: string;
  readonly handle: string;
}

export interface AutomationAccount extends CurrentAccountBadge {
  readonly platform: string;
  readonly status: "active" | "archived";
  readonly readiness?: AccountCollectionPlanReadinessResource;
  readonly readinessError?: string;
}
const EMPTY_AUTOMATION_ACCOUNTS:readonly AutomationAccount[]=[];
const PLATFORM_LABELS:Record<string,string>={douyin:"抖音",kuaishou:"快手",xiaohongshu:"小红书",wechatVideo:"视频号",wechatOfficial:"公众号",wechatOfficialAccount:"公众号",x:"X"};
const isSharedKind=(kind:string)=>kind==="topic.daily"||kind==="intelligence.sync";
// SEMANTIC_BOUNDARY_ALLOW: 固定平台协议的普通创建白名单，非意图理解或内容选择。
function canCreateKind(kind:string, target:AutomationAccount|null) {
  if(kind==="topic.daily")return true;
  if(!target || target.status!=="active" || target.readiness?.planEvidence!=="verified" || target.readiness.collectAvailable!==true)return false;
  return kind==="self.metrics"&&["douyin","xiaohongshu","kuaishou","wechatVideo","wechatOfficial"].includes(target.platform) || kind==="comments"&&target.platform==="douyin";
}

export function JobRow({
  job,
  latestRun,
  channelThrottle,
  currentAccount,
  runReadError,
  toggleError,
  onToggle,
  onOpenDetail,
  onEdit,
  onRunNow,
  onLogin,
  pendingToggle,
  pendingRunNow,
  loginPhase,
}: {
  readonly job: ScheduledJobResource;
  readonly latestRun: JobRunResource | null;
  /** [T-332 S4·§6.3] 当前号(渲行内归属号 badge);null = 未解析到,不渲不猜。 */
  readonly currentAccount?: CurrentAccountBadge | null;
  readonly runReadError?: string;
  readonly toggleError?: string;
  // T-038c:该 job 对应网关 channel 的实时退避快照(cooldown 时显限流横幅);null = 未知/未拉到。
  readonly channelThrottle: ChannelThrottle | null;
  readonly onToggle: (enabled: boolean) => void;
  readonly onOpenDetail: () => void;
  /** T-248:打开编辑弹窗(预填 name/prompt/频率/target → scheduledJobs.update)。 */
  readonly onEdit: () => void;
  readonly onRunNow: () => void;
  readonly onLogin: () => void;
  readonly pendingToggle: boolean;
  readonly pendingRunNow: boolean;
  readonly loginPhase: LoginPhase;
}) {
  const meta = SOURCE_META[job.sourceKind as SourceKind];
  const SourceIcon = meta?.icon ?? BarChart3;
  // D4:最近一次 run 是 needs_reconnect → 登录态过期(调度器停跑),该行红标 + 换「扫码绑定」。
  const needsReconnect = latestRun?.status === "needs_reconnect";
  // [T-152] 最近一次 run 正在跑 → 行内显实时进度(阶段 + 累计条数)。进度详情在运行详情抽屉
  //   持续 2s 轮询;此处行级是挂载/刷新时的快照(点作业名进抽屉看实时刷新)。
  const running = latestRun?.status === "running";
  const lastRunAt = latestRun?.startedAt ?? job.lastRunAt;
  const rowProgress = running
    ? readRunProgress((latestRun as { progress?: unknown } | null)?.progress)
    : null;
  // T-038c:对应 channel 正 cooldown → 行内显限流保护横幅(诚实告知,别当卡死)。
  const throttled = channelThrottle?.cooldownActive === true;
  return (
    <article
      data-slot="automation-row"
      data-job-id={job.id}
      data-source-kind={job.sourceKind}
      data-enabled={job.enabled}
      data-needs-reconnect={needsReconnect}
      className={cn(
        "grid grid-cols-1 items-center gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_208px]",
        needsReconnect && "bg-amber-50/60",
      )}
    >
      {/* name + source */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand"
        >
          <SourceIcon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            data-slot="automation-open-detail"
            onClick={onOpenDetail}
            className="truncate text-left text-sm font-semibold text-foreground hover:text-brand hover:underline"
          >
            {job.name}
          </button>
          {needsReconnect ? (
            <span
              data-slot="automation-reconnect-badge"
              className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-amber-600"
            >
              <AlertTriangle className="size-3" />
              需重连账号 · 去扫码绑定
            </span>
          ) : (
            <span className="truncate text-[11px] text-muted-foreground">
              {sourceLabel(job.sourceKind)}
            </span>
          )}
          {/* [T-332 S4·§6.3] 归属号 badge:列表虽已按当前号 strict 过滤,行上仍标归属
              (运行详情/通知里要能看出是哪个号的任务);若数据异常混进非当前号行,
              诚实标「其他账号」把问题暴露出来,绝不伪装。 */}
          {job.accountId && !isSharedKind(job.sourceKind) ? (
            <span
              data-slot="automation-account-badge"
              data-testid="automation-account-badge"
              data-account-id={job.accountId}
              className="inline-flex w-fit items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              <AtSign className="size-3" aria-hidden="true" />
              {currentAccount && job.accountId === currentAccount.id
                ? currentAccount.handle
                : "账号信息未读取"}
            </span>
          ) : <span className="text-xs text-muted-foreground">组内共享</span>}
          {toggleError ? <span role="alert" className="text-xs text-destructive">{toggleError}</span> : null}
          {runReadError ? <span role="alert" className="text-xs text-destructive">{runReadError}</span> : null}
          {/* [T-152] running 态:行内实时进度(阶段 + 累计条数 + 进度条)。点作业名进抽屉看 2s 轮询刷新。 */}
          {running && rowProgress ? (
            <RunProgressBar progress={rowProgress} />
          ) : running ? (
            // 已在跑但还没上报进度(刚触发 / 旧 run 无 progress)→ 诚实显「运行中…」不假造进度。
            <span
              data-slot="automation-row-running"
              className="inline-flex w-fit items-center gap-1 text-[11px] font-medium text-brand"
            >
              <Loader2 className="size-3 animate-spin" />
              采集进行中…
            </span>
          ) : null}
          {/* T-038c:限流保护中(该 channel 正 cooldown)—— 诚实告知,别看着像卡死。
              与 needs_reconnect 可并存(登录过期 + 恰好也在退避),独立成条显示。 */}
          {throttled && channelThrottle ? (
            <span
              data-slot="automation-throttle-badge"
              data-testid="automation-throttle-badge"
              className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
              title="抖音采集限流保护:连续触发风控信号后自动退避,到点自动恢复,无需操作"
            >
              <Clock className="size-3" />
              {throttleBannerText(channelThrottle)}
            </span>
          ) : null}
        </div>
      </div>

      {/* 执行计划:把频率、上次和下次运行收进一个信息组,减少横向空列。 */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span
          data-slot="automation-schedule"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-medium text-foreground"
          title={job.schedule}
        >
          <Clock className="size-3.5 text-muted-foreground" />
          {formatScheduleFriendly(job.schedule,job.target.scheduleTimezone)}
        </span>
        {COLLECTION_PRIORITY_LABELS[job.sourceKind] ? <><span className="text-[11px] font-medium text-brand">{COLLECTION_PRIORITY_LABELS[job.sourceKind]}</span><span className="text-[11px] text-muted-foreground">成功同步后，近 7 天每 2 小时更新<br/>7–30 天每 6 小时，30 天以上每天更新</span></> : null}
        <span
          data-slot="automation-last-run"
          className="text-[11px] text-muted-foreground tabular-nums"
        >
          上次：{lastRunAt ? formatDateTime(lastRunAt,job.target.scheduleTimezone === "Asia/Shanghai" ? "Asia/Shanghai" : undefined) : runReadError ? "读取失败" : latestRun ? "记录未提供时间" : "尚未运行"}
        </span>
        <span
          data-slot="automation-next-run"
          className="text-[11px] text-muted-foreground tabular-nums"
        >
          下次：
          {job.nextRunAt
            ? formatDateTime(job.nextRunAt,job.target.scheduleTimezone === "Asia/Shanghai" ? "Asia/Shanghai" : undefined)
            : job.enabled
              ? "等待调度"
              : "等待启用"}
        </span>
      </div>

      {/* 状态:开关、文字状态和启用前置条件合并,避免只剩一个孤立开关。 */}
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-2">
          <Switch
            aria-label={`${job.name} 启用开关`}
            data-slot="automation-enabled-switch"
            checked={job.enabled}
            disabled={pendingToggle}
            onCheckedChange={(v) => onToggle(v)}
          />
          <span
            className={cn(
              "text-xs font-medium",
              job.enabled ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {pendingToggle ? "更新中…" : job.enabled ? "已启用" : "未启用"}
          </span>
        </div>
        {!job.enabled && ENABLEMENT_HINTS[job.sourceKind] ? (
          <span
            data-slot="automation-enablement-hint"
            className="max-w-[190px] text-[11px] leading-snug text-text-subtle"
          >
            {ENABLEMENT_HINTS[job.sourceKind]}
          </span>
        ) : null}
      </div>

      {/* 操作:编辑(T-248)+ needs_reconnect → 扫码绑定(D4);否则 立即运行(D5) */}
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {(
          <button
            type="button"
            data-slot="automation-edit"
            data-testid="automation-edit"
            onClick={onEdit}
            title="编辑任务(名称/描述/频率/目标)"
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-subtle"
          >
            <Pencil className="size-3.5" />
            编辑
          </button>
        )}
        {needsReconnect ? (
          <button
            type="button"
            data-slot="automation-login-douyin"
            data-testid="automation-login-douyin"
            disabled={loginPhase !== "idle"}
            onClick={onLogin}
            title="登录态过期 —— 点此弹 Chromium 扫码扫码绑定,成功后自动恢复采集"
            className="inline-flex h-8 items-center gap-1.5 rounded-control bg-amber-500 px-3 text-xs font-medium text-white hover:bg-amber-500/90 disabled:opacity-60"
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                loginPhase !== "idle" && "animate-spin",
              )}
            />
            {loginPhase === "logging_in"
              ? "扫码登录中…"
              : loginPhase === "recovering"
                ? "恢复中…"
                : "扫码绑定"}
          </button>
        ) : (
          <button
            type="button"
            data-slot="automation-run-now"
            data-testid="automation-run-now"
            disabled={pendingRunNow || (!job.enabled && !running)}
            onClick={onRunNow}
            title={
              running ? "查看正在进行的运行" : job.enabled
                ? "立即采集一次，无需等待计划时间"
                : "作业已停用 —— 先启用才能立即运行"
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingRunNow ? (
              <Loader2 className="size-3.5 animate-spin text-brand" />
            ) : (
              <PlayCircle className="size-3.5" />
            )}
            {running ? "查看运行" : "立即运行"}
          </button>
        )}
      </div>
    </article>
  );
}

// ── 友好频率编辑器(去裸 crontab,SPEC §8.1)──────────────────────────────────
//
// 三段:周期 / 按间隔 / 单次。绝不暴露 cron —— cron 由 compileCadenceToCron 在提交时算出。
// 受控组件:父组件持 Cadence 状态,本组件只渲染控件 + 回调 setCadence。

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0–23
const MINUTES = [0, 5, 10, 15, 20, 30, 45]; // 常用分钟档(避免 60 项长列表)

function CadenceEditor({
  cadence,
  onChange,
}: {
  readonly cadence: Cadence;
  readonly onChange: (next: Cadence) => void;
}) {
  const hh = cadence.mode === "interval" ? 9 : cadence.hour;
  const mi = cadence.mode === "interval" ? 0 : cadence.minute;

  // 切频率类型:给每种模式一个合理缺省,避免跨模式脏值。
  const switchMode = (mode: Cadence["mode"]) => {
    if (mode === "period") {
      onChange({ ...DEFAULT_CADENCE });
    } else if (mode === "interval") {
      onChange({ mode: "interval", unit: "hours", every: 3 });
    } else {
      onChange({ mode: "once", month: 1, day: 1, hour: 9, minute: 0 });
    }
  };

  return (
    <div
      data-slot="automation-cadence-editor"
      className="flex flex-col gap-3 rounded-control border border-border bg-surface-subtle/50 p-3"
    >
      {/* 频率类型三选一 */}
      <div
        role="radiogroup"
        aria-label="频率类型"
        className="grid grid-cols-3 gap-1.5"
      >
        {(
          [
            ["period", "周期"],
            ["interval", "按间隔"],
            ["once", "单次"],
          ] as const
        ).map(([value, label]) => {
          const active = cadence.mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              data-slot="automation-cadence-mode"
              data-mode={value}
              data-active={active}
              onClick={() => switchMode(value)}
              className={cn(
                "h-8 rounded-control border text-xs font-medium transition-colors",
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-foreground hover:bg-surface-subtle",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 周期:每天/每周 + (周几) + 时间 */}
      {cadence.mode === "period" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={cadence.unit}
            onValueChange={(v) =>
              onChange({ ...cadence, unit: v as "daily" | "weekly" })
            }
          >
            <SelectTrigger
              data-slot="automation-cadence-period-unit"
              size="sm"
              className="w-[110px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">每天</SelectItem>
              <SelectItem value="weekly">每周</SelectItem>
            </SelectContent>
          </Select>

          {cadence.unit === "weekly" ? (
            <Select
              value={String(cadence.weekday)}
              onValueChange={(v) =>
                onChange({ ...cadence, weekday: Number(v) })
              }
            >
              <SelectTrigger
                data-slot="automation-cadence-weekday"
                size="sm"
                className="w-[90px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <TimePicker
            hour={hh}
            minute={mi}
            onChange={(hour, minute) => onChange({ ...cadence, hour, minute })}
          />
        </div>
      ) : null}

      {/* 按间隔:每 N 小时 / 每 N 分钟 */}
      {cadence.mode === "interval" ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">每</span>
          <Input
            data-slot="automation-cadence-interval-every"
            type="number"
            min={1}
            max={cadence.unit === "hours" ? 23 : 59}
            value={cadence.every}
            onChange={(e) =>
              onChange({
                ...cadence,
                every: Math.max(1, Math.trunc(Number(e.target.value) || 1)),
              })
            }
            className="w-20 text-sm"
          />
          <Select
            value={cadence.unit}
            onValueChange={(v) =>
              onChange({ ...cadence, unit: v as "hours" | "minutes" })
            }
          >
            <SelectTrigger
              data-slot="automation-cadence-interval-unit"
              size="sm"
              className="w-[90px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">小时</SelectItem>
              <SelectItem value="minutes">分钟</SelectItem>
            </SelectContent>
          </Select>
          {cadence.unit === "hours" && <label className="flex items-center gap-1 text-xs text-muted-foreground">在 <Input aria-label="触发分钟" type="number" min={0} max={59} value={cadence.minute??0} onChange={e=>onChange({...cadence,minute:clampField(Number(e.target.value),0,59)})} className="w-16"/> 分运行</label>}
        </div>
      ) : null}

      {/* 单次:月/日 + 时间(cron 近似,标注) */}
      {cadence.mode === "once" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              data-slot="automation-cadence-once-month"
              type="number"
              min={1}
              max={12}
              value={cadence.month}
              onChange={(e) =>
                onChange({
                  ...cadence,
                  month: clampField(Number(e.target.value), 1, 12),
                })
              }
              className="w-16 text-sm"
              aria-label="月"
            />
            <span className="text-xs text-muted-foreground">月</span>
            <Input
              data-slot="automation-cadence-once-day"
              type="number"
              min={1}
              max={31}
              value={cadence.day}
              onChange={(e) =>
                onChange({
                  ...cadence,
                  day: clampField(Number(e.target.value), 1, 31),
                })
              }
              className="w-16 text-sm"
              aria-label="日"
            />
            <span className="text-xs text-muted-foreground">日</span>
            <TimePicker
              hour={cadence.hour}
              minute={cadence.minute}
              onChange={(hour, minute) => onChange({ ...cadence, hour, minute })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            将在每年指定日期运行；只需运行一次时，请在完成后关闭任务。
          </p>
        </div>
      ) : null}

      {/* 即时中文预览(不露 cron) */}
      <p
        data-slot="automation-cadence-summary"
        className="text-[11px] font-medium text-brand"
      >
        {describeCadence(cadence)}
      </p>
    </div>
  );
}

function clampField(v: number, lo: number, hi: number): number {
  const n = Math.trunc(Number.isFinite(v) ? v : lo);
  return Math.min(hi, Math.max(lo, n));
}

// 时间选择器(HH:mm)—— 两个下拉,不露原始 cron 数字。
function TimePicker({
  hour,
  minute,
  onChange,
}: {
  readonly hour: number;
  readonly minute: number;
  readonly onChange: (hour: number, minute: number) => void;
}) {
  const safeMinute = MINUTES.includes(minute) ? minute : 0;
  return (
    <div className="flex items-center gap-1" data-slot="automation-time-picker">
      <Select value={String(hour)} onValueChange={(v) => onChange(Number(v), minute)}>
        <SelectTrigger
          data-slot="automation-time-hour"
          size="sm"
          className="w-[72px]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {String(h).padStart(2, "0")} 时
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">:</span>
      <Select
        value={String(safeMinute)}
        onValueChange={(v) => onChange(hour, Number(v))}
      >
        <SelectTrigger
          data-slot="automation-time-minute"
          size="sm"
          className="w-[72px]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {String(m).padStart(2, "0")} 分
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── 新建/编辑作业 Dialog(WorkBuddy 式:自然语言 prompt + 友好频率 + 模板预填)──
//
// 预填缝 `prefill`:列表页模板卡点击时传入 {name, prompt, sourceKind, cadence},弹窗打开即带值。
// 提交时:cadence → compileCadenceToCron 存 schedule(不露 cron);prompt 承接 scheduled_job.prompt。
// sourceKind 主路径由下拉/模板显式给;若用户改了 prompt 但没动下拉,以显式下拉为准(下拉即用户意图)。
//
// T-248 编辑模式(mode="edit" + job):同一表单复用于「编辑已有作业」——
//  - 预填 {name, prompt, target} 直取 job;频率经 compileCronToCadence(job.schedule) 反解。
//  - 反解失败(手写复杂 cron / 旧数据 → null)诚实降级:提示「原频率无法反解,请重新选择」,
//    用户重选频率前禁保存(绝不静默把原调度篡改成缺省值)。
//  - sourceKind 只读展示:契约 scheduledJobs.update 的 body 不含 sourceKind(不可改源),
//    不给假入口。系统自动建的源(benchmark / topic.daily 等,不在下拉集合)→ target 字段
//    隐藏且本次提交不改 target(诚实不碰读不懂的 target 形状)。
//  - 提交即确认(「保存修改」按钮),写操作走 onCreate 回调 → scheduledJobs.update。

export interface CreateJobPrefill {
  readonly name?: string;
  readonly prompt?: string;
  readonly sourceKind?: SourceKind;
  readonly cadence?: Cadence;
}

export function CreateJobDialog({
  open,
  onOpenChange,
  onCreate,
  prefill,
  mode = "create",
  job = null,
  allowedKinds,
  targetLabel,
}: {
  readonly allowedKinds?: readonly SourceKind[];
  readonly targetLabel?: string;
  readonly open: boolean;
  readonly onOpenChange: (v: boolean) => void;
  /** 提交回调:create 模式装配新建入参;edit 模式装配更新入参(sourceKind 恒为原值)。 */
  readonly onCreate: (input: {
    name: string;
    sourceKind: SourceKind;
    schedule: string;
    prompt: string;
    /** 装配好的 target;undefined = 本次不改 target(edit 模式源类型不在已知集合时)。 */
    target?: Record<string, unknown>;
  }) => Promise<void>;
  /** 模板卡预填(打开弹窗时应用一次;仅 create 模式)。 */
  readonly prefill?: CreateJobPrefill | null;
  /** create=新建(默认);edit=编辑已有作业(从 `job` 预填,sourceKind 只读)。 */
  readonly mode?: "create" | "edit";
  /** edit 模式的被编辑作业(打开时预填 name/prompt/频率/target)。 */
  readonly job?: ScheduledJobResource | null;
}) {
  const isEdit = mode === "edit";
  const [name, setName] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [sourceKind, setSourceKind] = React.useState<SourceKind>("self.metrics");
  const [cadence, setCadence] = React.useState<Cadence>({mode:"interval",unit:"hours",every:2});
  // T-248 编辑降级锁:job.schedule 反解失败时为 true —— 提示重选,重选前禁保存。
  const [cadenceUnresolved, setCadenceUnresolved] = React.useState(false);
  const [targetValue, setTargetValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [formError,setFormError]=React.useState<string|null>(null);

  const meta = SOURCE_META[sourceKind];
  // [T-258] target 字段可见性:仅「有 per-job 手动 target」的源(SOURCE_META 覆盖的 3 个)才显示。
  //   create 模式按当前选中源的 meta 判 —— 登记源驱动的 benchmark/topic.daily/favorites(模板卡预填
  //   或下拉手动选)meta 缺 → 隐藏 target(它们无 per-job target,信号靠各自登记页配);
  //   edit 模式按被编辑作业的源是否在已知集合判(系统作业隐藏 target,提交不改 target)。
  const showTargetField = isEdit
    ? !!(job && ['self.metrics','comments'].includes(job.sourceKind))
    : ['self.metrics','comments'].includes(sourceKind);
  const canSubmit = name.trim().length > 0 && !submitting && !cadenceUnresolved && (isEdit||(allowedKinds??['self.metrics','comments','topic.daily']).includes(sourceKind));

  // 打开弹窗时应用一次预填(模板卡 / 空白新建 / 编辑预填)。open 由 false→true 触发。
  const prevOpenRef = React.useRef(false);
  const formEpoch=React.useRef(0);
  const formAlive=React.useRef(true);
  React.useEffect(()=>{formAlive.current=true;return()=>{formAlive.current=false;formEpoch.current++;};},[]);
  React.useEffect(() => {
    if(open!==prevOpenRef.current)formEpoch.current++;
    if (open && !prevOpenRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗由关闭转打开时按外部 job/prefill 快照初始化表单
      setFormError(null);
      setSubmitting(false);
      if (isEdit && job) {
        // 编辑:从被编辑作业预填。频率用 compileCronToCadence 反解;反解失败(null)诚实
        // 降级:编辑器落回缺省值 + 标记 unresolved(UI 提示重选,重选前禁保存)。
        setName(job.name);
        setPrompt(job.prompt ?? "");
        const known = SOURCE_META[job.sourceKind as SourceKind];
        setSourceKind(job.sourceKind as SourceKind);
        const parsed = compileCronToCadence(job.schedule);
        setCadence(parsed ?? { ...DEFAULT_CADENCE });
        setCadenceUnresolved(parsed == null);
        const rawTarget = known
          ? (job.target as Record<string, unknown> | null)?.[known.targetKey]
          : undefined;
        setTargetValue(typeof rawTarget === "string" ? rawTarget : "");
      } else {
        // 新建:按 prefill 初始化(无 prefill = 空白)。
        setName(prefill?.name ?? "");
        setPrompt(prefill?.prompt ?? "");
        setSourceKind(prefill?.sourceKind ?? "self.metrics");
        setCadence(prefill?.cadence ?? {mode:"interval",unit:"hours",every:2});
        setCadenceUnresolved(false);
        setTargetValue("");
      }
    }
    prevOpenRef.current = open;
  }, [open, prefill, isEdit, job]);

  const submit = React.useCallback(async () => {
    if (!canSubmit) return;
    const originalEpoch=formEpoch.current;
    setFormError(null);
    setSubmitting(true);
    try {
      // 友好频率 → cron(内部实现,不露用户)。
      const schedule = compileCadenceToCron(cadence);
      // target 按源装配:self.metrics → {externalSourceId?}, comments → {awemeId}。
      // 空值不塞 key(service default {}),让"抓主页全部"这类无参源保持干净。
      // 无 per-job target 的源(登记源驱动的 benchmark/topic.daily/favorites,或 edit 模式系统作业)
      // → target=undefined:create 时下游落 {},edit 时本次不改原 target。
      let target: Record<string, unknown> | undefined = isEdit&&['self.metrics','self.traffic','comments','self.detail'].includes(sourceKind)?{...(job?.target??{})}:undefined;
      if (showTargetField && meta) {
        target = isEdit ? {...(job?.target ?? {})} : {};
        delete target[meta.targetKey];
        const trimmed = targetValue.trim();
        if (trimmed) target[meta.targetKey] = trimmed;
      }
      await onCreate({
        name: name.trim(),
        sourceKind,
        schedule,
        prompt: prompt.trim(),
        target,
      });
      if(formAlive.current&&formEpoch.current===originalEpoch)onOpenChange(false);
    } catch (error) {
      if(formAlive.current&&formEpoch.current===originalEpoch)setFormError(describeAutomationError(error,"保存未完成，请重试"));
    } finally {
      if(formAlive.current&&formEpoch.current===originalEpoch)setSubmitting(false);
    }
  }, [
    canSubmit,
    job,
    cadence,
    targetValue,
    meta,
    showTargetField,
    onCreate,
    name,
    prompt,
    sourceKind,
    onOpenChange,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent
        data-slot="automation-create-dialog"
        data-mode={mode}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <Pencil className="size-4 text-brand" />
            ) : (
              <Plus className="size-4 text-brand" />
            )}
            {isEdit ? "编辑采集任务" : "新建采集任务"}
          </DialogTitle>
          <DialogDescription>
            设置任务内容和执行时间，保存后按计划运行。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {targetLabel ? <p className="text-sm text-muted-foreground">目标：{targetLabel}{isEdit ? "" : "；每日选题属于账号组。"}</p> : null}
          {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
          {/* name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">任务名称</span>
            <Input
              data-slot="automation-field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例:每天抓我的主页指标"
            />
          </label>

          {/* 自然语言提示词(承接 scheduled_job.prompt)*/}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">
              想抓什么(用大白话描述)
            </span>
            <Textarea
              data-slot="automation-field-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例:每天抓我主页的新作品 / 每天抓我所有作品的最新评论"
              rows={2}
            />
          </label>

          {/* source_kind:create=下拉(主路径:显式意图,0 LLM);edit=只读展示
              (契约 scheduledJobs.update 不支持改 sourceKind,不给假入口)。 */}
          {isEdit ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">抓取内容</span>
              <span
                data-slot="automation-field-source-readonly"
                className="inline-flex w-fit items-center rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs text-muted-foreground"
              >
                {sourceLabel(job?.sourceKind ?? sourceKind)}(不可修改)
              </span>
            </div>
          ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">抓取内容</span>
            <Select
              value={sourceKind}
              onValueChange={(v) => {
                setSourceKind(v as SourceKind);
                setTargetValue("");
              }}
            >
              <SelectTrigger
                data-slot="automation-field-source"
                size="sm"
                className="w-full"
              >
                <SelectValue placeholder="选择抓取内容" />
              </SelectTrigger>
              <SelectContent>
                {!allowedKinds||allowedKinds.includes("self.metrics") ? <SelectItem value="self.metrics">作品数据同步</SelectItem> : null}
                {!allowedKinds||allowedKinds.includes("comments") ? <SelectItem value="comments">作品评论同步</SelectItem> : null}
                <SelectItem value="topic.daily">
                  每日自动选题(需配文本模型)
                </SelectItem>
              </SelectContent>
            </Select>

          </label>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">频率</span>
            <CadenceEditor
              cadence={cadence}
              onChange={(next) => {
                setCadence(next);
                setCadenceUnresolved(false);
              }}
            />
            {cadenceUnresolved ? (
              // T-248 诚实降级:原 cron 反解不出友好频率 → 明示原值,要求重选后才能保存。
              <p
                data-slot="automation-cadence-unresolved"
                data-testid="automation-cadence-unresolved"
                className="text-[11px] font-medium text-amber-600"
              >
                当前执行计划无法在这里编辑，请重新选择执行时间后保存。
              </p>
            ) : null}
          </div>

          {/* target(按源)。仅「有 per-job 手动 target」的源显示;登记源驱动源(benchmark/
              topic.daily/favorites)与 edit 模式系统作业 → 隐藏,不改 target。 */}
          {showTargetField && meta ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">
                {meta.targetLabel}
                <span className="ml-1 font-normal text-muted-foreground">(选填)</span>
              </span>
              <Input
                data-slot="automation-field-target"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder={meta.targetPlaceholder}
              />
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center rounded-control border border-border px-3 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            data-slot={isEdit ? "automation-edit-submit" : "automation-create-submit"}
            disabled={!canSubmit}
            onClick={submit}
            className="inline-flex h-9 items-center rounded-control bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {submitting
              ? isEdit
                ? "保存中…"
                : "创建中…"
              : isEdit
                ? "保存修改"
                : "创建任务"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 运行详情抽屉(读 jobRuns.listByJob + 选中 run 的 ai_task_steps)───────────────

export function RunDetailDialog({job,open,onOpenChange,preferredRunId=null,pending=false,requestError=null,contractClient=client}: {
 readonly job: ScheduledJobResource|null;
 readonly open: boolean;
 readonly onOpenChange:(v:boolean)=>void;
 readonly preferredRunId?:string|null;
 readonly pending?:boolean;
 readonly requestError?:string|null;
 readonly contractClient?: typeof client;
}) {
 const [runs,setRuns]=React.useState<JobRunResource[]>([]);
 const [loading,setLoading]=React.useState(false);
 const [selectedRunId,setSelectedRunId]=React.useState<string|null>(null);
 const [steps,setSteps]=React.useState<TaskStep[]>([]);
 const [stepsLoading,setStepsLoading]=React.useState(false);
 const [readError,setReadError]=React.useState<string|null>(null);
 // LED-047: 完成后再安排下次读取，慢请求不会重叠或被定时器作废。
 React.useEffect(()=>{
  if(!open||!job)return;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  setRuns([]);setSelectedRunId(preferredRunId);setSteps([]);setLoading(true);setReadError(null);
  async function read(){
   try {
    const value=await contractClient.listJobRunsByJob({params:{jobId:job!.id},query:{page:1,pageSize:50},body:undefined});
    if(!active)return;
    const rows=(Array.isArray(value)?value:[]) as JobRunResource[];
    if(preferredRunId&&!rows.some(r=>r.id===preferredRunId)){
     const requested=await contractClient.getJobRun({params:{runId:preferredRunId},query:undefined,body:undefined});
     if(!active)return;
     if(requested.jobId===job!.id)rows.unshift(requested as JobRunResource);
    }
    setRuns(rows.filter(r=>r.jobId===job!.id));setLoading(false);setReadError(null);
    if(rows.some(r=>r.status==='running')||(preferredRunId&&!rows.some(r=>r.id===preferredRunId)))timer=setTimeout(read,2000);
   }catch{if(active){setLoading(false);setReadError('运行记录读取失败，正在重试');timer=setTimeout(read,4000);}}
  }
  void read();return()=>{active=false;clearTimeout(timer);};
 },[open,job?.id,preferredRunId,contractClient]);
 const selectedRun=runs.find(r=>r.id===selectedRunId)??null;
 React.useEffect(()=>{
  setSteps([]);setStepsLoading(false);
  if(!open||!selectedRun?.aiTaskId)return;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const taskId=selectedRun.aiTaskId,running=selectedRun.status==='running';
  setStepsLoading(true);
  async function read(){try{
   const rows=await contractClient.listTaskSteps({params:{taskId},query:undefined,body:undefined});
   if(active){setSteps(Array.isArray(rows)?rows as TaskStep[]:[]);setStepsLoading(false);if(running)timer=setTimeout(read,2000);}
  }catch{if(active){setStepsLoading(false);if(running)timer=setTimeout(read,4000);}}}
  void read();return()=>{active=false;clearTimeout(timer);};
 },[open,job?.id,selectedRun?.id,selectedRun?.aiTaskId,selectedRun?.status,contractClient]);
 const selectRun=(run:JobRunResource)=>setSelectedRunId(run.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="automation-run-detail-dialog"
        className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-4 text-brand" />
            运行详情{job ? ` · ${job.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            查看本次进度和历史运行记录。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {(requestError||readError)&&<p role="alert" className="mb-3 text-sm text-destructive">{requestError||readError}</p>}
          {pending&&<p role="status" className="mb-3 text-sm text-muted-foreground">正在确认运行，请稍候…</p>}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-brand" />
              读取运行记录…
            </div>
          ) : runs.length === 0 ? (
            <div
              data-slot="automation-runs-empty"
              className="flex flex-col items-center gap-2 py-10 text-center"
            >
              <Inbox className="size-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                还没有运行记录。任务到点或手动运行后会在这里显示。
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.map((run) => {
                const waiting = run.status === "running" && readRunProgress(run.progress)?.stage === "waiting";
                const sm = waiting ? {label:"等待继续",icon:Clock,tone:"text-muted-foreground"} : runStatusMeta(run.status);
                const StatusIcon = sm.icon;
                const isSelected = run.id === selectedRunId;
                return (
                  <div
                    key={run.id}
                    data-slot="automation-run-item"
                    data-run-status={run.status}
                    className="rounded-control border border-border bg-surface"
                  >
                    <button
                      type="button"
                      onClick={() => selectRun(run)}
                      className="flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-surface-subtle"
                    >
                      <div className="flex w-full items-center gap-3">
                        <StatusIcon
                          className={cn(
                            "size-4 shrink-0",
                            sm.tone,
                            run.status === "running" && !waiting && "animate-spin",
                          )}
                        />
                        <span className={cn("text-xs font-medium", sm.tone)}>
                          {sm.label}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(run.startedAt,job?.target.scheduleTimezone === "Asia/Shanghai" ? "Asia/Shanghai" : undefined)}
                        </span>
                        <span
                          data-slot="automation-run-result"
                          className={cn(
                            "ml-auto text-[11px] tabular-nums",
                            run.status === "needs_reconnect"
                              ? "font-medium text-amber-600"
                              : run.status === "failed"
                                ? "text-destructive"
                                : "text-muted-foreground",
                          )}
                        >
                          {waiting ? "到时自动继续，已保存进度保留" : runResultText(run)}
                        </span>
                      </div>
                      {/* [T-152] running 态:实时采集进度条(阶段 + 累计条数)。轮询 2s 刷新。
                          终态 progress 已被 runner 清空(null)→ 不显,让位给结果文案。 */}
                      {run.status === "running"
                        ? (() => {
                            const prog = readRunProgress(
                              (run as { progress?: unknown }).progress,
                            );
                            return prog ? <RunProgressBar progress={prog} /> : null;
                          })()
                        : null}
                    </button>

                    {/* 选中 → ai_task_steps */}
                    {isSelected ? (
                      <div className="border-t border-border px-3 py-3">
                        {run.error ? (
                          // needs_reconnect 用琥珀(引导去扫码,别当失败),其它失败用红。文案由 runner
                          // 写人话(T-032b ②:未登录含「设置 → 账户」扫码引导;取音频/网络给具体原因)。
                          <p
                            data-slot="automation-run-error"
                            className={cn(
                              "mb-2 rounded px-2 py-1.5 text-[11px]",
                              run.status === "needs_reconnect"
                                ? "bg-amber-500/10 text-amber-700"
                                : "bg-destructive/10 text-destructive",
                            )}
                          >
                            {run.error}
                          </p>
                        ) : null}
                        {stepsLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin text-brand" />
                            读取步骤…
                          </div>
                        ) : steps.length > 0 ? (
                          <ol className="flex flex-col gap-1.5">
                            {steps.map((s) => (
                              <li
                                key={s.stepNo}
                                className="flex items-start gap-2 text-xs text-foreground"
                              >
                                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-medium text-brand">
                                  {s.stepNo}
                                </span>
                                <span className="leading-snug text-text-subtle">
                                  {s.kind === "tool_call" ? "调工具 · " : ""}
                                  {s.text || "（无描述）"}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            这次运行暂无详细步骤。
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 从模板入手(WorkBuddy 式模板卡区,SPEC §8.1)────────────────────────────────
//
// 列表页顶部的模板卡:点一张 → 打开新建弹窗并预填 {name, prompt, sourceKind, cadence}。
// 全部模板可点 —— D8a 明细导出落地后,原「灰置模板」机制(disabled 字段 + 灰置分支)已整体移除。
//
// [T-367] 查重:同 sourceKind 已有 job(通常是绑号 bootstrap 自动建的,可能 disabled)时,
// 该卡改「已存在」态 —— 点它**不再走 create**(根治「点模板卡想开启禁用 job,结果建出第二条」
// 的重复),而是回调 onEnableExisting 交给 island 启用既有 job + 滚动定位到那行。

export function TemplateCards({
  onPick,
  jobs = [],
  onEnableExisting,
  targetAccount,
  enforceTarget = false,
}: {
  readonly targetAccount?: AutomationAccount | null;
  readonly enforceTarget?: boolean;
  readonly onPick: (tpl: CollectionTemplate) => void;
  /** [T-367] 现存 job 列表(island 透传),按 sourceKind 查重定「已存在」态。 */
  readonly jobs?: ReadonlyArray<ScheduledJobResource>;
  /** [T-367] 已存在 kind 的卡被点 → 启用/定位既有 job(不 create)。 */
  readonly onEnableExisting?: (job: ScheduledJobResource) => void;
}) {
  // 每个 sourceKind 取第一条既有 job(0046 唯一约束后同 kind 至多一条)。
  const existingBySourceKind = React.useMemo(() => {
    const m = new Map<string, ScheduledJobResource>();
    for (const job of jobs) {
      if (enforceTarget && !isSharedKind(job.sourceKind) && job.accountId !== targetAccount?.id) continue;
      if (!m.has(job.sourceKind)) m.set(job.sourceKind, job);
    }
    return m;
  }, [jobs,targetAccount,enforceTarget]);
  return (
    <section
      data-slot="automation-templates"
      aria-label="从模板入手"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">快速创建</h2>
        <span className="text-xs text-muted-foreground">
          从常用任务开始
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {COLLECTION_TEMPLATES.filter(tpl => !enforceTarget || canCreateKind(tpl.sourceKind,targetAccount??null) || existingBySourceKind.has(tpl.sourceKind)).map((tpl) => {
          const Icon =
            SOURCE_META[tpl.sourceKind]?.icon ??
            EXTRA_SOURCE_ICONS[tpl.sourceKind] ??
            BarChart3;
          // [T-367] 该 kind 已有 job → 「已存在」态:点卡走启用/定位既有 job,不再 create。
          const existing = existingBySourceKind.get(tpl.sourceKind) ?? null;
          return (
            <button
              key={tpl.id}
              type="button"
              data-slot="automation-template-card"
              data-template-id={tpl.id}
              data-existing={existing ? "true" : undefined}
              onClick={() =>
                existing ? onEnableExisting?.(existing) : onPick(tpl)
              }
              className="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-control border border-border bg-surface-subtle/40 p-3 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
            >
              <span
                aria-hidden="true"
                className="row-span-2 flex size-8 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand"
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="text-sm font-semibold text-foreground">
                  {tpl.title}
                </span>
              </span>
              {existing ? (
                <span
                  data-slot="automation-template-existing"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    existing.enabled
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700",
                  )}
                >
                  <CheckCircle2 className="size-3" />
                  {existing.enabled ? "已启用" : "待启用"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                  <Plus className="size-3" />
                  新建
                </span>
              )}
              <span className="col-start-2 col-end-4 truncate text-[11px] text-muted-foreground">
                {tpl.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── 主 island ─────────────────────────────────────────────────────────────────

export function AutomationsIsland({
  jobs,
  currentAccount = null,
  accounts = EMPTY_AUTOMATION_ACCOUNTS,
  groupName,
  scope,
}: {
  readonly accounts?: readonly AutomationAccount[];
  readonly groupName?: string;
  readonly scope?: FrozenWorkspaceScope;
  readonly jobs: ReadonlyArray<ScheduledJobResource>;
  /** [T-332 S4·§6.3] 当前号(server 页解析);null = 未选号/解析失败 → 显引导不猜。 */
  readonly currentAccount?: CurrentAccountBadge | null;
}) {
  const router = useRouter();
  const [platformFilter,setPlatformFilter]=React.useState("all");
  const [accountFilter,setAccountFilter]=React.useState("all");
  const [createTarget,setCreateTarget]=React.useState<AutomationAccount|null>(null);
  const [latestReadErrors,setLatestReadErrors]=React.useState<Record<string,string>>({});
  const frozenGroupId=scope?.groupId;
  const scoped=scope!==undefined;
  const getClient=React.useCallback((accountId:string|null)=>scoped
    ? createClient(ENDPOINTS,createHttpTransport("/api/v1",{groupId:frozenGroupId,accountId})) : client,[frozenGroupId,scoped]);
  const getHistoryClient=React.useCallback((accountId:string|null)=>getClient(
    accounts.some(account=>account.id===accountId&&account.status==="archived")?null:accountId
  ),[accounts,getClient]);
  const [toggleErrors,setToggleErrors]=React.useState<Record<string,string>>({});
  const selectedTarget=accounts.find(a=>a.id===accountFilter)??null;
  const visibleJobs=jobs.filter(job=> {
    if(isSharedKind(job.sourceKind))return true;
    const account=accounts.find(a=>a.id===job.accountId);
    return (accountFilter==="all"||job.accountId===accountFilter)&&(platformFilter==="all"||account?.platform===platformFilter);
  });

  // [Bug-7 T-020] 跨页失效广播:settings / account-manager / automations 本岛 loginDouyin
  // 成功后 dispatch 'creatoros:accounts-changed' → 这里 router.refresh() 立刻拉 server 数据,
  // 让每行 latestRuns 翻篇(needs_reconnect 红标消失)、job 列表反映新绑定的号。
  useAccountsChanged((detail) => {
    // [T-909] 侧栏切号已经安排了同一轮 router.refresh；这里重复 refresh 会让
    // 自动化页连续重跑两次整棵 RSC。账号管理等未安排刷新者仍由本页兜底刷新。
    if (!detail.routeRefreshScheduled) router.refresh();
  });
  const [createOpen, setCreateOpen] = React.useState(false);
  // 模板卡预填(点模板 → 装配 → 打开弹窗带值);null = 空白新建。
  const [prefill, setPrefill] = React.useState<CreateJobPrefill | null>(null);
  const [detailJob, setDetailJob] = React.useState<ScheduledJobResource | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = React.useState(false);
  const detailClient=React.useMemo(()=>getHistoryClient(detailJob?.accountId??null),[getHistoryClient,detailJob?.accountId]);
  const [detailRunId,setDetailRunId]=React.useState<string|null>(null);
  const [runError,setRunError]=React.useState<string|null>(null);
  // T-248 编辑弹窗:被编辑作业 + 开关(复用 CreateJobDialog 的 edit 模式)。
  const [editJob, setEditJob] = React.useState<ScheduledJobResource | null>(
    null,
  );
  const [editOpen, setEditOpen] = React.useState(false);
  const [pendingToggleId, setPendingToggleId] = React.useState<string | null>(
    null,
  );
  // D5:立即运行进行中的 jobId(按钮 spinner);D4:扫码绑定相位(按 jobId)。
  const [pendingRunNowId, setPendingRunNowId] = React.useState<string | null>(
    null,
  );
  const [loginPhaseById, setLoginPhaseById] = React.useState<
    Record<string, LoginPhase>
  >({});
  // D4:每个 job 最近一次 run(判 needs_reconnect 红标 + 扫码绑定)。挂载/刷新时批量拉。
  const [latestRuns, setLatestRuns] = React.useState<
    Record<string, JobRunResource | null>
  >({});
  // T-038c:两个网关 channel 的实时退避快照(读 ingestion.douyin.throttleStatus)。
  // 挂载时拉一次;某 channel cooldownActive → 对应 sourceKind 的行显限流保护横幅。
  const [throttleByChannel, setThrottleByChannel] = React.useState<
    Partial<Record<DouyinChannel, ChannelThrottle>>
  >({});

  const pendingRequests=React.useRef(new Set<string>());
  const detailEpoch=React.useRef(0);
  const alive=React.useRef(true);
  const accountKey=scope?.groupId??currentAccount?.id??jobs.map(j=>j.id).join('|');
  const accountRef=React.useRef(accountKey);accountRef.current=accountKey;
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;detailEpoch.current++;};},[]);
  React.useEffect(()=>{detailEpoch.current++;setDetailOpen(false);setDetailJob(null);setDetailRunId(null);setPendingRunNowId(null);setRunError(null);setCreateOpen(false);setEditOpen(false);setToggleErrors({});},[accountKey]);
  const changeDetailOpen=React.useCallback((value:boolean)=>{if(!value)detailEpoch.current++;setDetailOpen(value);},[]);
  // 批量拉每个 job 的最近一次 run(jobRuns.listByJob limit 1)。
  const fetchLatestRuns = React.useCallback(async () => {
    const entries = await Promise.all(
      jobs.map(async (job) => {
        try {
          const rows = (await getHistoryClient(job.accountId??null).listJobRunsByJob({
            params: { jobId: job.id },
            query: { page: 1, pageSize: 1 },
            body: undefined,
          })) as unknown as JobRunResource[];
          return {id:job.id,run:Array.isArray(rows)&&rows[0]?rows[0]:null,error:null};
        } catch {
          return {id:job.id,run:null,error:"最近运行记录读取失败"};
        }
      }),
    );
    return {runs:Object.fromEntries(entries.map(e=>[e.id,e.run])),errors:Object.fromEntries(entries.filter(e=>e.error).map(e=>[e.id,e.error!]))};
  }, [jobs,getHistoryClient]);

  // LED-047/T987: 单在途；隐藏页面暂停，回来立即刷新。空闲不持续抢占本地服务。
  React.useEffect(() => {
    let active = true, inFlight = false, refreshOnReturn = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      if (!active || document.hidden) return;
      if (inFlight) { refreshOnReturn = true; return; }
      inFlight = true;
      const next = await fetchLatestRuns();
      inFlight = false;
      if (!active) return;
      setLatestRuns(next.runs);setLatestReadErrors(next.errors);
      if (document.hidden) return;
      const delay = refreshOnReturn ? 0 : Object.values(next.runs).some(run => run?.status === "running") ? 4000 : 15000;
      refreshOnReturn = false;
      timer = setTimeout(read, delay);
    }
    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void read();
    };
    setLatestRuns({}); void read();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [fetchLatestRuns]);

  // T-038c:挂载时拉一次两个 channel 的限流退避快照(只读 op,读网关内存镜像)。jobs 变化
  // (router.refresh 重传)即重拉,让登录恢复/立即运行后限流态也刷新。失败/未配网关 → 静默空
  // (诚实不显限流,不打断自动化)。这是实时态快照:cooldown 回看历史 run 的限流事件待后续
  // (SPEC §4.5 标注可选,本片先只做实时 channel 态)。
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setThrottleByChannel({});
      try {
        if(scoped && (selectedTarget?.platform!=="douyin"))return;
        const res = (await getClient(selectedTarget?.id??currentAccount?.id??null).throttleStatusDouyin({
          params: undefined,
          query: undefined,
          body: undefined,
        })) as { channels?: Array<ChannelThrottle & { channel: DouyinChannel }> };
        if (cancelled) return;
        const next: Partial<Record<DouyinChannel, ChannelThrottle>> = {};
        for (const c of res.channels ?? []) {
          next[c.channel] = {
            cooldownActive: c.cooldownActive,
            cooldownEtaMs: c.cooldownEtaMs,
            consecutiveThrottles: c.consecutiveThrottles,
            lastRequestAt: c.lastRequestAt,
          };
        }
        setThrottleByChannel(next);
      } catch {
        // 网关未配 / 读失败 → 保持空(诚实不显限流)。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs,getClient,scoped,selectedTarget?.id,selectedTarget?.platform,currentAccount?.id]);

  const toggle = React.useCallback(
    async (job: ScheduledJobResource, enabled: boolean) => {
      const originalScope=accountRef.current;
      setPendingToggleId(job.id);
      setToggleErrors(previous=>({...previous,[job.id]:""}));
      try {
        await getClient(job.accountId??null).setScheduledJobEnabled({
          params: { jobId: job.id },
          query: undefined,
          body: { enabled },
        });
        if(alive.current&&accountRef.current===originalScope)router.refresh();
      } catch(error) {
        if(alive.current&&accountRef.current===originalScope)setToggleErrors(previous=>({...previous,[job.id]:describeAutomationError(error,"任务开关保存失败，请重试")}));
      } finally {
        if(alive.current&&accountRef.current===originalScope)setPendingToggleId(null);
      }
    },
    [router,getClient],
  );

  const create = React.useCallback(
    async (input: {
      name: string;
      sourceKind: SourceKind;
      schedule: string;
      prompt: string;
      target?: Record<string, unknown>;
    }) => {
      const originalScope=accountRef.current;
      if(scope && !canCreateKind(input.sourceKind,createTarget))throw new Error("请选择已验证且可采集的目标账号，或创建组内每日选题");
      await getClient(isSharedKind(input.sourceKind)?null:createTarget?.id??currentAccount?.id??null).createScheduledJob({
        params: undefined,
        query: undefined,
        body: {
          name: input.name,
          // 自然语言指令(SPEC §8.2):承接 scheduled_job.prompt。sourceKind 是主路径意图,
          // prompt 是人类可读描述(未来可升级为 schema 约束 LLM 分类的输入)。
          prompt: input.prompt,
          sourceKind: input.sourceKind,
          target: input.target ?? {},
          schedule: input.schedule, // 已由 CadenceEditor 编译成 cron(不露用户)
          toolGrants: [], // 偏只读 + 落库,首版空;工具授权由执行层(D3)约束
        },
      });
      if(alive.current&&accountRef.current===originalScope)router.refresh();
    },
    [router,getClient,createTarget,scope,currentAccount?.id],
  );

  // T-248 编辑保存:调 scheduledJobs.update(PATCH,只传可改字段;sourceKind 契约不可改
  // 故不传)。target=undefined(源不在已知集合的系统作业)时不传 → 后端不动原 target。
  const update = React.useCallback(
    async (input: {
      name: string;
      sourceKind: SourceKind;
      schedule: string;
      prompt: string;
      target?: Record<string, unknown>;
    }) => {
      if (!editJob) return;
      const originalScope=accountRef.current;
      await getClient(editJob.accountId??null).updateScheduledJob({
        params: { jobId: editJob.id },
        query: undefined,
        body: {
          name: input.name,
          prompt: input.prompt,
          schedule: input.schedule, // 已由 CadenceEditor 编译成 cron(不露用户)
          ...(input.target !== undefined ? { target: input.target } : {}),
        },
      });
      if(alive.current&&accountRef.current===originalScope)router.refresh();
    },
    [router, editJob,getClient],
  );

  // T-248:行内「编辑」→ 打开编辑弹窗(预填该作业)。
  const openEdit = React.useCallback((job: ScheduledJobResource) => {
    setEditJob(job);
    setEditOpen(true);
  }, [setEditOpen]);

  // 从模板入手(SPEC §8.1):点模板卡 → 装配预填 → 打开新建弹窗。
  const openFromTemplate = React.useCallback((tpl: CollectionTemplate) => {
    setCreateTarget(selectedTarget);
    setPrefill({
      name: tpl.title,
      prompt: tpl.prompt,
      sourceKind: tpl.sourceKind,
      cadence: tpl.cadence,
    });
    setCreateOpen(true);
  }, [selectedTarget,setCreateOpen]);

  // [T-367] 已存在 kind 的模板卡被点 → 不 create:disabled 的既有 job 直接启用(复用
  //   setScheduledJobEnabled toggle 链,router.refresh 翻篇),已启用的只滚动定位到那行,
  //   让用户看到「任务已经在了」。
  const enableExisting = React.useCallback(
    async (job: ScheduledJobResource) => {
      if (!job.enabled) await toggle(job, true);
      document
        .querySelector(`[data-job-id="${job.id}"]`)
        ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    },
    [toggle],
  );

  // 空白新建:清预填后打开。
  const openBlank = React.useCallback(() => {
    setCreateTarget(selectedTarget);
    setPrefill(scope&&!canCreateKind("self.metrics",selectedTarget)?{sourceKind:"topic.daily"}:null);
    setCreateOpen(true);
  }, [selectedTarget,scope,setCreateOpen]);

  const openDetail = React.useCallback((job: ScheduledJobResource) => {
    detailEpoch.current++;setDetailRunId(null);setRunError(null);
    setDetailJob(job);
    setDetailOpen(true);
  }, []);

  // 服务端原子判断是否复用活跃运行，前端锁仅防本窗口重复点击。
  const runNow = React.useCallback(async (job:ScheduledJobResource)=>{
   if(pendingRequests.current.has(job.id))return;
   pendingRequests.current.add(job.id);
   const epoch=++detailEpoch.current,account=accountRef.current;
   const current=()=>alive.current&&accountRef.current===account&&detailEpoch.current===epoch;
   setPendingRunNowId(job.id);setRunError(null);setDetailRunId(null);setDetailJob(job);setDetailOpen(true);
   try {
    const response=await getClient(job.accountId??null).runScheduledJobNow({params:{jobId:job.id},query:undefined,body:{}});
    if(!current())return;
    if(!response.jobRunId)throw Error('尚未取得运行记录，请查看历史运行后再试');
    setDetailRunId(response.jobRunId);
   }catch(error){if(current())setRunError(error instanceof Error?error.message:'运行未能开始，请重试');}
   finally{pendingRequests.current.delete(job.id);if(alive.current&&accountRef.current===account)setPendingRunNowId(id=>id===job.id?null:id);}
  },[getClient]);

  // D4「扫码绑定」恢复(SPEC §6):某 job 最近 run 是 needs_reconnect → 弹 Chromium 扫码
  // (ingestion.douyin.login,复用 calibration 现成登录链)→ 成功后 runNow 触发一次恢复。
  // 诚实:headed 扫码卡用户,前端只发起 + 据结果推进,不假装登录过。
  const login = React.useCallback(
    async (job: ScheduledJobResource) => {
      // 由账号管理按真实平台/账号执行持久扫码，不再把所有重连投到抖音。
      router.push('/accounts');
    },
    [router],
  );

  return (
    <section data-testid="automations-region" className="flex flex-col gap-4">
      {scope?.groupId ? <section aria-label="账号组任务范围" className="rounded-panel border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-semibold">{groupName??"当前账号组"}</h2>
          <label className="flex items-center gap-2 text-sm">平台
            <select aria-label="筛选媒体平台" className="h-9 rounded-control border border-border bg-surface px-3" value={platformFilter} onChange={e=>{setPlatformFilter(e.target.value);setAccountFilter("all");}}>
              <option value="all">全部媒体</option>
              {[...new Set(accounts.map(a=>a.platform))].map(platform=><option key={platform} value={platform}>{PLATFORM_LABELS[platform]??platform}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">账号
            <select aria-label="筛选平台账号" className="h-9 max-w-full rounded-control border border-border bg-surface px-3" value={accountFilter} onChange={e=>setAccountFilter(e.target.value)}>
              <option value="all">全部账号</option>
              {accounts.filter(a=>platformFilter==="all"||a.platform===platformFilter).map(a=><option key={a.id} value={a.id}>{PLATFORM_LABELS[a.platform]??a.platform} · {a.handle}{a.status==="archived"?"（已归档）":""}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">共享任务保留在所有筛选中；选择具体账号后，可管理该账号的采集计划。</p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="组内账号计划状态">
          {accounts.filter(a=>(platformFilter==="all"||a.platform===platformFilter)&&(accountFilter==="all"||a.id===accountFilter)).map(a=>{
            const count=jobs.filter(j=>j.accountId===a.id&&!isSharedKind(j.sourceKind)).length;
            const reason=a.readinessError ?? (a.status==="archived"?"已归档，保留历史任务":count?`${count} 条采集计划`:a.readiness?.planEvidence==="missing"?"尚未建立采集计划；缺少默认计划的验证证明":a.readiness?.collectAvailable===false?"尚未建立采集计划；采集能力未装配":a.readiness?.planEvidence!=="verified"||a.readiness.collectAvailable!==true?"尚未建立采集计划；资格尚未确认":"尚未建立采集计划；选择此账号可创建");
            return <li key={a.id} className="min-w-0 rounded-control border border-border px-3 py-2 text-sm"><span className="font-medium">{PLATFORM_LABELS[a.platform]??a.platform} · {a.handle}</span><p className={a.readinessError?"text-destructive":"text-muted-foreground"}>{reason}</p>{!count&&a.readiness?.planEvidence==="missing"?<a href="/accounts" className="text-brand hover:underline">去账号绑定</a>:null}</li>;
          })}
          {!accounts.length?<li className="text-sm text-muted-foreground">当前账号组没有平台账号。<a href="/accounts" className="text-brand hover:underline">添加平台账号</a></li>:null}
        </ul>
      </section> : null}

      {/* 从模板入手(WorkBuddy 式)。[T-367] 透传现存 jobs 查重:已存在 kind 的卡显
          「已存在」态,点它启用/定位既有 job,不再建第二条。 */}
      <TemplateCards
        onPick={openFromTemplate}
        jobs={jobs}
        targetAccount={selectedTarget}
        enforceTarget={!!scope}
        onEnableExisting={enableExisting}
      />

      {/* 任务概览与主操作合并,让数量、状态、账号和新建入口属于同一信息层。 */}
      <div
        data-slot="automations-overview"
        className="flex flex-col gap-3 rounded-card border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              我的自动化
            </h2>
            <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-muted-foreground">
              {scope && visibleJobs.length !== jobs.length ? `当前 ${visibleJobs.length} / 全组 ${jobs.length} 个任务` : `共 ${jobs.length} 个任务`}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {jobs.filter((job) => job.enabled).length} 个已启用
            </span>
            {jobs.some((job) => !job.enabled) ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                {jobs.filter((job) => !job.enabled).length} 个待启用
              </span>
            ) : null}
          </div>
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {scope?.groupId ? <span data-testid="automations-current-group">{groupName??"当前账号组"} · 全组任务</span> : currentAccount ? <span data-testid="automations-current-account" data-account-id={currentAccount.id}>{currentAccount.handle}</span> : <span data-testid="automations-no-account">请选择账号组查看任务</span>}
          </span>
        </div>
        <button
          type="button"
          data-slot="automation-new"
          onClick={openBlank}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-4" />
          新建任务
        </button>
      </div>

      {/* 列表 */}
      {visibleJobs.length === 0 ? (
        <div
          data-slot="automations-empty"
          className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface py-16 text-center"
        >
          <Inbox className="size-10 text-muted-foreground/50" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              {currentAccount
                ? `${currentAccount.handle} 还没有采集任务`
                : "还没有采集任务"}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {/* [T-332 S4·§6.2] 新号诚实空态:绑号 bootstrap 会自动建好该号的日常采集
                  任务;这里为空通常是「还没绑号/没选号」,给对应引导而不是干瘪的 0。 */}
              {currentAccount
                ? "从上方开启作品自动同步，持续更新指标、评论、流量来源和视频内容；也可以安排每日选题。"
                : "当前筛选没有账号采集任务。共享任务仍显示；选择具体账号查看计划资格与可创建模板。"}
            </p>
          </div>
          <button
            type="button"
            onClick={openBlank}
            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="size-4" />
            新建任务
          </button>
        </div>
      ) : (
        <div
          data-slot="automations-list"
          aria-label="调度作业列表"
          className="overflow-hidden rounded-card border border-border bg-surface"
        >
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_208px] gap-4 border-b border-border bg-surface-subtle px-5 py-3 text-xs font-medium text-muted-foreground xl:grid">
            <span>任务</span>
            <span>执行计划</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          <ul className="divide-y divide-border" role="list">
            {visibleJobs.map((job) => (
              // [T-367] data-job-id:模板卡「已存在」态点击后滚动定位锚点。
              <li key={job.id} data-job-id={job.id} className="list-none">
                <JobRow
                  job={job}
                  currentAccount={scope ? (()=>{const a=accounts.find(a=>a.id===job.accountId);return a?{id:a.id,handle:`${PLATFORM_LABELS[a.platform]??a.platform} · ${a.handle}`}:null;})():currentAccount}
                  runReadError={latestReadErrors[job.id]}
                  toggleError={toggleErrors[job.id]}
                  latestRun={latestRuns[job.id] ?? null}
                  channelThrottle={(() => {
                    if(scope&&accounts.find(a=>a.id===job.accountId)?.platform!=="douyin")return null;
                    const channel = channelForSourceKind(job.sourceKind);
                    return channel ? throttleByChannel[channel] ?? null : null;
                  })()}
                  pendingToggle={pendingToggleId === job.id}
                  pendingRunNow={pendingRunNowId === job.id}
                  loginPhase={loginPhaseById[job.id] ?? "idle"}
                  onToggle={(v) => toggle(job, v)}
                  onOpenDetail={() => openDetail(job)}
                  onEdit={() => openEdit(job)}
                  onRunNow={() => runNow(job)}
                  onLogin={() => login(job)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <CreateJobDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={create}
        prefill={prefill}
        allowedKinds={scope ? (["self.metrics","comments","topic.daily"] as SourceKind[]).filter(kind=>canCreateKind(kind,createTarget)) : undefined}
        targetLabel={scope ? createTarget?`${PLATFORM_LABELS[createTarget.platform]??createTarget.platform} · ${createTarget.handle}`:"组内共享" : undefined}
      />
      {/* T-248 编辑弹窗:复用同一表单组件的 edit 模式,提交走 scheduledJobs.update。 */}
      <CreateJobDialog
        mode="edit"
        job={editJob}
        open={editOpen}
        onOpenChange={setEditOpen}
        onCreate={update}
        targetLabel={scope ? isSharedKind(editJob?.sourceKind??"") ? "组内共享" : (()=>{const target=accounts.find(a=>a.id===editJob?.accountId);return target?`${PLATFORM_LABELS[target.platform]??target.platform} · ${target.handle}`:"账号信息未读取";})() : undefined}
      />
      <RunDetailDialog
        job={detailJob}
        open={detailOpen}
        onOpenChange={changeDetailOpen}
        preferredRunId={detailRunId}
        pending={pendingRunNowId===detailJob?.id}
        requestError={runError}
        contractClient={detailClient}
      />
    </section>
  );
}
