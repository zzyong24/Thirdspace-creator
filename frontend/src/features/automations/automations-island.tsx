"use client";

/**
 * `AutomationsIsland` —— 任务中心 /automations 的 client 交互层(T-007 D6)。
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
 *  6. 「登录抖音」恢复(D4,SPEC §6):某作业最近一次 run 是 needs_reconnect(登录态过期,调度器
 *     停跑)→ 该行红标「需重连 Chrome」+「登录抖音」按钮 → 点击调 ingestion.douyin.login(headed
 *     弹 Chromium 扫码,复用 calibration 的现成登录链)→ 登录成功后调 scheduledJobs.runNow 触发
 *     一次恢复(下次到点调度器见最近 run 非 needs_reconnect 自动恢复自动跑)。
 *
 * 最近 run 状态:island 挂载时批量拉每个 job 的最近一次 run(jobRuns.listByJob limit 1)→
 * 每行据此判 needs_reconnect(红标 + 登录抖音)/ 正常(立即运行)。
 *
 * 诚实空态:D3 采集器尚未落地前,list 可为空(引导空态)、job_run 可为空(抽屉空态)。
 * 不写死、不假装有数据 —— 每个数字都追得到真实 job_run / ai_task_steps。
 *
 * 诚实缺口:「登录抖音」是 headed 扫码(开本地 Chromium),真恢复卡用户扫码 —— dev 本机可跑,
 * 真扫码恢复待用户。绝不假装登录过。
 *
 * Determinism:唯一非确定来源是用户显式交互;开关/新建/立即运行后 router.refresh() 重读列表。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Clock,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  MessageSquare,
  BarChart3,
  Inbox,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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

// ── 源类型 / 状态 中文映射 ────────────────────────────────────────────────────

type SourceKind = "self.metrics" | "comments";

const SOURCE_META: Record<
  SourceKind,
  { label: string; icon: LucideIcon; targetLabel: string; targetKey: string; targetPlaceholder: string }
> = {
  "self.metrics": {
    label: "自己作品",
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
};

function sourceLabel(kind: string): string {
  return SOURCE_META[kind as SourceKind]?.label ?? kind;
}

// job_run.status → 中文态 + 视觉。SPEC §4/§6:running|succeeded|failed|needs_reconnect。
type RunStatus = "running" | "succeeded" | "failed" | "needs_reconnect";

const RUN_STATUS_META: Record<
  RunStatus,
  { label: string; icon: LucideIcon; tone: string }
> = {
  running: { label: "运行中", icon: Loader2, tone: "text-brand" },
  succeeded: { label: "正常", icon: CheckCircle2, tone: "text-emerald-600" },
  failed: { label: "失败", icon: AlertTriangle, tone: "text-destructive" },
  needs_reconnect: {
    label: "需重连 Chrome",
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

// ── 时间格式(与项目列表页一致的紧凑相对时刻,但这里给绝对更适合"下次运行")──────

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

// ── ai_task_steps 行(复用选题弹窗步骤渲染范式)────────────────────────────────

interface TaskStep {
  stepNo: number;
  kind: string;
  text: string;
}

// ── 单个作业行 ────────────────────────────────────────────────────────────────

// D4「登录抖音」恢复的按钮相位(某行 needs_reconnect 时)。
export type LoginPhase = "idle" | "logging_in" | "recovering";

export function JobRow({
  job,
  latestRun,
  onToggle,
  onOpenDetail,
  onRunNow,
  onLogin,
  pendingToggle,
  pendingRunNow,
  loginPhase,
}: {
  readonly job: ScheduledJobResource;
  readonly latestRun: JobRunResource | null;
  readonly onToggle: (enabled: boolean) => void;
  readonly onOpenDetail: () => void;
  readonly onRunNow: () => void;
  readonly onLogin: () => void;
  readonly pendingToggle: boolean;
  readonly pendingRunNow: boolean;
  readonly loginPhase: LoginPhase;
}) {
  const meta = SOURCE_META[job.sourceKind as SourceKind];
  const SourceIcon = meta?.icon ?? BarChart3;
  // D4:最近一次 run 是 needs_reconnect → 登录态过期(调度器停跑),该行红标 + 换「登录抖音」。
  const needsReconnect = latestRun?.status === "needs_reconnect";
  return (
    <article
      data-slot="automation-row"
      data-job-id={job.id}
      data-source-kind={job.sourceKind}
      data-enabled={job.enabled}
      data-needs-reconnect={needsReconnect}
      className={cn(
        "grid grid-cols-[minmax(0,1.4fr)_120px_140px_140px_140px_96px_auto] items-center gap-4 px-5 py-5",
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
              需重连 Chrome
            </span>
          ) : (
            <span className="truncate text-[11px] text-muted-foreground">
              {sourceLabel(job.sourceKind)}
            </span>
          )}
        </div>
      </div>

      {/* source_kind chip */}
      <span
        data-slot="automation-source"
        className="inline-flex w-fit items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
      >
        {sourceLabel(job.sourceKind)}
      </span>

      {/* schedule(cron) */}
      <code
        data-slot="automation-schedule"
        className="truncate rounded bg-surface-subtle px-2 py-1 text-[11px] text-foreground tabular-nums"
        title={job.schedule}
      >
        {job.schedule}
      </code>

      {/* last_run_at */}
      <span
        data-slot="automation-last-run"
        className="text-xs text-muted-foreground tabular-nums"
      >
        {formatDateTime(job.lastRunAt)}
      </span>

      {/* next_run_at */}
      <span
        data-slot="automation-next-run"
        className="text-xs text-muted-foreground tabular-nums"
      >
        {formatDateTime(job.nextRunAt)}
      </span>

      {/* enabled 开关 */}
      <div className="flex items-center gap-2">
        <Switch
          aria-label={`${job.name} 启用开关`}
          data-slot="automation-enabled-switch"
          checked={job.enabled}
          disabled={pendingToggle}
          onCheckedChange={(v) => onToggle(v)}
        />
      </div>

      {/* 操作:needs_reconnect → 登录抖音(D4);否则 立即运行(D5) */}
      <div className="flex items-center justify-end gap-2">
        {needsReconnect ? (
          <button
            type="button"
            data-slot="automation-login-douyin"
            data-testid="automation-login-douyin"
            disabled={loginPhase !== "idle"}
            onClick={onLogin}
            title="登录态过期 —— 点此弹 Chromium 扫码登录抖音,成功后自动恢复采集"
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
                : "登录抖音"}
          </button>
        ) : (
          <button
            type="button"
            data-slot="automation-run-now"
            data-testid="automation-run-now"
            disabled={pendingRunNow || !job.enabled}
            onClick={onRunNow}
            title={
              job.enabled
                ? "立即手动触发一次采集(不等 cron 到点)"
                : "作业已停用 —— 先启用才能立即运行"
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingRunNow ? (
              <Loader2 className="size-3.5 animate-spin text-brand" />
            ) : (
              <PlayCircle className="size-3.5" />
            )}
            立即运行
          </button>
        )}
      </div>
    </article>
  );
}

