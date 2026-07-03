"use client";

/**
 * `blind-predict-row.tsx` — 稿面发布包区的盲预测入口(T-063e,北极星 SPEC §3)。
 *
 * 飞轮第一步「盲预测」从校准页搬到它真正发生的地方:发布前的稿面。
 *  - 未预测:提示行 +「先盲预测」按钮 —— 复用现有盲预测流(createAITask
 *    taskType=calibration.diagnose,subject=本项目的 content_output → 轮询
 *    awaiting_confirmation → confirmTask 铸 draft Prediction → refresh),与
 *    校准工作台 StartPredictionButton 完全同一条链,零新 op。项目还没有
 *    ContentOutput 时先 createOutput 铸挂点(与登记已发布表单同款自愈)。
 *  - 已预测:显示服务端派生的预测分(变现加权)+ 状态(草稿/已锁定);草稿态给
 *    「锁定」(calibration.predictions.lock,盲预测不可改的形式化);深链
 *    /settings?tab=calibration 看校准历史。
 *
 * 诚实(铁律):分数/状态全部来自真实 Prediction 行;AI 失败/超时显式报错可重试,
 * 绝不假装预测完成。
 *
 * [留验] T-064 已知 bug:稿面 /projects/[id] 的 client 岛 dev 环境不水合,本入口的
 * 点击交互真机可能验不了 —— 组件 + 单测已就绪,待 T-064 修复后真机走查。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crosshair, Lock, Sparkles } from "lucide-react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BlindPredictionInfo {
  readonly predictionId: string;
  readonly status: "draft" | "locked";
  readonly predictedScore: number;
  readonly lockedAt: string | null;
}

type Phase = "idle" | "running" | "locking" | "error";

export function BlindPredictRow({
  projectId,
  projectTitle,
  outputId,
  prediction,
}: {
  readonly projectId: string;
  readonly projectTitle: string;
  /** 项目现有 ContentOutput;null = 还没有(发起时先铸一个,与登记表单同款)。 */
  readonly outputId: string | null;
  /** 本项目产出上最新的盲预测;null = 未预测。 */
  readonly prediction: BlindPredictionInfo | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  // 卸载后停止轮询 setState(长任务守卫,与校准工作台同款)。
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // 「先盲预测」:确保 output → calibration.diagnose 任务 → 轮询 → confirm → refresh。
  const start = React.useCallback(() => {
    if (phase === "running" || phase === "locking") return;
    setPhase("running");
    setError(null);
    void (async () => {
      try {
        // 1. 确保有 ContentOutput 挂点(纯站内项目可能还没走制作)。
        let subjectId = outputId;
        if (!subjectId) {
          const created = (await client.createOutput({
            params: { projectId },
            query: undefined,
            body: { title: projectTitle || "主内容" },
          })) as { id: string };
          subjectId = created.id;
        }
        // 2. 起编导诊断任务(现有盲预测流,confirm 后铸 draft Prediction)。
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: {
            taskType: "calibration.diagnose",
            inputData: { subjectType: "content_output", subjectId },
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
              router.refresh();
            }
            return;
          }
          if (status.status === "cancelled" || status.status === "failed") {
            if (!cancelledRef.current) {
              setPhase("error");
              setError("盲预测失败(可能没配模型),请重试。");
            }
            return;
          }
        }
        if (!cancelledRef.current) {
          setPhase("error");
          setError("盲预测超时,请重试。");
        }
      } catch {
        if (!cancelledRef.current) {
          setPhase("error");
          setError("盲预测出错,请重试。");
        }
      }
    })();
  }, [phase, outputId, projectId, projectTitle, router]);

  // 「锁定」:draft → locked(不可改),发布后回流对照才有效力。
  const lock = React.useCallback(() => {
    if (!prediction || prediction.status === "locked") return;
    if (phase === "running" || phase === "locking") return;
    setPhase("locking");
    setError(null);
    void (async () => {
      try {
        await client.lockPrediction({
          params: { predictionId: prediction.predictionId },
          query: undefined,
          body: undefined,
        });
        if (!cancelledRef.current) {
          setPhase("idle");
          router.refresh();
        }
      } catch {
        if (!cancelledRef.current) {
          setPhase("error");
          setError("锁定失败,请重试。");
        }
      }
    })();
  }, [prediction, phase, router]);

  return (
    <div
      data-slot="blind-predict-row"
      data-testid="blind-predict-row"
      data-predicted={prediction !== null}
      className="mt-2.5 flex flex-col gap-1.5 border-t border-border/60 pt-2.5"
    >
      {prediction === null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Crosshair className="size-3.5 shrink-0 text-brand" />
            发布前先盲预测:锁一份预测分,发布后用真实数据对照校准。
          </span>
          <Button
            type="button"
            size="sm"
            data-testid="blind-predict-button"
            className="h-7 gap-1 bg-brand px-2.5 text-[11px] text-brand-foreground hover:bg-brand/90"
            disabled={phase === "running"}
            onClick={start}
          >
            <Sparkles className="size-3.5" />
            {phase === "running"
              ? "编导盲评中…"
              : phase === "error"
                ? "重试盲预测"
                : "先盲预测"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Crosshair className="size-3.5 shrink-0 text-brand" />
            盲预测分
            <span
              data-testid="blind-predict-score"
              className="font-semibold tabular-nums text-foreground"
            >
              {prediction.predictedScore.toFixed(1)}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                prediction.status === "locked"
                  ? "bg-surface-subtle text-muted-foreground"
                  : "bg-warning-soft text-warning",
              )}
            >
              {prediction.status === "locked" ? "已锁定" : "草稿 · 未锁定"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {prediction.status === "draft" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="blind-predict-lock-button"
                className="h-7 gap-1 px-2.5 text-[11px]"
                disabled={phase === "locking"}
                onClick={lock}
              >
                <Lock className="size-3.5" />
                {phase === "locking" ? "锁定中…" : "锁定预测"}
              </Button>
            ) : null}
            <Link
              href="/settings?tab=calibration"
              data-testid="blind-predict-history-link"
              className="text-[11px] font-medium text-brand hover:underline"
            >
              看校准历史 →
            </Link>
          </span>
        </div>
      )}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
