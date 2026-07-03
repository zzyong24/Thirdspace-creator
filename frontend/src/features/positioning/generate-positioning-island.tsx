"use client";

/**
 * `GeneratePositioningIsland` — 定位中心的 AI 入口(T-055b,SPEC §5.1/§5.2 第一波退役)。
 *
 * 旧形态是双入口:AdoptCandidateCard 按钮任务流(createAITask→轮询→采纳卡)+
 * 「在对话里聊定位」深链。用户裁决「合并为一个,都保留为在对话里聊定位」——
 * 任务流按钮退役,唯一入口 = 打开 ChatBox 定位编导,预填话术进输入框(不自动发,
 * ai-copilot-content 的 fn 预填机制),产物走对话内 ChatPositioningCard 采纳落库
 * (confirm 门不变)。
 */

import * as React from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";

export function GeneratePositioningIsland() {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3.5">
      <p className="text-sm font-semibold text-foreground">AI 帮你定位</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        和编导聊你的账号与内容方向,生成结构化定位提案;在对话里逐条打磨,
        采纳后写入当前定位母版并追加一条 AI 版本。
      </p>
      <Link
        href={copilotDeepLink("positioning", "positioning.generate")}
        data-testid="positioning-open-copilot"
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-control bg-brand px-3.5 text-[13px] font-medium text-brand-foreground transition-colors hover:bg-brand/90"
      >
        <MessagesSquare className="size-4" />
        在对话里聊定位
      </Link>
    </div>
  );
}
