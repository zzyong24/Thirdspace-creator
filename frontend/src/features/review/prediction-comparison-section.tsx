/**
 * `prediction-comparison-section.tsx` — 复盘页「预测 vs 实际」对照块(T-063e)。
 *
 * 飞轮第四步「对照」并入项目复盘页:本项目的盲预测分(发布前锁定)vs 发布后
 * 真实表现的逐维度对照(数据装配见 review-workspace-data.buildPredictionComparison,
 * 全部复用现有 calibration 读 op)。纯展示 Server 组件,无客户端状态:
 *  - 无盲预测(vm=null / rows 空)→ 诚实空态「本项目未做盲预测」+ 指去稿面发起;
 *  - 已预测未回流 → 预测分 + 状态 +「等待发布数据回流」;
 *  - 已回流 → 逐维度 预测分/真实分/偏差 表(与校准历史同一数据形状)。
 *
 * Determinism (C-5):每个可见值都来自 props;no Date.now / Math.random / fetch。
 */

import * as React from "react";
import {
  Crosshair,
  Lock,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
// [T-247] 「录入实绩」确认门(client 岛):锁定未回流的预测在此人工采纳实绩
// (AI calibration_score 候选预填 → 确认 → calibration.results.create)。
import { ResultEntryGate } from "./result-entry-gate";
import type { PredictionComparisonVm } from "./review-workspace-data";

const DEVIATION_BAND_LABELS: Record<string, string> = {
  low: "低偏差",
  mid: "中偏差",
  high: "高偏差",
  none: "—",
};

function DeviationCell({ value }: { readonly value: number | null }) {
  if (value === null) return <span className="text-text-subtle">—</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color =
    value > 0
      ? "text-success"
      : value < 0
        ? "text-destructive"
        : "text-text-subtle";
  return (
    <span className={cn("flex items-center gap-0.5 tabular-nums", color)}>
      <Icon className="size-3.5" />
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

export function PredictionComparisonSection({
  vm,
  publicationScoped = false,
}: {
  /** null / rows 空 = 本项目未做盲预测(诚实空态)。 */
  readonly vm: PredictionComparisonVm | null;
  /** 有平台/日期发布范围时，空值不代表稿面从未锁分。 */
  readonly publicationScoped?: boolean;
}) {
  const rows = vm?.rows ?? [];
  return (
    <SectionCard
      title="预测 vs 实际"
      description="发布前盲预测与发布后真实表现的对照(校准飞轮)"
    >
      <div data-testid="prediction-comparison" data-rows={rows.length}>
        {rows.length === 0 ? (
          <p
            data-testid="prediction-comparison-empty"
            className="flex items-center justify-center gap-1.5 rounded-card border border-dashed border-border px-3 py-6 text-sm text-muted-foreground"
          >
            <Crosshair className="size-4" />
            {publicationScoped
              ? "所选发布范围内暂无可对照的预测。已在稿面锁分但尚未发布的内容，可先返回稿面查看；发布并关联实际版本后再在这里对照。"
              : "本项目未做盲预测。去稿面的发布包区「先盲预测」,发布后即可在这里对照。"}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <div
                key={row.predictionId}
                data-testid="prediction-comparison-row"
                data-prediction-id={row.predictionId}
                className="flex flex-col gap-2 rounded-control border border-border/70 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <Crosshair className="size-3.5 shrink-0 text-brand" />
                    盲预测分
                    <span
                      data-testid="comparison-predicted-score"
                      className="font-semibold tabular-nums"
                    >
                      {row.predictedScore.toFixed(1)}
                    </span>
                    <Badge
                      variant={row.status === "locked" ? "secondary" : "outline"}
                      className="gap-1 text-[10px]"
                    >
                      {row.status === "locked" ? (
                        <Lock className="size-3" />
                      ) : null}
                      {row.status === "locked" ? "已锁定" : "草稿"}
                    </Badge>
                  </span>
                  {row.reflow ? (
                    <Badge
                      variant={
                        row.reflow.deviationBand === "low"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-[10px]"
                    >
                      {DEVIATION_BAND_LABELS[row.reflow.deviationBand] ??
                        row.reflow.deviationBand}
                    </Badge>
                  ) : (
                    <span
                      data-testid="comparison-awaiting-reflow"
                      className="text-[11px] text-muted-foreground"
                    >
                      等待发布数据回流
                    </span>
                  )}
                </div>
                {/* [T-247] 锁定未回流 + 带维度评分 → 「录入实绩」采纳门(发布出实绩后
                    人工确认落 calibration_result,对照区随即翻已回流)。 */}
                {!row.reflow &&
                row.status === "locked" &&
                row.dimensions.length > 0 ? (
                  <ResultEntryGate
                    predictionId={row.predictionId}
                    dimensions={row.dimensions}
                  />
                ) : null}
                {row.reflow ? (
                  <>
                    {row.reflow.reason ? (
                      <p className="text-[12px] text-muted-foreground">
                        <span className="text-text-subtle">偏差原因 · </span>
                        {row.reflow.reason}
                      </p>
                    ) : null}
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
                          {row.reflow.dimensions.map((d) => (
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
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
