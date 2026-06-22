"use client";

/**
 * `calibration-interactive-region.tsx` — Client islands for the 校准闭环 surface
 * (七步⑤⑥ · §6.5). Marked "暂不纳入视觉门禁" until the stage-12 re-baseline (R2-9).
 *
 * needs-backend controls, each → its mapped contract op then `router.refresh()`:
 *  - `BlindPredictForm` (盲预测, pre-publish) → `client.createPrediction({ body })`
 *    (creates a `draft`).
 *  - `LockPredictionButton` (锁定预测, 发布前写死) → `client.lockPrediction({ params })`
 *    (`draft → locked`, irreversible — 盲预测不可改, §6.2).
 *  - `RecordResultForm` (回流校准) → `client.createResult({ params, body })` (computes
 *    `deviation` server-side from a verified IngestionRun, §C-4).
 *  - `BumpRubricVersionButton` (新建评分维度版本) → `client.bumpRubricVersion`
 *    (a NEW immutable RubricVersion).
 *
 * decorative controls (this wave) — issue NO Calibration network call:
 *  - `据此修正定位 / 新增选题` belongs to the positioning/candidate modules (wired there).
 *  - `采纳 AI 盲预测` rides the AI vertical (`ai.confirm` → `confirmResult` →
 *    `calibration.lockPrediction`, §C-3) — NOT a parallel candidate machine here.
 *
 * Determinism (C-5): every visible value comes from props or controlled local state
 * seeded from props; no Date.now / Math.random / fetch in render. The mutation seam
 * mirrors the monetization/positioning islands.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { PredictionResource } from "@/server/modules/calibration";

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on success
// it calls router.refresh() so the server re-reads the persisted rows.
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

const CONFIDENCES = ["high", "med", "low"] as const;

// Scoring dimensions shown on the blind-predict surface: prefer the server-resolved
// RubricVersion dimensions (so anchors flow from the seed); fall back to DEFAULT_DIMENSIONS.
type ScoringDimension = {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly description?: string;
};

const SCORE_CHOICES = [0, 1, 2, 3, 4, 5] as const;

export function BlindPredictForm({
  rubricVersionId,
  dimensions,
}: {
  readonly rubricVersionId: string;
  // Optional: the current RubricVersion's anchored dimensions. When omitted, the merged
  // DEFAULT_DIMENSIONS (with 0/3/5 anchors) are used so the form is never blind.
  readonly dimensions?: readonly ScoringDimension[];
}) {
  const { pending, run } = useMutation();
  const [subjectId, setSubjectId] = React.useState("");
  const [confidence, setConfidence] =
    React.useState<(typeof CONFIDENCES)[number]>("med");

  const scoringDimensions: readonly ScoringDimension[] =
    dimensions && dimensions.length > 0 ? dimensions : DEFAULT_DIMENSIONS;

  // Per-dimension 0-5 scores. Local-only guidance: the creator scores against each
  // anchor before betting. NOT threaded into createPrediction (the contract op takes no
  // per-dim scores this wave) — kept as the scoring workbench so anchors are actually
  // used. Honors blind immutability: no actual/real data is shown here.
  const [scores, setScores] = React.useState<Record<string, number>>({});

  const valid = subjectId.trim().length > 0;

  function submit() {
    if (!valid) return;
    run(() =>
      client.createPrediction({
        params: undefined,
        query: undefined,
        body: {
          subjectType: "content_output",
          subjectId: subjectId.trim(),
          rubricVersionId,
          predictedMetrics: {},
          predictedConversion: {},
          confidence,
        },
      }),
    );
  }

  return (
    <form
      data-testid="blind-predict-form"
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Anchored scoring surface: each dimension shows its 0/3/5 anchor so the creator
          scores against the rubric, not blind. */}
      <ul
        data-testid="rubric-scoring"
        className="flex flex-col gap-2 rounded-md border border-border p-2"
      >
        {scoringDimensions.map((dim) => (
          <li
            key={dim.key}
            data-testid={`rubric-scoring-row-${dim.key}`}
            className="flex flex-col gap-1 border-b border-border/50 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {dim.label}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  权重 {Math.round(dim.weight * 100)}%
                </span>
              </span>
              {dim.description ? (
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {dim.description}
                </span>
              ) : null}
            </div>
            <select
              aria-label={`${dim.label} 评分（0-5，对照锚点）`}
              value={scores[dim.key] ?? 3}
              onChange={(e) =>
                setScores((prev) => ({
                  ...prev,
                  [dim.key]: Number(e.target.value),
                }))
              }
              className="h-8 shrink-0 self-start rounded-md border border-border bg-background px-2 text-sm"
            >
              {SCORE_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <div className="flex w-full flex-wrap items-center gap-2">
        <Input
          aria-label="预测内容 id"
          placeholder="内容 id（content_output）"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="max-w-[14rem]"
        />
        <select
          aria-label="预测信心"
          value={confidence}
          onChange={(e) =>
            setConfidence(e.target.value as (typeof CONFIDENCES)[number])
          }
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="high">高</option>
          <option value="med">中</option>
          <option value="low">低</option>
        </select>
        <Button
          type="submit"
          disabled={pending || !valid}
          className="self-start"
        >
          盲预测
        </Button>
      </div>
    </form>
  );
}

export function PredictionRow({
  prediction,
}: {
  readonly prediction: PredictionResource;
}) {
  const { pending, run } = useMutation();
  const [runId, setRunId] = React.useState("");

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

  function recordResult() {
    if (!locked || runId.trim().length === 0) return;
    run(() =>
      client.createResult({
        params: { predictionId: prediction.id },
        query: undefined,
        body: { ingestionRunId: runId.trim(), actualMetrics: {} },
      }),
    );
  }

  return (
    <li
      data-testid="prediction-row"
      data-prediction-id={prediction.id}
      data-status={prediction.status}
      className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {prediction.subjectId}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            评分 {prediction.predictedScore}
          </Badge>
          {locked ? (
            <Badge variant="outline" className="text-[10px]">
              已锁定
            </Badge>
          ) : null}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || locked}
          onClick={lock}
        >
          锁定预测
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`回流 IngestionRun ${prediction.id}`}
          placeholder="IngestionRun id（回流数据）"
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          className="max-w-[14rem]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !locked}
          onClick={recordResult}
        >
          回流校准
        </Button>
      </div>
    </li>
  );
}

