"use client";

/**
 * `calibration-interactive-region.tsx` — 校准中心 client island(T-067 布局重做)。
 *
 * 用户裁决:校准中心的核心工作流是「预测一个视频 → 它跑得怎么样 → 定时任务拉数据回收
 * 预测准不准」。页面布局围绕这条单一主线纵向重排,不再是三栏工作台:
 *
 *  - 顶部指标带(3 张真值卡):已锁定预测 / 已完成回流 / 平均偏差。
 *  - 上段「进行中的预测」:每条预测一行 —— 作品名 + 预测分 + 锁定时间 + 状态
 *    (草稿可锁定 / 已锁定等待数据回流 / 已回流显示偏差档)。行可展开看逐维度盲预测评分表。
 *    这是核心工作流的可视化主体。
 *  - 中段「发布后回流对照」:已回流的 预测 vs 实际 逐维度对照表(ReflowTable 复用)。
 *  - 侧栏「发起新预测」:从待校准内容选一条 → 盲预测(补充入口;主入口在稿面发布包区,
 *    所以这里不占 C 位)。
 *
 * 删除项(用户裁决):经验沉淀区(经验归经验模块)、AI 编导诊断常驻栏(诊断是产预测的
 *  过程,不是页面常驻栏)、目标 tabs / 预测切换带(为三栏选中态服务,主线式布局不需要)。
 *
 * needs-backend 交互全部复用现有 ops(不新增契约):
 *  - `StartPredictionButton` → ai.tasks.create { calibration.diagnose } → poll → confirm。
 *  - `LockPredictionButton` → client.lockPrediction(draft → locked,盲预测不可改)。
 *  - `RecordResultButton` → getPrediction 取维度 + createResult(可先让编导 calibration.score
 *    据真实指标预填)。
 *  - `RefreshDouyinButton` → ingestion.douyin.refresh(核心工作流的「采集回收」一步,保留)。
 *
 * 零造假:所有可见值来自 props 的真实 jsonb;缺字段渲染「—」/诚实空态,绝不编造。
 * 确定性(C-5):render 无 Date.now / Math.random / fetch;时间展示只做 ISO 字符串切片。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lock,
  Sparkles,
  Gauge,
  CheckCircle2,
  ArrowRight,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  MessagesSquare,
  ChevronDown,
  Hourglass,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  CalibrationOverviewResource,
  PredictionResource,
  RubricResource,
} from "@creatoros/backend/modules/calibration";

// ── shared mutation seam ────────────────────────────────────────────────────────
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, after?: (result: unknown) => void) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          const result = await mutate();
          if (after) after(result);
          else router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run, router };
}

// ── typed views over the prediction's FREE jsonb(维度评分约定) ─────────────────────
interface DimensionScore {
  key: string;
  score: number; // 1–5
  reason: string;
  suggestion: string;
}

function readDimensions(p: PredictionResource): DimensionScore[] {
  const conv = (p.predictedConversion ?? {}) as {
    dimensions?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(conv.dimensions)) return [];
  return conv.dimensions
    .map((d) => ({
      key: typeof d.key === "string" ? d.key : "",
      score: typeof d.score === "number" ? d.score : 0,
      reason: typeof d.reason === "string" ? d.reason : "",
      suggestion: typeof d.suggestion === "string" ? d.suggestion : "",
    }))
    .filter((d) => d.key !== "");
}

// 预测分 = 维度盲评均分(1 位小数)。无维度 → null(展示「—」,不编分)。
function predictionScore(p: PredictionResource): string | null {
  const dims = readDimensions(p);
  if (dims.length === 0) return null;
  const avg = dims.reduce((s, d) => s + d.score, 0) / dims.length;
  return avg.toFixed(1);
}

// ISO → YYYY-MM-DD(确定性:纯字符串切片,不走时区)。
function isoDate(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.length < 10) return null;
  return iso.slice(0, 10);
}

// ── label maps ────────────────────────────────────────────────────────────────────
const DEVIATION_BAND_LABELS: Record<string, string> = {
  low: "低偏差",
  mid: "中偏差",
  high: "高偏差",
  none: "—",
};
const DEVIATION_KPI_LABELS: Record<string, string> = {
  low: "低（预测准）",
  mid: "中",
  high: "高（偏差大）",
  none: "—",
};

// ── 顶部指标带(收窄为 3 张真值卡) ────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  const has = value !== "—" && value !== "";
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
      <span className="flex items-center gap-2 text-[11px] font-medium text-text-subtle">
        <span className="flex size-6 items-center justify-center rounded-control bg-brand-soft text-brand">
          <Icon className="size-3.5" />
        </span>
        {label}
      </span>
      <span
        className={cn(
          "font-heading text-2xl font-semibold leading-none tabular-nums",
          has ? "text-foreground" : "text-text-subtle",
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="line-clamp-1 text-[11px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function KpiBand({
  kpis,
}: {
  readonly kpis: CalibrationOverviewResource["kpis"];
}) {
  return (
    <div
      data-testid="calibration-kpi-band"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <KpiCard
        icon={Lock}
        label="已锁定预测"
        value={String(kpis.lockedPredictions)}
        hint="发布前盲预测已写死"
      />
      <KpiCard
        icon={CheckCircle2}
        label="已完成回流"
        value={String(kpis.completedReflows)}
        hint="发布后回流真实数据"
      />
      <KpiCard
        icon={Gauge}
        label="平均偏差"
        value={DEVIATION_KPI_LABELS[kpis.avgDeviationBand] ?? "—"}
        hint="预测 vs 真实的平均差距"
      />
    </div>
  );
}

// 5-段评分条(1–5)— fills `score` of 5 cells。只读(盲预测已锁,不可改)。
function ScoreBar({ score }: { readonly score: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-3 rounded-full",
            i <= filled ? "bg-brand" : "bg-surface-subtle",
          )}
        />
      ))}
      <span className="ml-1 text-xs font-semibold tabular-nums text-foreground">
        {filled}
      </span>
    </span>
  );
}

// ── 录入真实表现(FLY-02 飞轮回流) ─────────────────────────────────────────────────
// 对一条已锁定盲预测,逐维度录入发布后的真实评分(1–5),提交走 client.createResult
// (不带 ingestionRunId → 服务端自建一次 source='manual' 的真 run,满足 §C-4 溯源)。
// 落库后该预测在「进行中的预测」里转为已回流,并出现在下方对照区。
type DimScore = { key: string; score?: number };

function RecordResultButton({
  predictionId,
  title,
}: {
  readonly predictionId: string;
  readonly title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dims, setDims] = React.useState<DimScore[]>([]);
  // 维度 key → 用户录入的真实分(字符串,提交时转数字)。
  const [actuals, setActuals] = React.useState<Record<string, string>>({});
  // 编导自动评分(B2 飞轮回流):AI 据真实指标产维度真实分候选 → 预填录入框,人可改。
  const [scoring, setScoring] = React.useState(false);
  const [scoreError, setScoreError] = React.useState<string | null>(null);
  const [scoreReasons, setScoreReasons] = React.useState<
    Record<string, string>
  >({});
  // 卸载后别再 setState(轮询是长任务)。
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const openForm = React.useCallback(async () => {
    setOpen(true);
    setError(null);
    setScoreError(null);
    setScoreReasons({});
    setLoading(true);
    try {
      const pred = (await client.getPrediction({
        params: { predictionId },
        query: undefined,
        body: undefined,
      })) as unknown as {
        predictedConversion?: { dimensions?: DimScore[] };
      };
      const list = Array.isArray(pred.predictedConversion?.dimensions)
        ? pred.predictedConversion!.dimensions!
        : [];
      setDims(list);
      setActuals({});
    } catch {
      setError("读取盲预测维度失败,请重试。");
    } finally {
      setLoading(false);
    }
  }, [predictionId]);

  // 编导评分 — 起 calibration.score AI 任务,轮询到 awaiting_confirmation 读候选
  // (resultData.dimensions = 维度真实分候选)并**预填**录入框(人可改)。不 confirmTask:
  // 采纳走下方「录入」→ createResult。
  const runDirectorScore = React.useCallback(async () => {
    if (scoring) return;
    setScoring(true);
    setScoreError(null);
    try {
      const task = (await client.createAITask({
        params: undefined,
        query: undefined,
        body: {
          taskType: "calibration.score",
          inputData: { predictionId },
        },
      })) as { id: string };
      for (let i = 0; i < 75; i++) {
        if (cancelledRef.current) return;
        await new Promise((r) => setTimeout(r, 4000));
        if (cancelledRef.current) return;
        const status = (await client.getTask({
          params: { taskId: task.id },
          query: undefined,
          body: undefined,
        })) as { status: string };
        if (status.status === "awaiting_confirmation") {
          const results = (await client.listTaskResults({
            params: { taskId: task.id },
            query: undefined,
            body: undefined,
          })) as unknown as Array<{ resultData: Record<string, unknown> }>;
          const last = results[results.length - 1];
          const scored = Array.isArray(last?.resultData?.dimensions)
            ? (last!.resultData.dimensions as Array<Record<string, unknown>>)
            : [];
          if (cancelledRef.current) return;
          // 预填:每个维度的 AI 真实分 → 录入框字符串;理由留存展示。人改分不影响理由。
          const nextActuals: Record<string, string> = {};
          const nextReasons: Record<string, string> = {};
          for (const d of scored) {
            const key = typeof d.key === "string" ? d.key : "";
            if (!key) continue;
            if (typeof d.score === "number" && Number.isFinite(d.score)) {
              nextActuals[key] = String(d.score);
            }
            if (typeof d.reason === "string" && d.reason) {
              nextReasons[key] = d.reason;
            }
          }
          setActuals((s) => ({ ...s, ...nextActuals }));
          setScoreReasons(nextReasons);
          if (Object.keys(nextActuals).length === 0) {
            setScoreError("编导没能据真实指标给分,请手填或重试。");
          }
          setScoring(false);
          return;
        }
        if (status.status === "cancelled" || status.status === "failed") {
          if (!cancelledRef.current) {
            setScoreError("编导评分失败(可能没配模型或暂无真实指标),请手填或重试。");
            setScoring(false);
          }
          return;
        }
      }
      if (!cancelledRef.current) {
        setScoreError("编导评分超时,请手填或重试。");
        setScoring(false);
      }
    } catch {
      if (!cancelledRef.current) {
        setScoreError("编导评分出错,请手填或重试。");
        setScoring(false);
      }
    }
  }, [scoring, predictionId]);

  const submit = React.useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // 仅提交填了真实分的维度(1–5);actualMetrics 扁平 {维度key: 分}(与偏差计算约定一致)。
      const actualMetrics: Record<string, number> = {};
      for (const d of dims) {
        const raw = actuals[d.key];
        const n = raw === undefined ? NaN : Number(raw);
        if (Number.isFinite(n)) actualMetrics[d.key] = n;
      }
      await client.createResult({
        params: { predictionId },
        query: undefined,
        // 不带 ingestionRunId → 服务端自建 manual run(§C-4 溯源不破)。
        body: { actualMetrics },
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("录入失败,请重试。");
    } finally {
      setSaving(false);
    }
  }, [dims, actuals, predictionId, router]);

  const filledCount = dims.filter((d) =>
    Number.isFinite(Number(actuals[d.key])),
  ).length;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="record-result-trigger"
        className="h-7 gap-1.5 px-2.5 text-[11px]"
        onClick={(e) => {
          e.stopPropagation();
          void openForm();
        }}
      >
        <ClipboardList className="size-3.5" />
        录入真实表现
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!saving) setOpen(v);
        }}
      >
        <DialogContent
          data-testid="record-result-dialog"
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md"
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>录入真实表现</DialogTitle>
            <DialogDescription className="truncate">
              {title} —— 逐维度填发布后真实评分(1–5),对照当初盲预测。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            {/* 编导评分(B2)— AI 读真实指标自动给维度真实分,预填下面的录入框,人审核可改。 */}
            {!loading && dims.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface-subtle/50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-subtle">
                    <Sparkles className="size-3.5 text-brand" />
                    编导自动评分
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="director-score-button"
                    className="h-7 gap-1.5 px-2.5 text-[11px]"
                    disabled={scoring || saving}
                    onClick={runDirectorScore}
                  >
                    <Sparkles className="size-3.5" />
                    {scoring ? "编导评分中…" : "让编导据真实指标评分"}
                  </Button>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  AI 读这条作品的真实指标(播放/完播/互动…)给每个维度打真实分,自动预填下方录入框 —— 人审核后可改。
                </p>
                {scoreError ? (
                  <p className="text-[11px] text-destructive">{scoreError}</p>
                ) : null}
              </div>
            ) : null}
            {loading ? (
              <p className="text-sm text-muted-foreground">读取盲预测维度…</p>
            ) : dims.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                这条盲预测没有维度评分,无法逐维度录入。
              </p>
            ) : (
              dims.map((d) => {
                const reason = scoreReasons[d.key];
                return (
                  <div key={d.key} className="flex flex-col gap-1">
                    <label className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">
                          {d.key}
                        </span>
                        {typeof d.score === "number" ? (
                          <span className="ml-1.5 text-muted-foreground">
                            预测 {d.score}
                          </span>
                        ) : null}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        step={1}
                        aria-label={`${d.key} 真实分`}
                        value={actuals[d.key] ?? ""}
                        onChange={(e) =>
                          setActuals((s) => ({ ...s, [d.key]: e.target.value }))
                        }
                        className="h-8 w-20 shrink-0"
                      />
                    </label>
                    {reason ? (
                      <p
                        data-testid="score-reason"
                        className="flex items-start gap-1 pl-0.5 text-[11px] leading-snug text-muted-foreground"
                      >
                        <Sparkles className="mt-0.5 size-3 shrink-0 text-brand" />
                        <span>
                          <span className="text-text-subtle">编导依据 · </span>
                          {reason}
                        </span>
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="border-t">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              data-testid="record-result-submit"
              disabled={saving || loading || filledCount === 0}
              onClick={submit}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {saving ? "录入中…" : `录入(${filledCount}）`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── 锁定预测(draft → locked,不可逆 —— 盲预测不可改,§6.2) ─────────────────────────
function LockPredictionButton({
  prediction,
}: {
  readonly prediction: PredictionResource;
}) {
  const { pending, run } = useMutation();
  const locked = prediction.status === "locked";
  function lock(e: React.MouseEvent) {
    e.stopPropagation();
    if (locked) return;
    run(() =>
      client.lockPrediction({
        params: { predictionId: prediction.id },
        query: undefined,
        body: undefined,
      }),
    );
  }
  if (locked) {
    return (
      <Badge
        variant="secondary"
        data-testid="prediction-locked-badge"
        className="gap-1 text-[11px]"
      >
        <Lock className="size-3" />
        已锁定
      </Badge>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      data-testid="lock-prediction-button"
      className="h-7 gap-1.5 bg-brand px-2.5 text-[11px] text-brand-foreground hover:bg-brand/90"
      disabled={pending}
      onClick={lock}
    >
      <Lock className="size-3.5" />
      锁定预测版本
    </Button>
  );
}

// ── 上段:进行中的预测(核心工作流可视化) ───────────────────────────────────────────
// 每行 = 一条预测的主线状态机:草稿(可锁定)→ 已锁定「等待数据回流」→ 已回流(显示偏差档)。
// 行可展开看逐维度盲预测评分表(诊断产出的过程性内容折叠在这里,不再占页面常驻栏)。

function ScoreTableRow({
  dim,
  weightLabel,
}: {
  readonly dim: DimensionScore & { readonly label: string };
  readonly weightLabel: string | null;
}) {
  return (
    <li
      data-testid="score-row"
      data-dim={dim.key}
      className="flex flex-col gap-1.5 border-b border-border/60 py-3 last:border-b-0"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {dim.label}
          </span>
          {weightLabel ? (
            <span className="text-[10px] text-text-subtle">权重 {weightLabel}</span>
          ) : null}
        </span>
        <ScoreBar score={dim.score} />
      </div>
      {dim.reason ? (
        <p className="text-[12px] leading-snug text-muted-foreground">
          <span className="text-text-subtle">打分理由 · </span>
          {dim.reason}
        </p>
      ) : null}
      {dim.suggestion ? (
        <p className="flex items-start gap-1 text-[12px] leading-snug text-brand">
          <ArrowRight className="mt-0.5 size-3 shrink-0" />
          {dim.suggestion}
        </p>
      ) : null}
    </li>
  );
}

// 一条回流对照行的摘要(deviationBand)供预测行显示偏差档。
type ReflowRow = CalibrationOverviewResource["reflowRows"][number];

function PredictionRow({
  prediction,
  title,
  reflow,
  rubric,
  expanded,
  onToggle,
}: {
  readonly prediction: PredictionResource;
  readonly title: string;
  readonly reflow: ReflowRow | null;
  readonly rubric: RubricResource | null;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const score = predictionScore(prediction);
  const lockedDate = isoDate(prediction.lockedAt);
  const isDraft = prediction.status !== "locked";

  const weightByKey = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const d of rubric?.currentVersion.dimensions ?? []) {
      m.set(d.key, `${Math.round(d.weight * 100)}%`);
    }
    return m;
  }, [rubric]);
  const labelByKey = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const d of rubric?.currentVersion.dimensions ?? []) {
      m.set(d.key, d.label);
    }
    return m;
  }, [rubric]);
  const dims = readDimensions(prediction).map((d) => ({
    ...d,
    label: labelByKey.get(d.key) ?? d.key,
  }));

  return (
    <li
      data-testid="prediction-row"
      data-prediction-id={prediction.id}
      data-state={isDraft ? "draft" : reflow ? "reflowed" : "awaiting"}
      className="rounded-card border border-border bg-surface"
    >
      {/* 行头:作品名 + 预测分 + 锁定时间 + 主线状态。展开是独立 toggle 按钮,
          动作按钮(锁定/录入)是同级兄弟 —— 不做 button 嵌套。 */}
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          data-testid="prediction-row-toggle"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-text-subtle transition-transform",
              expanded && "rotate-180",
            )}
          />
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {title}
          </span>
        </button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="text-text-subtle">预测分</span>
          <span
            className={cn(
              "font-heading text-base font-semibold tabular-nums",
              score ? "text-foreground" : "text-text-subtle",
            )}
          >
            {score ?? "—"}
          </span>
        </span>
        <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
          <span className="text-text-subtle">锁定于</span>
          <span className="tabular-nums">{lockedDate ?? "—"}</span>
        </span>
        {/* 主线状态:草稿 / 等待数据回流 / 已回流偏差档 */}
        {isDraft ? (
          <LockPredictionButton prediction={prediction} />
        ) : reflow ? (
          <Badge
            variant={reflow.deviationBand === "low" ? "secondary" : "outline"}
            data-testid="prediction-deviation-badge"
            className="gap-1 text-[10px]"
          >
            <CheckCircle2 className="size-3" />
            已回流 · {DEVIATION_BAND_LABELS[reflow.deviationBand] ?? reflow.deviationBand}
          </Badge>
        ) : (
          <span className="flex items-center gap-2">
            <Badge
              variant="outline"
              data-testid="prediction-awaiting-badge"
              className="gap-1 text-[10px] text-muted-foreground"
            >
              <Hourglass className="size-3" />
              等待数据回流
            </Badge>
            <RecordResultButton predictionId={prediction.id} title={title} />
          </span>
        )}
      </div>

      {/* 展开体:逐维度盲预测评分表(变现加权 · 1–5)。 */}
      {expanded ? (
        <div className="border-t border-border/60 px-4 pb-3 pt-2">
          {dims.length > 0 ? (
            <ul data-testid="score-table" className="flex flex-col">
              {dims.map((d) => (
                <ScoreTableRow
                  key={d.key}
                  dim={d}
                  weightLabel={weightByKey.get(d.key) ?? null}
                />
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              这条预测还没有维度评分。
            </p>
          )}
          {isDraft ? (
            <p className="pt-2 text-[11px] text-text-subtle">
              锁定后盲预测不可改,发布后用真实数据校准。
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ActivePredictionsSection({
  predictions,
  reflowByPredictionId,
  subjectTitles,
  rubric,
}: {
  readonly predictions: readonly PredictionResource[];
  readonly reflowByPredictionId: ReadonlyMap<string, ReflowRow>;
  readonly subjectTitles: Readonly<Record<string, string>>;
  readonly rubric: RubricResource | null;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  return (
    <section
      data-testid="calibration-active-predictions"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface-subtle/40 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">进行中的预测</h3>
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {predictions.length}
        </Badge>
      </div>
      {predictions.length === 0 ? (
        <p
          data-testid="predictions-empty"
          className="rounded-card border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
        >
          还没有进行中的预测。去稿面的发布包区对新稿盲预测,或从右侧「发起新预测」选一条待校准内容开始。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {predictions.map((p) => (
            <PredictionRow
              key={p.id}
              prediction={p}
              title={subjectTitles[p.subjectId] ?? p.subjectId}
              reflow={reflowByPredictionId.get(p.id) ?? null}
              rubric={rubric}
              expanded={expandedId === p.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === p.id ? null : p.id))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 中段:发布后回流对照(预测 vs 实际,逐维度偏差) ─────────────────────────────────
function DeviationCell({ value }: { readonly value: number | null }) {
  if (value === null)
    return <span className="text-text-subtle">—</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color =
    value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-text-subtle";
  return (
    <span className={cn("flex items-center gap-0.5 tabular-nums", color)}>
      <Icon className="size-3.5" />
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

function ReflowTable({
  rows,
  subjectTitles,
}: {
  readonly rows: CalibrationOverviewResource["reflowRows"];
  readonly subjectTitles: Readonly<Record<string, string>>;
}) {
  return (
    <section
      data-testid="calibration-reflow"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-foreground">发布后回流对照</h3>
      {rows.length === 0 ? (
        <p
          data-testid="reflow-empty"
          className="rounded-card border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
        >
          还没有回流数据。锁定的预测在内容发布、数据回流后即可在这里对照预测与真实表现。
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div
              key={row.predictionId}
              data-testid="reflow-row"
              data-prediction-id={row.predictionId}
              className="flex flex-col gap-2 rounded-control border border-border/70 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {subjectTitles[row.subjectId] ?? row.subjectId}
                </span>
                <span className="flex items-center gap-2">
                  <Badge
                    variant={
                      row.deviationBand === "low" ? "secondary" : "outline"
                    }
                    className="text-[10px]"
                  >
                    {DEVIATION_BAND_LABELS[row.deviationBand] ?? row.deviationBand}
                  </Badge>
                </span>
              </div>
              {row.reason ? (
                <p className="text-[12px] text-muted-foreground">
                  <span className="text-text-subtle">偏差原因 · </span>
                  {row.reason}
                </p>
              ) : null}
              {/* per-dimension 预测 vs 真实 grid */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-[12px]">
                  <thead>
                    <tr className="text-left text-text-subtle">
                      <th className="py-1 pr-3 font-medium">评估维度</th>
                      <th className="py-1 pr-3 font-medium">预测分</th>
                      <th className="py-1 pr-3 font-medium">真实分</th>
                      <th className="py-1 font-medium">偏差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.dimensions.map((d) => (
                      <tr
                        key={d.key}
                        className="border-t border-border/50 text-foreground"
                      >
                        <td className="py-1.5 pr-3">{d.label}</td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {d.predicted ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {d.actual ?? "—"}
                        </td>
                        <td className="py-1.5">
                          <DeviationCell value={d.deviation} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── 侧栏:发起新预测(补充入口;主入口在稿面发布包区) ─────────────────────────────────
// 开始预测 — 起 calibration.diagnose AI 任务,轮询到 awaiting_confirmation 后 confirm
// (铸一条 draft Prediction),再 refresh 落新评分表。诊断是产预测的过程,产物折叠在
// 预测行里,不再占页面常驻栏。
function StartPredictionButton({
  subject,
}: {
  readonly subject: CalibrationOverviewResource["pendingSubjects"][number];
}) {
  const { run } = useMutation();
  const [phase, setPhase] = React.useState<"idle" | "running" | "error">("idle");
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  function start(e: React.MouseEvent) {
    e.stopPropagation();
    if (phase === "running") return;
    setPhase("running");
    void (async () => {
      try {
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: {
            taskType: "calibration.diagnose",
            inputData: {
              subjectType: subject.subjectType,
              subjectId: subject.subjectId,
            },
          },
        })) as { id: string };
        for (let i = 0; i < 75; i++) {
          if (cancelledRef.current) return;
          await new Promise((r) => setTimeout(r, 4000));
          if (cancelledRef.current) return;
          const status = (await client.getTask({
            params: { taskId: task.id },
            query: undefined,
            body: undefined,
          })) as { status: string };
          if (status.status === "awaiting_confirmation") {
            await client.confirmTask({
              params: { taskId: task.id },
              query: undefined,
              body: undefined,
            });
            if (!cancelledRef.current) {
              setPhase("idle");
              run(() => Promise.resolve()); // router.refresh()
            }
            return;
          }
          if (status.status === "cancelled" || status.status === "failed") {
            if (!cancelledRef.current) setPhase("error");
            return;
          }
        }
        if (!cancelledRef.current) setPhase("error");
      } catch {
        if (!cancelledRef.current) setPhase("error");
      }
    })();
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        data-testid="start-prediction-button"
        className="h-7 gap-1 bg-brand px-2.5 text-xs text-brand-foreground hover:bg-brand/90"
        disabled={phase === "running"}
        onClick={start}
      >
        <Sparkles className="size-3.5" />
        {phase === "running"
          ? "AI 诊断中…"
          : phase === "error"
            ? "重试预测"
            : "开始预测"}
      </Button>
      {/* 一键岛预调(SPEC §3.4):打开 ChatBox 进编导诊断,预调 calibration.diagnose —— 想边聊
          边逐维度盲评/多轮打磨走这条;左边「开始预测」是直接起任务铸盲预测的快路(两条并存)。 */}
      <Link
        href={copilotDeepLink("calibration", "calibration.diagnose", {
          kind: subject.subjectType,
          id: subject.subjectId,
          title: subject.title,
        })}
        data-testid="calibration-open-copilot"
        aria-label="在对话里诊断"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-7 items-center gap-1 rounded-control border border-brand/30 bg-surface px-2 text-xs font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft/60"
      >
        <MessagesSquare className="size-3.5" />
        对话诊断
      </Link>
    </div>
  );
}

function NewPredictionRail({
  subjects,
}: {
  readonly subjects: CalibrationOverviewResource["pendingSubjects"];
}) {
  // 只列还没盲预测的内容;已锁定/已回流的都在左侧主线「进行中的预测」里,不重复展示。
  const unpredicted = subjects.filter((s) => s.badge === "unpredicted");
  return (
    <aside
      data-testid="calibration-new-prediction"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">发起新预测</h3>
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {unpredicted.length}
        </Badge>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        盲预测的主入口在稿面的发布包区;这里是补充入口 —— 对还没预测的内容直接发起。
      </p>
      {unpredicted.length === 0 ? (
        <p
          data-testid="pending-empty"
          className="rounded-card border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
        >
          没有待预测的内容。去稿面的发布包区对新稿先盲预测,发布后回到这里看回流对照。
        </p>
      ) : (
        // T-088 右栏过长收敛:待预测可能上百条(标题还是整段长文)→ 列表限高框内滚
        // + 标题两行截断,右栏不再把整页拉长;核心主线(左列)保持第一屏。
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {unpredicted.map((s) => (
            <li
              key={`${s.subjectType}:${s.subjectId}`}
              data-testid="pending-subject-row"
              data-subject-id={s.subjectId}
              className="flex shrink-0 flex-col gap-2 rounded-control border border-border/70 bg-surface-subtle/40 px-3 py-2.5"
            >
              <span className="line-clamp-2 min-w-0 text-sm font-medium leading-snug text-foreground">
                {s.title}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{s.platform || "未发布"}</span>
                <span className="text-text-subtle">·</span>
                <span>
                  {s.subjectType === "publication" ? "已发布作品" : "内容产出"}
                </span>
              </span>
              <StartPredictionButton subject={s} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// 抖音创作者中心(seeded 来源 id)。B1:一键经 CDP 连用户登录态 Chrome 拉真实表现。
// TODO(B 后续):由用户绑定的抖音账号派生来源 id,而非硬编码 canonical。
const DOUYIN_SOURCE_ID = "src-douyin-canonical";

// ── 一键拉取抖音真实表现(核心工作流的「采集回收」一步,保留)────────────────────────────
// 调 ingestion.douyin.refresh → 后端经 CDP 连用户**已登录**的 Chrome(:9222)抓创作者中心
// 指标 → 落库为各作品的真实 analytics 快照。它是把"手填评分"翻成"编导自动评分"的数据前提。
type RefreshPhase = "idle" | "running" | "need_login" | "logging_in" | "done" | "error";

function RefreshDouyinButton() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<RefreshPhase>("idle");
  const [msg, setMsg] = React.useState("");

  const isNotLoggedIn = (err: unknown): boolean =>
    err instanceof Error &&
    (err.message.includes("DouyinNotLoggedIn") || err.message.includes("扫码登录"));

  function refresh() {
    if (phase === "running" || phase === "logging_in") return;
    setPhase("running");
    setMsg("正在抓取你抖音创作者中心的真实表现…请稍候");
    void (async () => {
      try {
        const run = (await client.refreshDouyin({
          params: undefined,
          query: undefined,
          body: { externalSourceId: DOUYIN_SOURCE_ID },
        })) as { recordsIngested?: number };
        setPhase("done");
        setMsg(
          typeof run.recordsIngested === "number"
            ? `已更新 ${run.recordsIngested} 条作品的真实表现`
            : "已更新真实表现",
        );
        router.refresh();
      } catch (err) {
        if (isNotLoggedIn(err)) {
          setPhase("need_login");
          setMsg("还没登录抖音 —— 点「登录抖音」扫码,之后自动拉取");
        } else {
          setPhase("error");
          setMsg(err instanceof Error && err.message ? err.message : "拉取失败,请重试");
        }
      }
    })();
  }

  function login() {
    if (phase === "logging_in") return;
    setPhase("logging_in");
    setMsg("已弹出 Chromium 窗口,请用抖音 App 扫码登录(最多等 4 分钟)…");
    void (async () => {
      try {
        const res = (await client.loginDouyin({
          params: undefined,
          query: undefined,
          body: {},
        })) as { loggedIn?: boolean };
        if (res.loggedIn) {
          setMsg("登录成功,开始拉取…");
          refresh(); // 登录成功直接复刷
        } else {
          setPhase("need_login");
          setMsg("没检测到登录(可能超时),请再点「登录抖音」重试");
        }
      } catch (err) {
        setPhase("error");
        setMsg(err instanceof Error && err.message ? err.message : "登录失败,请重试");
      }
    })();
  }

  const busy = phase === "running" || phase === "logging_in";

  return (
    <div className="flex items-center gap-2">
      {msg ? (
        <span
          className={cn(
            "max-w-[18rem] truncate text-[11px]",
            phase === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          title={msg}
        >
          {msg}
        </span>
      ) : null}
      {phase === "need_login" ? (
        <Button
          type="button"
          size="sm"
          data-testid="login-douyin-button"
          className="h-8 gap-1.5 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
          onClick={login}
        >
          <RefreshCw className="size-3.5" />
          登录抖音
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="refresh-douyin-button"
          className="h-8 gap-1.5 px-3 text-xs"
          disabled={busy}
          onClick={refresh}
        >
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
          {phase === "running"
            ? "拉取中…"
            : phase === "logging_in"
              ? "登录中…"
              : "拉取抖音真实表现"}
        </Button>
      )}
    </div>
  );
}

// ── 顶部工具条:rubric 版本 + 拉取抖音真实表现 ───────────────────────────────────────
function WorkbenchToolbar({
  rubric,
}: {
  readonly rubric: RubricResource | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground">
        <Gauge className="size-3.5 text-brand" />
        {rubric ? (
          <>
            <span className="font-medium text-foreground">{rubric.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              v{rubric.currentVersion.versionNumber}
            </Badge>
          </>
        ) : (
          <span>暂无评分标准</span>
        )}
      </span>
      <RefreshDouyinButton />
    </div>
  );
}

// ── 工作区根 island ───────────────────────────────────────────────────────────────
export function CalibrationWorkbench({
  overview,
  predictions,
  rubric,
  subjectTitles,
}: {
  readonly overview: CalibrationOverviewResource;
  readonly predictions: readonly PredictionResource[];
  readonly rubric: RubricResource | null;
  readonly subjectTitles: Readonly<Record<string, string>>;
}) {
  // predictionId → 回流对照行:预测行据此显示「已回流 · 偏差档」。
  const reflowByPredictionId = React.useMemo(() => {
    const m = new Map<string, ReflowRow>();
    for (const r of overview.reflowRows) m.set(r.predictionId, r);
    return m;
  }, [overview.reflowRows]);

  return (
    // 主线式纵向布局:指标带 / 工具条钉顶,主体单列纵滚 —— 左主列(进行中的预测 → 回流对照)
    // + 右侧栏(发起新预测,补充入口不占 C 位)。
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <KpiBand kpis={overview.kpis} />
      </div>

      <div className="shrink-0">
        <WorkbenchToolbar rubric={rubric} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div
          data-testid="calibration-mainline"
          className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
        >
          {/* 左主列:预测 → 采集回流 → 对照 的主线 */}
          <div className="flex min-w-0 flex-col gap-4">
            <ActivePredictionsSection
              predictions={predictions}
              reflowByPredictionId={reflowByPredictionId}
              subjectTitles={subjectTitles}
              rubric={rubric}
            />
            <ReflowTable rows={overview.reflowRows} subjectTitles={subjectTitles} />
          </div>

          {/* 右侧栏:发起新预测(补充入口) */}
          <NewPredictionRail subjects={overview.pendingSubjects} />
        </div>
      </div>
    </div>
  );
}
