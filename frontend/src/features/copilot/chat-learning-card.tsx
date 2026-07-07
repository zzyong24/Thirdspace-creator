"use client";

/**
 * 对话内手录经验候选卡(T-062a,SPEC §2.4)。
 *
 * learning.capture 工具产的一条结构化经验候选({ title, insight, learningType })渲成卡,
 * 人点「存为经验」→ client.createLearning(status 默认 candidate,进复盘页裁决队列)
 * —— 铁律②确认门:AI 只产候选,人点才物化。失败显式报错(不静默);成功显「已存入裁决队列」
 * + 知识库链接([T-118c] 经验模块退役,`/experience`→`/knowledge`)。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import type { LearningCaptureType } from "@creatoros/backend/modules/ai-runtime";

// 8 类经验的中文徽章(与 learnings.create 契约 enum / 裁决台展示同源口径)。
export const LEARNING_TYPE_LABELS: Record<LearningCaptureType, string> = {
  strategy: "选题策略",
  hook: "钩子",
  structure: "结构",
  failure: "失败教训",
  process: "流程",
  editing: "剪辑",
  conversion_pattern: "转化模式",
  offer_insight: "变现洞察",
};

export interface ChatLearningSuggestion {
  title: string;
  insight: string;
  learningType: LearningCaptureType;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function ChatLearningCard({
  suggestion,
}: {
  readonly suggestion: ChatLearningSuggestion | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<SaveState>("idle");
  const [errorText, setErrorText] = React.useState("");

  const save = React.useCallback(async () => {
    if (!suggestion) return;
    setState("saving");
    setErrorText("");
    try {
      await client.createLearning({
        params: undefined,
        query: undefined,
        body: {
          title: suggestion.title,
          insight: suggestion.insight,
          learningType: suggestion.learningType,
        },
      });
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorText(describeUserError(err, "保存经验失败，请重试。"));
    }
  }, [suggestion, router]);

  // 模型没产出合形候选 → 诚实空态(不摆假卡)。
  if (!suggestion || !suggestion.title.trim()) {
    return (
      <div
        data-slot="chat-learning-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        这轮没提炼出可存的经验 —— 把经验再说具体一点试试。
      </div>
    );
  }

  const typeLabel =
    LEARNING_TYPE_LABELS[suggestion.learningType] ?? suggestion.learningType;

  return (
    <div
      data-slot="chat-learning-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        经验候选 · 确认后进裁决队列
      </span>
      <div className="flex items-start gap-2">
        <span
          data-slot="chat-learning-type"
          className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {typeLabel}
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
          {suggestion.title}
        </span>
      </div>
      {suggestion.insight ? (
        <p className="text-[11px] leading-relaxed text-text-subtle">
          {suggestion.insight}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {state === "saved" ? (
          <span
            data-slot="chat-learning-saved"
            className="text-[10px] font-medium text-success"
          >
            已存入裁决队列 ·{" "}
            <Link
              href="/knowledge"
              className="underline underline-offset-2"
            >
              去知识库查看
            </Link>
          </span>
        ) : (
          <button
            type="button"
            data-slot="chat-learning-save"
            disabled={state === "saving"}
            onClick={() => void save()}
            className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
          >
            {state === "saving"
              ? "保存中…"
              : state === "error"
                ? "重试"
                : "存为经验"}
          </button>
        )}
      </div>
      {state === "error" ? (
        <p
          data-slot="chat-learning-error"
          className="text-[11px] text-destructive"
        >
          保存失败:{errorText || "未知错误"} —— 可点「重试」。
        </p>
      ) : null}
    </div>
  );
}
