"use client";

/**
 * `blind-predict-row.tsx` — 稿面发布包区的盲预测入口(T-063e → T-103a)。
 *
 * 飞轮第一步「盲预测」在发布前的稿面触发。**T-103a 起改为对话内即时反馈**(SPEC
 * 2026-07-04 ai-into-copilot-convergence §1.2/§3):点「先盲预测」不再后台静默
 * createAITask + 轮询。**T-108 修真**:稿面右栏是**常驻嵌入式 Copilot**(无独立全局弹层),
 * 原走 `copilotDeepLink`(`?copilot=open`)+ router.push 在稿面开不出、prefill 进不了 rail
 * (live bug)。改为方案 A(lift state):点击 → **先 flush 保存编辑器最新内容**(诊断最新版,
 * 非 DB 旧版)→ `onOpenChat` **自动发**盲预测话术进常驻 rail(functionKey=calibration.diagnose
 * + selection(content_output id + 项目标题)+ autoSend),编导流式产逐维度诊断 → **盲预测确认卡**
 * (ChatDiagnosisCard 的 blindPredict
 * 分支,由 embed.blindPredict 常驻注入,与开对话方式无关)上点「锁定为盲预测」→ 走既有端点链
 * 铸 immutable locked Prediction。
 *  - 未预测:提示行 +「先盲预测」按钮 —— 点击 = flush 保存最新 → 确保 content_output 挂点
 *    (纯站内项目先自愈铸一个,与登记表单同款)→ openChat 自动发进右栏常驻编导对话。
 *  - 已预测:显示服务端派生的预测分(变现加权)+ 状态(草稿/已锁定);草稿态给
 *    「锁定」(lockPrediction,盲预测不可改的形式化,作为对话锁定的补锁兜底);深链
 *    /settings?tab=calibration 看校准历史。
 *
 * 诚实(铁律):分数/状态全部来自真实 Prediction 行;确认门(锁定=immutable)保留、
 * 只是从后台任务流搬进对话卡。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crosshair, Lock, MessagesSquare } from "lucide-react";

import { client } from "@/lib/contract-client";
import { useDraftChatRequest } from "./draft-chat-request";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BlindPredictionInfo {
  readonly predictionId: string;
  readonly status: "draft" | "locked";
  readonly predictedScore: number;
  readonly lockedAt: string | null;
}

// [T-103a] 稿面盲预测的预填话术 —— 只填不发(T-055b),编导据此优先调 calibration.diagnose。
const BLIND_PREDICT_PREFILL =
  "基于这份内容,给一个发布前盲预测诊断:逐维度盲评并给综合判断,我要锁一份预测分。";

type Phase = "idle" | "opening" | "locking" | "error";

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
  // [T-108] 稿面对话请求协调器 —— 点击自动发进右栏常驻 rail(不开全局弹层)+ 发前 flush 编辑器。
  const { openChat, flushSave } = useDraftChatRequest();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  // 卸载后停止在 await 链里 setState(长任务守卫)。
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // [T-103a → T-108] 「先盲预测」:先 flush 保存编辑器最新内容(诊断最新版,非 DB 旧版)→
  // 确保 content_output 挂点 → **自动发**盲预测话术进稿面右栏常驻编导对话(functionKey=
  // calibration.diagnose + selection=content_output + autoSend)。诊断/锁定在对话里完成
  // (ChatDiagnosisCard 的 blindPredict 确认门,由 embed.blindPredict 常驻,与开对话方式无关)。
  const openCopilot = React.useCallback(() => {
    if (phase === "opening" || phase === "locking") return;
    setPhase("opening");
    setError(null);
    void (async () => {
      try {
        // [T-108 v2] 先 flush 保存编辑器在途未落库的最新内容(dirty 才真存,saved 则 no-op)。
        await flushSave();
        if (cancelledRef.current) return;
        // 纯站内项目可能还没走制作 → 先自愈铸挂点(与登记表单同款),让 selection 有真 id。
        let subjectId = outputId;
        if (!subjectId) {
          const created = (await client.createOutput({
            params: { projectId },
            query: undefined,
            body: { title: projectTitle || "主内容" },
          })) as { id: string };
          subjectId = created.id;
        }
        if (cancelledRef.current) return;
        // 方案 A:自动发进常驻 rail —— functionKey=calibration.diagnose(置顶诊断工具),
        // selection=content_output(免编导索要 id/标题),autoSend 直接发盲预测话术。
        openChat({
          functionKey: "calibration.diagnose",
          prefill: BLIND_PREDICT_PREFILL,
          autoSend: true,
          selection: {
            kind: "content_output",
            id: subjectId,
            title: projectTitle,
          },
        });
        // 自动发成功即结束(不卡在「打开对话中…」):loading 态语义修正。
        if (!cancelledRef.current) setPhase("idle");
      } catch {
        if (!cancelledRef.current) {
          setPhase("error");
          setError("打开对话出错,请重试。");
        }
      }
    })();
  }, [phase, outputId, projectId, projectTitle, openChat, flushSave]);

  // 「锁定」:draft → locked(不可改)。对话内锁定的补锁兜底(草稿已落库但没锁死时手动补)。
  const lock = React.useCallback(() => {
    if (!prediction || prediction.status === "locked") return;
    if (phase === "opening" || phase === "locking") return;
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
            发布前先盲预测:在对话里让编导逐维度盲评,锁一份预测分,发布后用真实数据对照校准。
          </span>
          {/* [gate-F1] 硬门切换点:如需强制,加 disabled={report?.verdict !== "pass"} —— 一行改动,当前按主案软门实现 */}
          <Button
            type="button"
            size="sm"
            data-testid="blind-predict-button"
            className="h-7 gap-1 bg-brand px-2.5 text-[11px] text-brand-foreground hover:bg-brand/90"
            disabled={phase === "opening"}
            onClick={openCopilot}
          >
            <MessagesSquare className="size-3.5" />
            {phase === "opening"
              ? "打开对话中…"
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