// ── 新建作业 Dialog ───────────────────────────────────────────────────────────

export function CreateJobDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  readonly open: boolean;
  readonly onOpenChange: (v: boolean) => void;
  readonly onCreate: (input: {
    name: string;
    sourceKind: SourceKind;
    schedule: string;
    target: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [sourceKind, setSourceKind] = React.useState<SourceKind>("self.metrics");
  const [schedule, setSchedule] = React.useState("0 9 * * *");
  const [targetValue, setTargetValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const meta = SOURCE_META[sourceKind];
  const canSubmit = name.trim().length > 0 && schedule.trim().length > 0 && !submitting;

  const reset = React.useCallback(() => {
    setName("");
    setSourceKind("self.metrics");
    setSchedule("0 9 * * *");
    setTargetValue("");
  }, []);

  const submit = React.useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // target 按源装配:self.metrics → {externalSourceId?}, comments → {awemeId}。
      // 空值不塞 key(service default {}),让"抓主页全部"这类无参源保持干净。
      const target: Record<string, unknown> = {};
      const trimmed = targetValue.trim();
      if (trimmed) target[meta.targetKey] = trimmed;
      await onCreate({
        name: name.trim(),
        sourceKind,
        schedule: schedule.trim(),
        target,
      });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, targetValue, meta, onCreate, name, sourceKind, schedule, reset, onOpenChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent
        data-slot="automation-create-dialog"
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4 text-brand" />
            新建调度作业
          </DialogTitle>
          <DialogDescription>
            配一个周期性采集作业:选源 + 定 cron。到点自动产 ai_task 走队列采集、落库(执行由 D3 接线)。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">作业名称</span>
            <Input
              data-slot="automation-field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例:每天抓我的主页指标"
            />
          </label>

          {/* source_kind 下拉 */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">数据源</span>
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
                <SelectValue placeholder="选择数据源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self.metrics">自己作品(指标快照)</SelectItem>
                <SelectItem value="comments">评论</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {/* schedule(cron) */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">
              调度(cron 表达式)
            </span>
            <Input
              data-slot="automation-field-schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 9 * * *(每天 9 点)"
              className="font-mono text-sm"
            />
            <span className="text-[11px] text-muted-foreground">
              5 段 cron:分 时 日 月 周。例 `0 9 * * *` = 每天 09:00。
            </span>
          </label>

          {/* target(按源) */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">
              {meta.targetLabel}
            </span>
            <Input
              data-slot="automation-field-target"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={meta.targetPlaceholder}
            />
          </label>
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
            data-slot="automation-create-submit"
            disabled={!canSubmit}
            onClick={submit}
            className="inline-flex h-9 items-center rounded-control bg-brand px-4 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {submitting ? "创建中…" : "创建作业"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 运行详情抽屉(读 jobRuns.listByJob + 选中 run 的 ai_task_steps)───────────────

export function RunDetailDialog({
  job,
  open,
  onOpenChange,
}: {
  readonly job: ScheduledJobResource | null;
  readonly open: boolean;
  readonly onOpenChange: (v: boolean) => void;
}) {
  const [runs, setRuns] = React.useState<JobRunResource[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<TaskStep[]>([]);
  const [stepsLoading, setStepsLoading] = React.useState(false);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // 读该作业历史 run(jobRuns.listByJob);showSpinner=false 用于轮询静默重拉。
  const loadRuns = React.useCallback(
    async (jobId: string, showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      try {
        const rows = (await client.listJobRunsByJob({
          params: { jobId },
          query: { page: 1, pageSize: 50 },
          body: undefined,
        })) as unknown as JobRunResource[];
        if (!cancelledRef.current) setRuns(Array.isArray(rows) ? rows : []);
      } catch {
        if (showSpinner && !cancelledRef.current) setRuns([]);
      } finally {
        if (showSpinner && !cancelledRef.current) setLoading(false);
      }
    },
    [],
  );

  // 打开或换作业 → 首读历史 run。
  React.useEffect(() => {
    if (!open || !job) return;
    setRuns([]);
    setSelectedRunId(null);
    setSteps([]);
    void loadRuns(job.id, true);
  }, [open, job, loadRuns]);

  // D5 轮询:抽屉打开且存在 running run(立即运行刚触发)→ 每 2s 静默重拉 runs,让状态
  // (running→succeeded/needs_reconnect)+ 新鲜度计数实时翻篇。无 running run 即停(省轮询)。
  const hasRunning = runs.some((r) => r.status === "running");
  React.useEffect(() => {
    if (!open || !job || !hasRunning) return;
    const t = setInterval(() => {
      void loadRuns(job.id, false);
    }, 2000);
    return () => clearInterval(t);
  }, [open, job, hasRunning, loadRuns]);

  // 读某 ai_task 的步骤(showSpinner=false 用于轮询静默重拉)。
  const loadSteps = React.useCallback(
    async (aiTaskId: string, showSpinner: boolean) => {
      if (showSpinner) setStepsLoading(true);
      try {
        const rows = (await client.listTaskSteps({
          params: { taskId: aiTaskId },
          query: undefined,
          body: undefined,
        })) as unknown as TaskStep[];
        if (!cancelledRef.current) setSteps(Array.isArray(rows) ? rows : []);
      } catch {
        if (showSpinner && !cancelledRef.current) setSteps([]);
      } finally {
        if (showSpinner && !cancelledRef.current) setStepsLoading(false);
      }
    },
    [],
  );

  // 选中某 run → 读其 ai_task_id 对应 ai_task_steps(复用 listTaskSteps 范式)。
  const selectRun = React.useCallback(
    async (run: JobRunResource) => {
      setSelectedRunId(run.id);
      setSteps([]);
      if (!run.aiTaskId) return; // 该 run 未产 ai_task(理论不该,诚实兜空)
      await loadSteps(run.aiTaskId, true);
    },
    [loadSteps],
  );

  // D5 轮询:选中的 run 仍 running → 每 2s 静默重拉其步骤(步骤逐条落地实时可见)。
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const selectedRunning =
    selectedRun?.status === "running" && !!selectedRun.aiTaskId;
  React.useEffect(() => {
    if (!open || !selectedRunning || !selectedRun?.aiTaskId) return;
    const t = setInterval(() => {
      void loadSteps(selectedRun.aiTaskId!, false);
    }, 2000);
    return () => clearInterval(t);
  }, [open, selectedRunning, selectedRun, loadSteps]);

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
            历史触发记录(job_run)与每次运行的步骤日志(ai_task_steps)。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
                还没有运行记录。作业到点触发(D3 采集接线后)或点「立即运行」(D5)才会产生 job_run。
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {runs.map((run) => {
                const sm = runStatusMeta(run.status);
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
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-subtle"
                    >
                      <StatusIcon
                        className={cn(
                          "size-4 shrink-0",
                          sm.tone,
                          run.status === "running" && "animate-spin",
                        )}
                      />
                      <span className={cn("text-xs font-medium", sm.tone)}>
                        {sm.label}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(run.startedAt)}
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                        新增 {run.itemsNew} · 更新 {run.itemsUpdated}
                      </span>
                    </button>

                    {/* 选中 → ai_task_steps */}
                    {isSelected ? (
                      <div className="border-t border-border px-3 py-3">
                        {run.error ? (
                          <p className="mb-2 rounded bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
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
                            这次运行没有步骤日志(ai_task_steps 为空)。
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

// ── 主 island ─────────────────────────────────────────────────────────────────

export function AutomationsIsland({
  jobs,
}: {
  readonly jobs: ReadonlyArray<ScheduledJobResource>;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailJob, setDetailJob] = React.useState<ScheduledJobResource | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [pendingToggleId, setPendingToggleId] = React.useState<string | null>(
    null,
  );
  // D5:立即运行进行中的 jobId(按钮 spinner);D4:登录抖音相位(按 jobId)。
  const [pendingRunNowId, setPendingRunNowId] = React.useState<string | null>(
    null,
  );
  const [loginPhaseById, setLoginPhaseById] = React.useState<
    Record<string, LoginPhase>
  >({});
  // D4:每个 job 最近一次 run(判 needs_reconnect 红标 + 登录抖音)。挂载/刷新时批量拉。
  const [latestRuns, setLatestRuns] = React.useState<
    Record<string, JobRunResource | null>
  >({});

  // 批量拉每个 job 的最近一次 run(jobRuns.listByJob limit 1)。jobs 变化(router.refresh
  // 重传)即重拉,保证登录恢复/立即运行后行状态刷新。
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        jobs.map(async (job) => {
          try {
            const rows = (await client.listJobRunsByJob({
              params: { jobId: job.id },
              query: { page: 1, pageSize: 1 },
              body: undefined,
            })) as unknown as JobRunResource[];
            return [job.id, Array.isArray(rows) && rows[0] ? rows[0] : null] as const;
          } catch {
            return [job.id, null] as const;
          }
        }),
      );
      if (!cancelled) setLatestRuns(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  const toggle = React.useCallback(
    async (job: ScheduledJobResource, enabled: boolean) => {
      setPendingToggleId(job.id);
      try {
        await client.setScheduledJobEnabled({
          params: { jobId: job.id },
          query: undefined,
          body: { enabled },
        });
        router.refresh();
      } finally {
        setPendingToggleId(null);
      }
    },
    [router],
  );

  const create = React.useCallback(
    async (input: {
      name: string;
      sourceKind: SourceKind;
      schedule: string;
      target: Record<string, unknown>;
    }) => {
      await client.createScheduledJob({
        params: undefined,
        query: undefined,
        body: {
          name: input.name,
          prompt: "", // 内建采集器源(self.metrics/comments)无需 Agent 发现提示词
          sourceKind: input.sourceKind,
          target: input.target,
          schedule: input.schedule,
          toolGrants: [], // 偏只读 + 落库,首版空;工具授权由执行层(D3)约束
        },
      });
      router.refresh();
    },
    [router],
  );

  const openDetail = React.useCallback((job: ScheduledJobResource) => {
    setDetailJob(job);
    setDetailOpen(true);
  }, []);

  // D5「立即运行」:手动触发 scheduledJobs.runNow(产 ai_task + job_run,fire-and-forget)→
  // 打开该作业运行详情抽屉(轮询 ai_task_steps)→ refresh 让行状态/上次运行刷新。
  const runNow = React.useCallback(
    async (job: ScheduledJobResource) => {
      setPendingRunNowId(job.id);
      try {
        await client.runScheduledJobNow({
          params: { jobId: job.id },
          query: undefined,
          body: {},
        });
        setDetailJob(job);
        setDetailOpen(true); // 抽屉轮询 job_run + ai_task_steps
        router.refresh();
      } finally {
        setPendingRunNowId(null);
      }
    },
    [router],
  );

  // D4「登录抖音」恢复(SPEC §6):某 job 最近 run 是 needs_reconnect → 弹 Chromium 扫码
  // (ingestion.douyin.login,复用 calibration 现成登录链)→ 成功后 runNow 触发一次恢复。
  // 诚实:headed 扫码卡用户,前端只发起 + 据结果推进,不假装登录过。
  const login = React.useCallback(
    async (job: ScheduledJobResource) => {
      setLoginPhaseById((m) => ({ ...m, [job.id]: "logging_in" }));
      try {
        const res = (await client.loginDouyin({
          params: undefined,
          query: undefined,
          body: {},
        })) as { loggedIn?: boolean };
        if (res.loggedIn) {
          // 登录成功 → 立刻触发一次采集恢复(job_run 从 needs_reconnect 翻篇)。
          setLoginPhaseById((m) => ({ ...m, [job.id]: "recovering" }));
          await client.runScheduledJobNow({
            params: { jobId: job.id },
            query: undefined,
            body: {},
          });
          setDetailJob(job);
          setDetailOpen(true);
        }
        router.refresh();
      } finally {
        setLoginPhaseById((m) => ({ ...m, [job.id]: "idle" }));
      }
    },
    [router],
  );

  return (
    <section data-testid="automations-region" className="flex flex-col gap-4">
      {/* 顶部操作条 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          共 {jobs.length} 个作业
        </span>
        <button
          type="button"
          data-slot="automation-new"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="size-4" />
          新建作业
        </button>
      </div>

      {/* 列表 */}
      {jobs.length === 0 ? (
        <div
          data-slot="automations-empty"
          className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface py-16 text-center"
        >
          <Inbox className="size-10 text-muted-foreground/50" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">还没有调度作业</p>
            <p className="max-w-md text-xs text-muted-foreground">
              新建一个作业来周期性抓取「自己作品指标」或「评论」。到点自动跑、数据落库,供 Dashboard 与选题消费。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="size-4" />
            新建作业
          </button>
        </div>
      ) : (
        <div
          data-slot="automations-list"
          aria-label="调度作业列表"
          className="overflow-hidden rounded-card border border-border bg-surface"
        >
          <div className="grid grid-cols-[minmax(0,1.4fr)_120px_140px_140px_140px_96px_auto] gap-4 border-b border-border bg-surface-subtle px-5 py-3 text-xs font-medium text-muted-foreground">
            <span>作业</span>
            <span>数据源</span>
            <span>调度</span>
            <span>上次运行</span>
            <span>下次运行</span>
            <span>启用</span>
            <span className="text-right">操作</span>
          </div>
          <ul className="divide-y divide-border" role="list">
            {jobs.map((job) => (
              <li key={job.id} className="list-none">
                <JobRow
                  job={job}
                  latestRun={latestRuns[job.id] ?? null}
                  pendingToggle={pendingToggleId === job.id}
                  pendingRunNow={pendingRunNowId === job.id}
                  loginPhase={loginPhaseById[job.id] ?? "idle"}
                  onToggle={(v) => toggle(job, v)}
                  onOpenDetail={() => openDetail(job)}
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
      />
      <RunDetailDialog
        job={detailJob}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </section>
  );
}
