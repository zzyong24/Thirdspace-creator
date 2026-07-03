"use client";

/**
 * 阶段页编导对话常驻右栏(T-068,用户看图裁决)。
 *
 * 用户拍板:项目回阶段式展示(顶部 研究/策划/脚本/拍摄/发布/复盘 导航),但稿面的
 * 「编导对话右栏常驻」保留——所以 5 个阶段子页(research/planning/production/
 * publishing/review)统一在这层包一个右栏对话;会话与稿面同源(`project:<id>`),
 * 跨阶段/跨稿面延续同一条编导对话,不串台不断线。
 *
 * 稿面(总览 `/projects/[id]`)与 script 子页自带右栏 → 路径不匹配时原样透传,
 * 绝不双栏。项目身份取不到(SSR 兜底/未知项目)→ 不渲右栏,诚实降级。
 * 右栏仅 xl+ 视口显示(与稿面一致),窄屏不挤压阶段工作台。
 */

import * as React from "react";
import { usePathname } from "next/navigation";

import { DraftChatRail } from "@/features/draft-workbench/draft-chat-rail";

const STAGE_SEGMENTS = /\/projects\/[^/]+\/(research|planning|production|publishing|review)(\/|$)/;

export function StageChatWrapper({
  projectId,
  projectTitle,
  children,
}: {
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isStagePage = STAGE_SEGMENTS.test(pathname);
  if (!isStagePage || !projectId || !projectTitle) return <>{children}</>;

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-0">
      <div className="min-w-0 flex-1">{children}</div>
      <aside
        data-slot="stage-chat-rail"
        className="hidden w-[380px] shrink-0 border-l border-border bg-surface xl:block"
      >
        <div className="sticky top-0 h-[calc(100vh-4rem)]">
          <DraftChatRail projectId={projectId} projectTitle={projectTitle} />
        </div>
      </aside>
    </div>
  );
}