// Merged 传播+变现 rubric borrowed from cheat-on-content's calibrated v2 rubric. Each
// dimension carries a condensed 0/3/5 anchor (`description`) so scoring is anchored, not
// blind. Weights sum to 1.0. Mirrors the persistence-client canonical seed.
const DEFAULT_DIMENSIONS = [
  {
    key: "hook",
    label: "钩子强度",
    weight: 0.2,
    description:
      "前3秒能否逼观众看下去 30 秒。0=通用开场「大家好今天聊聊」；3=反直觉断言/具体承诺；5=无法停止处理的具体场景或断言",
  },
  {
    key: "emotion",
    label: "情感共鸣",
    weight: 0.2,
    description:
      "前30秒能否触发具体、可命名的情感。0=纯信息无钩子；3=一般共鸣「我也有过」；5=锐利到观众不愿承认的自我识别「这就是我」",
  },
  {
    key: "product_path",
    label: "为产品铺路",
    weight: 0.2,
    description:
      "内容能否支撑信任/转化、为产品铺路（不只追播放）。0=纯流量噱头；3=隐约关联产品价值；5=自然把观众引向信任与下一步转化",
  },
  {
    key: "social",
    label: "社会共振",
    weight: 0.15,
    description:
      "是否触及当下有争议/结构性的社会模式。0=纯个人；3=公认社会现象无新视角；5=命名一个观众认识但没有语言形容的结构性模式",
  },
  {
    key: "cta",
    label: "CTA 清晰度",
    weight: 0.15,
    description:
      "行动召唤是否清晰且不突兀。0=无 CTA；3=结尾生硬喊一句；5=CTA 与内容价值自然衔接、观众想点",
  },
  {
    key: "quotable",
    label: "金句密度",
    weight: 0.1,
    description:
      "有几句能被截图、离开视频独立传播。0=全叙述无金句；3=结尾一句；5=多句分布开场/中间/结尾、能在评论与转发里独立存活",
  },
] as const;

export function BumpRubricVersionButton({
  rubricId,
}: {
  readonly rubricId: string;
}) {
  const { pending, run } = useMutation();

  function bump() {
    run(() =>
      client.bumpRubricVersion({
        params: { rubricId },
        query: undefined,
        body: {
          dimensions: DEFAULT_DIMENSIONS.map((d) => ({ ...d })),
          changeSummary: "据校准结果微调权重",
        },
      }),
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={bump}
      data-testid="bump-rubric-version"
    >
      新建评分维度版本
    </Button>
  );
}

// Decorative (this wave): belongs to positioning/candidate modules — inert here. Issues
// NO Calibration network call (§6.5 飞轮, wired in those plans).
export function ReviseFromCalibrationButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="revise-from-calibration"
      onClick={() => {
        /* decorative — wired in positioning/candidate plans */
      }}
    >
      据此修正定位 / 新增选题
    </Button>
  );
}

// Decorative (this wave): the AI-proposed blind prediction rides the AI vertical
// (`ai.confirm` → `confirmResult` → `calibration.lockPrediction`, §C-3). Issues NO
// direct Calibration network call here (no parallel candidate machine).
export function AdoptAiPredictionButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="adopt-ai-prediction"
      onClick={() => {
        /* decorative — AI confirm flow owns this (module 15) */
      }}
    >
      采纳 AI 盲预测
    </Button>
  );
}
