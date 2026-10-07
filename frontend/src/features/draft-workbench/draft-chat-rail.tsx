"use client";

/**
 * 稿面右栏「编导对话」(T-055b,SPEC §5)。
 *
 * 全局 ChatBox(AICopilotContent)以内嵌模式常驻稿面右栏:
 *   - surface=project(后端 resolveSkillForSurface 已在册,回落选题编导);
 *   - selection=当前项目 → 上下文 chip 常驻可摘,后端 system 注入 + projectId 兜底;
 *   - 会话按 `project:<id>` 隔离持久化(各项目独立会话,互不串台)。
 *
 * useSearchParams 在 AICopilotContent 内部使用 → 挂 Suspense 边界(Next 要求)。
 */

import * as React from "react";

import { AICopilotContent } from "@/features/copilot/ai-copilot-content";
import { useDraftChatRequest } from "./draft-chat-request";

export function DraftChatRail({
  projectId,
  projectTitle,
  outputId,
}: {
  readonly projectId: string;
  readonly projectTitle: string;
  /**
   * [T-103a] 项目现有 ContentOutput 挂点(null=还没铸);注入 embed.blindPredict,
   * 让对话内 calibration.diagnosis 卡在稿面场景长出「锁定为盲预测」确认门。
   */
  readonly outputId?: string | null;
}) {
  // [T-108] 稿面 AI 按钮(盲预测/审核)发起的对话请求 —— 透传进 embed.request,让常驻 rail
  // 据 request.nonce 变化预填输入框 + 置 functionKey + 注入 content_output(不开全局弹层)。
  const { request,readEditorState } = useDraftChatRequest();
  const editorState=readEditorState();
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {editorState?.target?<p role="status" className="mb-2 rounded-lg bg-surface-subtle px-3 py-2 text-sm">当前{editorState.target.contentType==="article"?"文章":editorState.target.contentType==="image"?"图文":"视频"} · {editorState.dirty?"发送前将保存当前修改":"已保存稿与选区"}</p>:null}
      <React.Suspense fallback={null}>
        <AICopilotContent
          embed={{
            surface: "project",
            selection: { kind: "project", id: projectId, title: projectTitle },
            persistKey: `project:${projectId}`,
            title: "编导对话",
            // [T-054 组B] 规范 §2:可见文案不夹生英文机制词,「hook」改「钩子」。
            subtitle: "基于当前稿与选区持续调整，预览后再采纳",
            // [T-103a] 稿面盲预测:诊断卡长确认门,锁定走既有端点链铸 immutable Prediction。
            blindPredict: {
              outputId: outputId ?? null,
              projectId,
              projectTitle,
            },
            // [T-108] 外部对话请求(方案 A):稿面按钮 → context → 这里 → embed 预填 rail。
            request,
          }}
        />
      </React.Suspense>
    </div>
  );
}
