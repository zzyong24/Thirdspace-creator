"use client";

/**
 * 对话填策划候选卡(T-077b,SPEC 2026-07-03 copilot-skill-native §1.2)。
 *
 * brief.fill 工具产的选题卡填充候选({ suggestion, current })渲成**字段对照表**
 * (字段名 / 现值(空显「未填」)/ 建议值,diff 感),人点「写入选题卡」→
 * client.patchProject({ briefDetail: current ⊕ suggestion 合并 })—— 铁律②确认门:
 * AI 只产候选,人点才物化。合并以现状为底(不丢 orientation / targetPlatforms 等
 * 未建议字段;契约 patch 是 brief_detail 整体替换)。成功显「已写入 · 去稿面看」
 * (链到 /projects/:id/script 稿面);失败显式报错可重试(不静默)。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import type {
  BriefFillSuggestion,
  BriefCurrentDetail,
} from "@/server/ai/chat-tools";

// 建议字段 → 中文名(与立项工作台 BriefWorkbench 的字段口径一致)。
const BRIEF_FIELD_LABELS: ReadonlyArray<{
  key: keyof BriefFillSuggestion;
  label: string;
}> = [
  { key: "targetAudience", label: "目标观众" },
  { key: "contentGoal", label: "内容目标" },
  { key: "contentFormat", label: "内容形式" },
  { key: "coreMessage", label: "核心信息" },
  { key: "durationEstimate", label: "预估时长" },
  { key: "successCriteria", label: "成功标准" },
];

type SaveState = "idle" | "saving" | "saved" | "error";

export function ChatBriefCard({
  suggestion,
  current,
  projectId,
}: {
  readonly suggestion: BriefFillSuggestion | null;
  readonly current: BriefCurrentDetail | null;
  readonly projectId: string | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<SaveState>("idle");
  const [errorText, setErrorText] = React.useState("");

  // 有建议值的字段行(模型只填聊到的字段;全空 = 没提炼出来,渲诚实空态)。
  const rows = BRIEF_FIELD_LABELS.filter(
    (f) => typeof suggestion?.[f.key] === "string" && suggestion[f.key]!.trim(),
  );

  const save = React.useCallback(async () => {
    if (!suggestion || !projectId) return;
    setState("saving");
    setErrorText("");
    try {
      // 合并:现状为底 + 建议字段覆盖(契约 patch 整体替换 brief_detail,必须带全现状,
      // 否则 orientation / targetPlatforms 等未建议字段会被抹掉)。
      const merged: BriefCurrentDetail & { targetPlatforms: string[] } = {
        ...(current ?? {}),
        targetPlatforms: current?.targetPlatforms ?? [],
      };
      for (const f of BRIEF_FIELD_LABELS) {
        const v = suggestion[f.key];
        if (typeof v === "string" && v.trim()) merged[f.key] = v.trim();
      }
      await client.patchProject({
        params: { projectId },
        query: undefined,
        body: { briefDetail: merged },
      });
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setErrorText(describeUserError(err, "写入选题卡失败，请重试。"));
    }
  }, [suggestion, current, projectId, router]);

  // 模型没提炼出任何可填字段 → 诚实空态(不摆假对照表)。
  if (!suggestion || rows.length === 0) {
    return (
      <div
        data-slot="chat-brief-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        这轮没听出可填的选题卡字段 —— 把观众、目标、核心信息再聊具体一点试试。
      </div>
    );
  }

  // 无项目上下文(全局对话没绑项目)→ 诚实说明,不摆一个点了写不进去的按钮。
  if (!projectId) {
    return (
      <div
        data-slot="chat-brief-card"
        data-no-project="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        没有找到要写入的项目 —— 请在项目内对话(稿面右栏)里让我填选题卡,或先 @ 一个项目。
      </div>
    );
  }

  return (
    <div
      data-slot="chat-brief-card"
      className="mt-1 flex w-full max-w-[460px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        选题卡候选 · 确认后写入
      </span>
      {/* 字段对照表:字段名 / 现值(空显「未填」)/ 建议值 —— diff 感。 */}
      <table data-slot="chat-brief-diff" className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[10px] text-muted-foreground">
            <th className="py-0.5 pr-2 font-medium">字段</th>
            <th className="py-0.5 pr-2 font-medium">现值</th>
            <th className="py-0.5 font-medium">建议值</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const cur = current?.[f.key];
            const curText =
              typeof cur === "string" && cur.trim() ? cur : "未填";
            return (
              <tr
                key={f.key}
                data-slot="chat-brief-row"
                data-field={f.key}
                className="border-t border-border/60 align-top"
              >
                <td className="py-1 pr-2 font-medium text-foreground">
                  {f.label}
                </td>
                <td
                  className={
                    curText === "未填"
                      ? "py-1 pr-2 text-text-subtle"
                      : "py-1 pr-2 text-muted-foreground line-through decoration-border"
                  }
                >
                  {curText}
                </td>
                <td className="py-1 font-medium text-brand">
                  {suggestion[f.key]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2">
        {state === "saved" ? (
          <span
            data-slot="chat-brief-saved"
            className="text-[10px] font-medium text-success"
          >
            已写入选题卡 ·{" "}
            <Link
              href={`/projects/${projectId}/script`}
              className="underline underline-offset-2"
            >
              去稿面看
            </Link>
          </span>
        ) : (
          <button
            type="button"
            data-slot="chat-brief-save"
            disabled={state === "saving"}
            onClick={() => void save()}
            className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
          >
            {state === "saving"
              ? "写入中…"
              : state === "error"
                ? "重试"
                : "写入选题卡"}
          </button>
        )}
      </div>
      {state === "error" ? (
        <p
          data-slot="chat-brief-error"
          className="text-[11px] text-destructive"
        >
          写入失败:{errorText || "未知错误"} —— 可点「重试」。
        </p>
      ) : null}
    </div>
  );
}
