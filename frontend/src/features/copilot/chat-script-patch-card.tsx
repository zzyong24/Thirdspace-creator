"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";

export interface ChatScriptPatchCandidate {
  readonly kind: "script.patch";
  readonly artifactId: string;
  readonly versionId: string;
  readonly sectionId: string;
  readonly originalText: string;
  readonly replacementText: string;
  readonly summary: string;
  readonly error?: string | null;
}

type ApplyState =
  | { phase: "idle" }
  | { phase: "applying" }
  | { phase: "applied"; previousVersionId: string }
  | { phase: "undone" }
  | { phase: "error"; message: string };

/**
 * T-716：AI 只产补丁候选；用户采纳后，后端应用命令重读当前真值并做三重并发校验。
 * 前端不再读取版本、拼整稿或自行创建版本，只表达用户明确的“采纳/撤销”动作。
 */
export function ChatScriptPatchCard({
  candidate,
}: {
  readonly candidate: ChatScriptPatchCandidate;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<ApplyState>({ phase: "idle" });
  const normalize = React.useCallback(
    (value: string) => value.replace(/\s+/g, " ").trim(),
    [],
  );
  const isNoOp =
    normalize(candidate.originalText) === normalize(candidate.replacementText);

  const apply = React.useCallback(async () => {
    if (state.phase === "applying" || state.phase === "applied") return;
    setState({ phase: "applying" });
    try {
      if (
        !candidate.artifactId ||
        !candidate.versionId ||
        !candidate.sectionId ||
        !candidate.originalText.trim() ||
        !candidate.replacementText.trim() ||
        isNoOp
      ) {
        throw new Error(
          candidate.error ||
            (isNoOp
              ? "建议稿与当前段原文相同，没有可采纳的修改。"
              : "这次没有生成可应用的局部修改，请重新描述要求。"),
        );
      }

      await client.applyScriptPatch({
        params: { artifactId: candidate.artifactId },
        query: undefined,
        body: {
          expectedVersionId: candidate.versionId,
          sectionId: candidate.sectionId,
          expectedOriginalText: candidate.originalText,
          replacementText: candidate.replacementText,
          changeSummary: candidate.summary || "Copilot 局部改稿",
        },
      });
      setState({ phase: "applied", previousVersionId: candidate.versionId });
      router.refresh();
    } catch (error) {
      setState({
        phase: "error",
        message: describeUserError(error, "局部改稿应用失败，请重试。"),
      });
    }
  }, [candidate, isNoOp, router, state.phase]);

  const undo = React.useCallback(async () => {
    if (state.phase !== "applied") return;
    try {
      await client.restoreArtifact({
        params: { artifactId: candidate.artifactId },
        query: undefined,
        body: { versionId: state.previousVersionId },
      });
      setState({ phase: "undone" });
      router.refresh();
    } catch (error) {
      setState({
        phase: "error",
        message: describeUserError(error, "撤销局部改稿失败，请重试。"),
      });
    }
  }, [candidate.artifactId, router, state]);

  return (
    <div
      data-slot="chat-script-patch-card"
      className="mt-1 flex w-full max-w-[560px] flex-col gap-2 rounded-xl border border-border bg-surface p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">局部改稿候选</span>
        <span className="text-[10px] text-muted-foreground">只影响当前选中段落</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-surface-subtle p-2.5">
          <p className="mb-1 text-[10px] font-medium text-muted-foreground">修改前</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {candidate.originalText || "未读取到原文"}
          </p>
        </div>
        <div className="rounded-lg border border-brand/20 bg-brand-soft/30 p-2.5">
          <p className="mb-1 text-[10px] font-medium text-brand">修改后</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {candidate.replacementText || "未生成替换内容"}
          </p>
        </div>
      </div>
      {state.phase === "error" || candidate.error || isNoOp ? (
        <p role="alert" className="text-[11px] text-destructive">
          {state.phase === "error"
            ? state.message
            : candidate.error || "建议稿与当前段原文相同，没有可采纳的修改。"}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {state.phase === "applied" ? (
          <>
            <span className="mr-auto text-[11px] text-success">已写入稿面并保存为新版本</span>
            <button
              type="button"
              data-slot="chat-script-patch-undo"
              onClick={() => void undo()}
              className="h-7 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-surface-subtle"
            >
              撤销
            </button>
          </>
        ) : state.phase === "undone" ? (
          <span className="mr-auto text-[11px] text-muted-foreground">已恢复到修改前版本</span>
        ) : (
          <button
            type="button"
            data-slot="chat-script-patch-apply"
            disabled={
              state.phase === "applying" || Boolean(candidate.error) || isNoOp
            }
            onClick={() => void apply()}
            className="h-7 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
          >
            {state.phase === "applying" ? "应用中…" : "采纳这处修改"}
          </button>
        )}
      </div>
    </div>
  );
}
