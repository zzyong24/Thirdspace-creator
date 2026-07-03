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

export function DraftChatRail({
  projectId,
  projectTitle,
}: {
  readonly projectId: string;
  readonly projectTitle: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <React.Suspense fallback={null}>
        <AICopilotContent
          embed={{
            surface: "project",
            selection: { kind: "project", id: projectId, title: projectTitle },
            persistKey: `project:${projectId}`,
            title: "编导对话",
            // [T-054 组B] 规范 §2:可见文案不夹生英文机制词,「hook」改「钩子」。
            subtitle: "聊定位、改钩子、搜素材都在这里",
          }}
        />
      </React.Suspense>
    </div>
  );
}
