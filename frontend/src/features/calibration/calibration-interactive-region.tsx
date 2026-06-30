"use client";

/**
 * `calibration-interactive-region.tsx` — Client island for the 校准中心 workbench (校准中心
 * 大改 · Slice 2, three-column rebuild). The 校准中心 is a full 校准工作台: a KPI band +
 * rubric/目标 tabs on top, three columns in the middle (待校准内容 ⇄ 发布前预测评分表 ⇄ AI
 * 编导诊断), a 发布后回流对照表 + 经验沉淀 at the bottom. The middle + right columns share ONE
 * piece of state — the selected prediction — so the whole interactive body lives in a single
 * `CalibrationWorkbench` island that owns the selection.
 *
 * needs-backend controls, each → its mapped contract op then `router.refresh()`:
 *  - `StartPredictionButton` (开始预测) → `ai.tasks.create { taskType:"calibration.diagnose",
 *    inputData:{ subjectType, subjectId } }` → poll `getTask` → `confirmTask` (mints a draft
 *    Prediction via the calibration_diagnosis confirm branch) → refresh. Mirrors the topics
 *    EnrichButton AI poll/confirm island.
 *  - `LockPredictionButton` (锁定预测版本) → `client.lockPrediction` (`draft → locked`,
 *    irreversible — 盲预测不可改, §6.2).
 *  - `NewPredictionButton` (新建预测) → selects the first 未预测 subject + scrolls the 待校准
 *    list into view (the prediction itself is minted by 开始预测; no parallel candidate
 *    machine, so this is navigation, not a fake write).
 *
 * Read-only surfaces (零造假): the 评分表 / 诊断 / 回流对照 / 经验沉淀 all render REAL jsonb
 * from the server reads (predictedConversion.dimensions, predictedMetrics.{performance,
 * diagnosis}, overview.{reflowRows,learnings}). A missing field renders 「—」/ an empty state,
 * never a fabricated value.
 *
 * Determinism (C-5): every visible value comes from props or controlled local state seeded
 * from props; no Date.now / Math.random / fetch in render.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Sparkles,
  Plus,
  Target,
  Gauge,
  CheckCircle2,
  Activity,
  Lightbulb,
  FileText,
  AlertTriangle,
  ListChecks,
  ArrowRight,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
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

// ── typed views over the prediction's FREE jsonb (维度评分约定) ──────────────────────
interface DimensionScore {
  key: string;
  score: number; // 1–5
  reason: string;
  suggestion: string;
}
interface Performance {
  完播率: number | null;
  收藏率: number | null;
  评论率: number | null;
  转化意向: number | null;
}
interface Diagnosis {
  verdict: string;
  mainIssues: string[];
  priorityFixes: string[];
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
function readPerformance(p: PredictionResource): Performance | null {
  const m = (p.predictedMetrics ?? {}) as { performance?: Record<string, unknown> };
  const perf = m.performance;
  if (!perf || typeof perf !== "object") return null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    完播率: num(perf["完播率"]),
    收藏率: num(perf["收藏率"]),
    评论率: num(perf["评论率"]),
    转化意向: num(perf["转化意向"]),
  };
}
function readDiagnosis(p: PredictionResource): Diagnosis | null {
  const m = (p.predictedMetrics ?? {}) as { diagnosis?: Record<string, unknown> };
  const d = m.diagnosis;
  if (!d || typeof d !== "object") return null;
  return {
    verdict: typeof d.verdict === "string" ? d.verdict : "",
    mainIssues: Array.isArray(d.mainIssues)
      ? (d.mainIssues.filter((x) => typeof x === "string") as string[])
      : [],
    priorityFixes: Array.isArray(d.priorityFixes)
      ? (d.priorityFixes.filter((x) => typeof x === "string") as string[])
      : [],
  };
}

// ── label maps ────────────────────────────────────────────────────────────────────
const BADGE_LABELS: Record<string, string> = {
  unpredicted: "未预测",
  locked: "已锁定",
  reflowed: "已回流",
};
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
// 校准中心大改的 4 个「目标类型」tab — a presentation grouping only (the rubric is shared);
// 全部 shows every subject, the others are honest filters when the data carries no role tag.
const GOAL_TABS = [
  { key: "all", label: "全部" },
  { key: "传播", label: "传播型" },
  { key: "涨粉", label: "涨粉型" },
  { key: "信任", label: "信任型" },
  { key: "转化", label: "转化型" },
] as const;
type GoalKey = (typeof GOAL_TABS)[number]["key"];

// ── KPI band ────────────────────────────────────────────────────────────────────
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
      ) : (
        <span className="text-[11px] text-text-subtle">—</span>
      )}
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
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
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
      <KpiCard
        icon={Activity}
        label="最近发现"
        value={kpis.latestFinding ? "1" : "—"}
        hint={kpis.latestFinding || "暂无回流发现"}
      />
    </div>
  );
}

// ── 评分 chip ────────────────────────────────────────────────────────────────────
function PerfChip({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | null;
}) {
  const has = value !== null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-1 text-[11px]">
      <span className="text-text-subtle">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          has ? "text-foreground" : "text-text-subtle",
        )}
      >
        {has ? `${value}%` : "—"}
      </span>
    </span>
  );
}

// 5-段评分条 (1–5) — fills `score` of 5 cells. Read-only (盲预测已锁,不可改).
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

// ── 左栏：待校准内容 ──────────────────────────────────────────────────────────────
function PendingSubjectRow({
  subject,
}: {
  readonly subject: CalibrationOverviewResource["pendingSubjects"][number];
}) {
  return (
    <li
      data-testid="pending-subject-row"
      data-subject-id={subject.subjectId}
      data-badge={subject.badge}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface px-3.5 py-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium leading-snug text-foreground">
          {subject.title}
        </span>
        <Badge
          variant={subject.badge === "locked" ? "secondary" : "outline"}
          className="shrink-0 text-[10px]"
        >
          {BADGE_LABELS[subject.badge] ?? subject.badge}
        </Badge>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{subject.platform || "未发布"}</span>
        <span className="text-text-subtle">·</span>
        <span>
          {subject.subjectType === "publication" ? "已发布作品" : "内容产出"}
        </span>
      </span>
      <div className="pt-0.5">
        {subject.badge === "unpredicted" ? (
          <StartPredictionButton subject={subject} />
        ) : subject.predictionId ? (
          <RecordResultButton
            predictionId={subject.predictionId}
            title={subject.title}
          />
        ) : (
          <Badge variant="outline" className="text-[10px] text-text-subtle">
            已锁定 · 等回流校准
          </Badge>
        )}
      </div>
    </li>
  );
}

// 录入真实表现(FLY-02 飞轮回流) — 对一条已锁定盲预测,逐维度录入发布后的真实评分(1–5),
// 提交走 client.createResult(不带 ingestionRunId → 服务端自建一次 source='manual' 的真 run,
// 满足 §C-4 溯源)。落库后该主体从「待校准」转入「发布后回流对照」,飞轮闭环。
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

  const openForm = React.useCallback(async () => {
    setOpen(true);
    setError(null);
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
        onClick={openForm}
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
            {loading ? (
              <p className="text-sm text-muted-foreground">读取盲预测维度…</p>
            ) : dims.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                这条盲预测没有维度评分,无法逐维度录入。
              </p>
            ) : (
              dims.map((d) => (
                <label
                  key={d.key}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{d.key}</span>
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
              ))
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

// 开始预测 — fires a calibration.diagnose AI task for THIS subject, polls to
// awaiting_confirmation, confirms (mints a draft Prediction), then refreshes so the new
// 评分表 lands. Mirrors the topics EnrichButton poll/confirm island.
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
    <Button
      type="button"
      size="sm"
      data-testid="start-prediction-button"
      className="h-7 gap-1 bg-brand px-2.5 text-xs text-brand-foreground hover:bg-brand/90"
      disabled={phase === "running"}
      onClick={start}
    >
      <Sparkles className="size-3.5" />
      {phase === "running" ? "AI 诊断中…" : phase === "error" ? "重试预测" : "开始预测"}
    </Button>
  );
}

function PendingColumn({
  subjects,
}: {
  readonly subjects: CalibrationOverviewResource["pendingSubjects"];
}) {
  return (
    <section
      data-testid="calibration-pending"
      className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface-subtle/40 p-4"
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">待校准内容</h3>
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {subjects.length}
        </Badge>
      </div>
      {subjects.length === 0 ? (
        <p
          data-testid="pending-empty"
          className="rounded-card border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
        >
          没有待校准内容。所有内容都已有盲预测，发布后回流即可校准。
        </p>
      ) : (
        // flex 真高度替代之前的 max-h-[640px] 硬高 → 列内独立滚动。
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {subjects.map((s) => (
            <PendingSubjectRow key={`${s.subjectType}:${s.subjectId}`} subject={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 中栏：发布前预测（内容预览 + 评分表） ────────────────────────────────────────────
function LockPredictionButton({
  prediction,
}: {
  readonly prediction: PredictionResource;
}) {
  const { pending, run } = useMutation();
  const locked = prediction.status === "locked";
  function lock() {
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
        已锁定预测版本
      </Badge>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      data-testid="lock-prediction-button"
      className="h-8 gap-1.5 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
      disabled={pending}
      onClick={lock}
    >
      <Lock className="size-3.5" />
      锁定预测版本
    </Button>
  );
}

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

function PredictionColumn({
  prediction,
  title,
  rubric,
}: {
  readonly prediction: PredictionResource | null;
  readonly title: string | null;
  readonly rubric: RubricResource | null;
}) {
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

  if (!prediction) {
    return (
      <section
        data-testid="calibration-prediction"
        className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4"
      >
        <h3 className="shrink-0 text-sm font-semibold text-foreground">发布前预测</h3>
        <div
          data-testid="prediction-no-selection"
          className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-surface-subtle text-text-subtle">
            <ClipboardList className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            从左边选一条待校准内容「开始预测」，或从下方已锁定预测里选一条查看评分表。
          </p>
        </div>
      </section>
    );
  }

  const dims = readDimensions(prediction).map((d) => ({
    ...d,
    label: labelByKey.get(d.key) ?? d.key,
  }));

  return (
    <section
      data-testid="calibration-prediction"
      className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4"
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">发布前预测</h3>
        <Badge
          variant={prediction.status === "locked" ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {prediction.status === "locked" ? "已锁定" : "草稿"} · 信心{" "}
          {prediction.confidence === "high"
            ? "高"
            : prediction.confidence === "low"
              ? "低"
              : "中"}
        </Badge>
      </div>

      {/* 内容预览 + 评分表可能较长 → 框内独立滚动;header 与底部动作钉住。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pr-1">
        {/* 内容预览 */}
        <div className="flex flex-col gap-1 rounded-control bg-surface-subtle px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-subtle">
            <FileText className="size-3.5 text-brand" />
            预测对象
          </span>
          <span className="text-sm font-medium leading-snug text-foreground">
            {title ?? prediction.subjectId}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {prediction.subjectType === "publication" ? "已发布作品" : "内容产出"} ·{" "}
            {prediction.subjectId}
          </span>
        </div>

        {/* 评估维度评分表 */}
        {dims.length > 0 ? (
          <div className="flex flex-col">
            <span className="mb-1 text-[11px] font-medium text-text-subtle">
              评估维度评分（变现加权 · 1–5）
            </span>
            <ul data-testid="score-table" className="flex flex-col">
              {dims.map((d) => (
                <ScoreTableRow
                  key={d.key}
                  dim={d}
                  weightLabel={weightByKey.get(d.key) ?? null}
                />
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-control border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            这条预测还没有维度评分。
          </p>
        )}
      </div>

      {/* 底部动作 (钉住) */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] text-text-subtle">
          锁定后盲预测不可改，发布后用真实数据校准
        </span>
        <LockPredictionButton prediction={prediction} />
      </div>
    </section>
  );
}

// ── 右栏：AI 编导诊断 ─────────────────────────────────────────────────────────────
function DiagnosisColumn({
  prediction,
}: {
  readonly prediction: PredictionResource | null;
}) {
  const diagnosis = prediction ? readDiagnosis(prediction) : null;
  const performance = prediction ? readPerformance(prediction) : null;
  const hasDiagnosis =
    diagnosis !== null &&
    (diagnosis.verdict !== "" ||
      diagnosis.mainIssues.length > 0 ||
      diagnosis.priorityFixes.length > 0);

  return (
    <aside
      data-testid="calibration-diagnosis"
      className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4"
    >
      <h3 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles className="size-4 text-brand" />
        AI 编导诊断
      </h3>

      {/* 诊断体可能较长 → 框内独立滚动。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pr-1">
      {!prediction ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-surface-subtle text-text-subtle">
            <Sparkles className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            选一条预测，查看 AI 编导对它的综合判断与优先修改。
          </p>
        </div>
      ) : !hasDiagnosis ? (
        <div
          data-testid="diagnosis-empty"
          className="flex flex-1 flex-col items-start gap-2 py-6"
        >
          <p className="text-sm text-muted-foreground">
            这条预测还没有 AI 编导诊断。对它「开始预测」即可生成综合判断、主要问题与优先修改。
          </p>
        </div>
      ) : (
        <>
          {/* 综合判断 */}
          {diagnosis!.verdict ? (
            <div className="flex flex-col gap-1 rounded-control bg-brand-soft/60 px-3 py-2.5">
              <span className="text-[11px] font-medium text-brand">综合判断</span>
              <span className="text-sm leading-relaxed text-foreground">
                {diagnosis!.verdict}
              </span>
            </div>
          ) : null}

          {/* 主要问题 */}
          {diagnosis!.mainIssues.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-subtle">
                <AlertTriangle className="size-3.5 text-warning" />
                主要问题
              </span>
              <ul className="flex flex-col gap-1">
                {diagnosis!.mainIssues.map((issue, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[13px] leading-snug text-foreground"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-warning" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 优先修改 */}
          {diagnosis!.priorityFixes.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-subtle">
                <ListChecks className="size-3.5 text-brand" />
                优先修改
              </span>
              <ol className="flex flex-col gap-1.5">
                {diagnosis!.priorityFixes.map((fix, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] leading-snug text-foreground"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">
                      {i + 1}
                    </span>
                    {fix}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* 预测表现 chips */}
          {performance ? (
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <span className="text-[11px] font-medium text-text-subtle">
                发布前预测表现
              </span>
              <div className="flex flex-wrap gap-1.5">
                <PerfChip label="完播率" value={performance.完播率} />
                <PerfChip label="收藏率" value={performance.收藏率} />
                <PerfChip label="评论率" value={performance.评论率} />
                <PerfChip label="转化意向" value={performance.转化意向} />
              </div>
            </div>
          ) : null}

          {prediction.status === "locked" ? (
            <p className="flex items-center gap-1.5 rounded-control bg-surface-subtle px-3 py-2 text-[11px] text-muted-foreground">
              <Activity className="size-3.5 text-brand" />
              已锁定 · 发布后回流真实数据即可在下方对照表看到偏差
            </p>
          ) : null}
        </>
      )}
      </div>
    </aside>
  );
}

// ── 底部：发布后回流对照表 ────────────────────────────────────────────────────────
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

// ── 底部：经验沉淀 ────────────────────────────────────────────────────────────────
function LearningsPanel({
  learnings,
}: {
  readonly learnings: CalibrationOverviewResource["learnings"];
}) {
  return (
    <section
      data-testid="calibration-learnings"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Lightbulb className="size-4 text-brand" />
        经验沉淀
      </h3>
      {learnings.length === 0 ? (
        <p
          data-testid="learnings-empty"
          className="rounded-card border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
        >
          还没有沉淀经验。每次回流校准后，把验证过的规律记到这里，喂回后续的选题与脚本。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {learnings.map((l) => (
            <li
              key={l.id}
              data-testid="learning-card"
              className="flex flex-col gap-1.5 rounded-control border border-border/70 bg-surface-subtle/40 p-3"
            >
              <span className="flex items-start gap-1.5">
                <Target className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <span className="text-sm font-medium leading-snug text-foreground">
                  {l.title}
                </span>
              </span>
              {l.insight ? (
                <p className="text-[12px] leading-snug text-muted-foreground">
                  {l.insight}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 顶部工具条：rubric 选择 + 目标 tabs + 新建预测 ──────────────────────────────────
function WorkbenchToolbar({
  rubric,
  goal,
  setGoal,
  onNewPrediction,
}: {
  readonly rubric: RubricResource | null;
  readonly goal: GoalKey;
  readonly setGoal: (g: GoalKey) => void;
  readonly onNewPrediction: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        data-testid="goal-tabs"
        className="flex flex-wrap items-center gap-1 rounded-control bg-surface-subtle p-1"
      >
        {GOAL_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-testid={`goal-tab-${t.key}`}
            data-active={goal === t.key ? "true" : undefined}
            onClick={() => setGoal(t.key)}
            className={cn(
              "rounded-control px-3 py-1.5 text-xs font-medium transition-colors",
              goal === t.key
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
        <Button
          type="button"
          size="sm"
          data-testid="new-prediction-button"
          className="h-8 gap-1.5 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
          onClick={onNewPrediction}
        >
          <Plus className="size-3.5" />
          新建预测
        </Button>
      </div>
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
  const [goal, setGoal] = React.useState<GoalKey>("all");

  // EFFECTIVE selection: the user's pick, else the first prediction. Self-heals when the
  // picked row leaves the list (refresh), so we never setState in an effect.
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const selectedId =
    pickedId && predictions.some((p) => p.id === pickedId)
      ? pickedId
      : (predictions[0]?.id ?? null);
  const selected = predictions.find((p) => p.id === selectedId) ?? null;

  // 目标 tab is a presentation filter over 待校准内容. The seed carries no per-subject role
  // tag, so non-「全部」tabs honestly show an empty/narrowed list rather than fabricating.
  const filteredPending = React.useMemo(() => {
    if (goal === "all") return overview.pendingSubjects;
    return overview.pendingSubjects.filter((s) => s.title.includes(goal));
  }, [goal, overview.pendingSubjects]);

  // 新建预测 → focus the first 未预测 subject so the user can 开始预测 (the draft itself is
  // minted by the diagnose flow; this is navigation, not a fake write).
  function onNewPrediction() {
    setGoal("all");
    const el = document.querySelector('[data-testid="calibration-pending"]');
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Title for the selected prediction's subject.
  const selectedTitle = selected
    ? (subjectTitles[selected.subjectId] ?? null)
    : null;

  return (
    // 固定高度填满：KPI 带 / 工具条 / 预测选择带 shrink-0 钉在顶部,三栏 flex-1 占满中段、
    // 每列各自框内滚,底部回流对照 + 经验沉淀作一个高度受限 (≤40%) 的 shrink-0 自滚区
    // (而非把整页拉长成长滚动)。
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <KpiBand kpis={overview.kpis} />
      </div>

      <div className="shrink-0">
        <WorkbenchToolbar
          rubric={rubric}
          goal={goal}
          setGoal={setGoal}
          onNewPrediction={onNewPrediction}
        />
      </div>

      {/* 已锁定预测选择带 (钉住) — quick-switch the middle/right columns across all predictions. */}
      {predictions.length > 0 ? (
        <div
          data-testid="prediction-switcher"
          className="flex shrink-0 flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5"
        >
          <span className="text-[11px] font-medium text-text-subtle">
            已锁定预测
          </span>
          {predictions.map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                data-testid="prediction-chip"
                data-prediction-id={p.id}
                data-active={active ? "true" : undefined}
                onClick={() => setPickedId(p.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border text-muted-foreground hover:border-brand/40",
                )}
              >
                {p.status === "locked" ? (
                  <Lock className="size-3" />
                ) : (
                  <FileText className="size-3" />
                )}
                <span className="max-w-[180px] truncate">
                  {subjectTitles[p.subjectId] ?? p.subjectId}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 三栏 (flex-1 占满中段,每列各自框内滚) */}
      <div
        data-testid="calibration-three-column"
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_340px]"
      >
        <PendingColumn subjects={filteredPending} />
        <PredictionColumn
          prediction={selected}
          title={selectedTitle}
          rubric={rubric}
        />
        <DiagnosisColumn prediction={selected} />
      </div>

      {/* 底部回流对照 + 经验沉淀：高度受限的自滚区 (≤40% 视高),不把整页拉成长滚动。 */}
      <div className="flex max-h-[40%] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
        <ReflowTable rows={overview.reflowRows} subjectTitles={subjectTitles} />
        <LearningsPanel learnings={overview.learnings} />
      </div>
    </div>
  );
}
