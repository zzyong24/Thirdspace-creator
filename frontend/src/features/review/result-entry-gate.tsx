"use client";

/**
 * [T-247] 「录入实绩」确认门 —— 校准飞轮最后一环的人工采纳步。
 *
 * calibration-score-runner 的铁律②:AI 只产**不可 formalize** 的 `calibration_score`
 * 候选(resultData.dimensions),真正落 calibration_result 必须由人确认后走
 * `calibration.results.create`(采纳门)。此前后端/runner 都在,**前端确认 UI 一直缺**
 * —— 锁定的盲预测永远等不来实绩,对照区恒显「等待发布数据回流」。
 *
 * 交互:
 *   - 展开门时,尝试从最近的 calibration.score 任务候选里找本预测的 AI 真实分
 *     (ai.tasks.list taskType 过滤 → ai.tasks.results.list 匹配 resultData.predictionId)
 *     → **预填**各维度录入框;找不到候选 → 空框手动录入(可行最小版,诚实降级);
 *   - 人改/确认 → `calibration.results.create`(actualMetrics = { 维度key: 1-5 分};
 *     不带 ingestionRunId → 服务端自建一次 source='manual' 的真实 run,契约注释约定)
 *     → router.refresh(),对照区翻「已回流」逐维度表。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, Sparkles } from "lucide-react";

import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import { cn } from "@/lib/utils";

export interface ResultEntryDimension {
  readonly key: string;
  readonly predicted: number | null;
}

interface TaskDto {
  readonly id: string;
  readonly status: string;
}

interface TaskResultDto {
  readonly resultType: string;
  readonly resultData: Record<string, unknown>;
}

// 从 calibration.score 候选里找本预测的维度真实分(找不到 → null,手动录入)。
async function findScoreCandidate(
  predictionId: string,
): Promise<ReadonlyMap<string, number> | null> {
  const tasks = (await client.listAITasks({
    params: undefined,
    query: { page: 1, pageSize: 10, taskType: "calibration.score" },
    body: undefined,
  })) as unknown as ReadonlyArray<TaskDto>;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    try {
      const results = (await client.listTaskResults({
        params: { taskId: task.id },
        query: undefined,
        body: undefined,
      })) as unknown as ReadonlyArray<TaskResultDto>;
      for (const result of Array.isArray(results) ? results : []) {
        if (result.resultType !== "calibration_score") continue;
        const data = result.resultData as {
          predictionId?: unknown;
          dimensions?: Array<{ key?: unknown; score?: unknown }>;
        };
        if (data.predictionId !== predictionId) continue;
        if (!Array.isArray(data.dimensions)) continue;
        const map = new Map<string, number>();
        for (const d of data.dimensions) {
          if (typeof d?.key === "string" && typeof d.score === "number") {
            map.set(d.key, d.score);
          }
        }
        if (map.size > 0) return map;
      }
    } catch {
      // 单任务结果读失败 → 跳过,继续找(不沉整个预填)。
    }
  }
  return null;
}

export function ResultEntryGate({
  predictionId,
  dimensions,
}: {
  readonly predictionId: string;
  readonly dimensions: ReadonlyArray<ResultEntryDimension>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // 各维度录入草稿(字符串,空 = 未填)。
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [prefillPhase, setPrefillPhase] = React.useState<
    "idle" | "loading" | "prefilled" | "manual"
  >("idle");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 旧预测无维度约定 → 无从逐维录入(边界:最小版不支持自由 metric 键)。
  if (dimensions.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setError(null);
    if (next && prefillPhase === "idle") {
      setPrefillPhase("loading");
      void (async () => {
        try {
          const candidate = await findScoreCandidate(predictionId);
          if (candidate) {
            setDrafts((prev) => {
              const merged: Record<string, string> = { ...prev };
              for (const d of dimensions) {
                const v = candidate.get(d.key);
                if (v !== undefined && !merged[d.key]) merged[d.key] = String(v);
              }
              return merged;
            });
            setPrefillPhase("prefilled");
          } else {
            setPrefillPhase("manual");
          }
        } catch {
          // 候选读失败 → 手动录入(诚实降级,不编 AI 分)。
          setPrefillPhase("manual");
        }
      })();
    }
  };

  // 全部维度都填了 1-5 的合法整数才可提交。
  const parsed: Array<{ key: string; score: number }> = [];
  let valid = true;
  for (const d of dimensions) {
    const raw = (drafts[d.key] ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 1 || n > 5) {
      valid = false;
      continue;
    }
    parsed.push({ key: d.key, score: n });
  }

  const submit = () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const actualMetrics: Record<string, number> = {};
        for (const p of parsed) actualMetrics[p.key] = p.score;
        // 不带 ingestionRunId → 服务端自建 source='manual' 真实 run(契约约定)。
        await client.createResult({
          params: { predictionId },
          query: undefined,
          body: { actualMetrics },
        });
        setOpen(false);
        router.refresh(); // 对照区经 overview.reflowRows 翻「已回流」。
      } catch (err) {
        setError(describeUserError(err, "录入实绩失败，请重试。"));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div data-slot="result-entry-gate" data-prediction-id={predictionId}>
      <button
        type="button"
        data-slot="result-entry-toggle"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex h-7 items-center gap-1.5 rounded-control border border-brand/30 bg-brand-soft/50 px-2.5 text-[11px] font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft"
      >
        <ClipboardCheck className="size-3.5" />
        {open ? "收起录入" : "录入实绩"}
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-control border border-border/70 bg-surface-subtle/50 p-2.5">
          {prefillPhase === "loading" ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              正在找编导自动评分候选…
            </p>
          ) : prefillPhase === "prefilled" ? (
            <p
              data-slot="result-entry-prefill-hint"
              className="flex items-center gap-1.5 text-[11px] text-brand"
            >
              <Sparkles className="size-3" />
              已按编导自动评分候选预填,确认或修改后录入。
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              暂无自动评分候选,请按真实表现逐维打分(1-5)。
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {dimensions.map((d) => (
              <label
                key={d.key}
                data-slot="result-entry-row"
                data-dimension-key={d.key}
                className="flex items-center gap-2 text-[12px] text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">
                  {d.key}
                  {d.predicted !== null ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      (预测 {d.predicted})
                    </span>
                  ) : null}
                </span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  inputMode="numeric"
                  data-slot="result-entry-input"
                  aria-label={`${d.key} 真实分(1-5)`}
                  value={drafts[d.key] ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [d.key]: e.target.value }))
                  }
                  className="h-7 w-16 rounded-md border border-border bg-surface px-2 text-[12px] tabular-nums text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-slot="result-entry-submit"
              disabled={!valid || busy}
              onClick={submit}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50",
              )}
            >
              {busy ? <Loader2 className="size-3 animate-spin" /> : null}
              确认录入
            </button>
            <span className="text-[10px] text-muted-foreground">
              确认后落校准结果,偏差按当初盲预测逐维计算。
            </span>
          </div>
          {error ? (
            <p
              data-slot="result-entry-error"
              role="alert"
              className="text-[11px] text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
