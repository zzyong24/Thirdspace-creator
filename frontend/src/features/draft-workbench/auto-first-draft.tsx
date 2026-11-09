"use client";
/**
 * 批次2-3（月明 2026-11-10）：脚本页进入时稿面为空 → 自动让右侧编导起草第一版整稿，
 * 候选出来后由整稿卡自动写入稿面（见 auto-first-draft-signal）。每个项目只自动起草一次；
 * 稿面有未保存修改/正在保存时不触发，用户仍可手动让编导起草。
 */
import * as React from "react";
import { client } from "@/lib/contract-client";
import { useDraftChatRequest } from "./draft-chat-request";
import { autoFirstDraftStorageKey, markAutoFirstDraft, scriptEditorBusy } from "./auto-first-draft-signal";

export const AUTO_FIRST_DRAFT_PROMPT =
  "稿面还是空的，请根据项目立项信息、选题和已有素材，起草第一版完整口播整稿；事实只用已有资料，缺的地方标注待补，不要编造。";

export function AutoFirstDraft({ enabled, projectId, projectTitle, outputId }: {
  enabled: boolean;
  projectId: string;
  projectTitle: string;
  outputId: string | null;
}) {
  const { openChat } = useDraftChatRequest();
  const [started, setStarted] = React.useState(false);
  React.useEffect(() => {
    if (!enabled || scriptEditorBusy()) return;
    try {
      if (localStorage.getItem(autoFirstDraftStorageKey(projectId))) return;
      localStorage.setItem(autoFirstDraftStorageKey(projectId), new Date().toISOString());
    } catch { /* 无存储时仍只在本次挂载里跑一次 */ }
    let cancelled = false;
    void (async () => {
      let subjectId = outputId;
      if (!subjectId) {
        try {
          const created = (await client.createOutput({ params: { projectId }, query: undefined, body: { title: projectTitle || "主内容" } })) as { id: string };
          subjectId = created.id;
        } catch {
          try { localStorage.removeItem(autoFirstDraftStorageKey(projectId)); } catch { /* ignore */ }
          return;
        }
      }
      if (cancelled || scriptEditorBusy()) return;
      markAutoFirstDraft(projectId);
      setStarted(true);
      openChat({ functionKey: "script.draft", prefill: AUTO_FIRST_DRAFT_PROMPT, autoSend: true, selection: { kind: "content_output", id: subjectId, title: projectTitle } });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 每个项目进入时判断一次
  }, [enabled, projectId]);
  if (!started) return null;
  return (
    <p role="status" data-slot="auto-first-draft-status" className="mb-1.5 px-0.5 text-xs text-text-subtle">
      稿面是空的，已让右侧编导起草第一版，生成后会自动写入稿面（写入前你开始编辑则不会覆盖）。
    </p>
  );
}
