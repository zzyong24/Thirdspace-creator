"use client";

/**
 * 稿面顶条「立即抓取逐字稿」(T-374)。
 *
 * 用户场景:优先级高的作品不想等每日 09:xx 自动任务 —— 手动单条立抓。仅项目有抖音锚
 * (platformRef.platform=douyin 且 externalId 非空)时由父组件渲染,位置在「看复盘」左边。
 *
 * 点击 → projects.transcribe(composition-only op,persistence-client 拦截:解析 externalId
 * → 排 transcribe.douyin ai_task → live dispatch 后台跑)。转写是分钟级 ASR,不轮询到完成:
 * 排队成功 → 「已排队,完成后刷新可见」；刷新由服务端持久状态恢复，已有逐字稿时父组件
 * 不渲染入口且写路径也拒绝二次抓取。失败诚实报错可重试。样式保持为稿面顶栏紧凑次按钮。
 */

import * as React from "react";
import { Captions, Loader2 } from "lucide-react";

import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";
import { client } from "@/lib/contract-client";

type State = "idle" | "running" | "queued" | "error";

export function TranscribeNowButton({
  projectId,
  initialState = "idle",
}: {
  projectId: string;
  initialState?: "idle" | "queued" | "running" | "failed";
}) {
  // [T-505] SSR 读 ai_tasks 后把持久状态注入；刷新不再无条件回到 idle。
  const [state, setState] = React.useState<State>(() =>
    initialState === "failed" ? "error" : initialState,
  );

  const transcribe = React.useCallback(async () => {
    setState("running");
    try {
      const attemptId = createAiTaskAttemptId();
      await client.transcribeProjectWork({
        params: { projectId },
        query: undefined,
        body: { attemptId },
      });
      setState("queued");
    } catch {
      setState("error");
    }
  }, [projectId]);

  const label =
    state === "running"
      ? "抓取中…后台跑"
      : state === "queued"
        ? "已排队,完成后刷新可见"
        : state === "error"
          ? "抓取失败,重试"
          : "立即抓取逐字稿";

  return (
    <button
      type="button"
      data-slot="draft-transcribe-now"
      onClick={() => void transcribe()}
      // queued/running 后置灰：任务已在后台跑；服务端还有稳定业务键作第二道防重。
      disabled={state === "running" || state === "queued"}
      title="从抖音立刻抓这条作品的逐字稿；已有逐字稿时不会提供此入口，转写要几分钟"
      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
    >
      {state === "running" ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Captions className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
