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

export function BlindPredictForm({
  rubricVersionId,
}: {
  readonly rubricVersionId: string;
}) {
  const { pending, run } = useMutation();
  const [subjectId, setSubjectId] = React.useState("");
  const [confidence, setConfidence] =
    React.useState<(typeof CONFIDENCES)[number]>("med");

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
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
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
      <Button type="submit" disabled={pending || !valid} className="self-start">
        盲预测
      </Button>
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

const DEFAULT_DIMENSIONS = [
  { key: "hook", label: "hook 强度", weight: 0.25 },
  { key: "altruism", label: "利他性", weight: 0.2 },
  { key: "persona", label: "人群匹配", weight: 0.2 },
  { key: "cta", label: "CTA 清晰度", weight: 0.15 },
  { key: "product_path", label: "为产品铺路程度", weight: 0.2 },
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
