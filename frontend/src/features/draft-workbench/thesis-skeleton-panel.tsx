"use client";

import * as React from "react";
import { GitBranch, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDraftChatRequest } from "./draft-chat-request";
import type {
  ThesisColumn,
  ThesisSkeletonNode,
} from "@/features/script/script-editor-data";

// [T-127] 稿面「论点骨架」面板 —— 把原本埋在 Copilot(planning.thesis 生成 + 采纳成 thesis_tree
// artifact)、稿面看不到的论点显性化到稿面(选题卡 → 备料 CTA → **论点骨架** → 脚本)。用户复盘
// 「不知道要先立论点」的根因 = 论点不可见;本面板让核心论点 + 支撑/证据/反驳分支在稿面一眼可见。
//
// 本首版 = **可见 + 立论点/重立**(读只读 + 深链 planning.thesis 到右栏编导对话生成/重生成)。
// 用户拍板的「可编辑增删排 + 每分论点挂 1-2 素材」是设计敏感交互(数据蓝图编辑器),按 T-063R 铁律
// 先出这一版给用户 preview 复看、确认交互再实现,避免盲建。采纳后论点经 CreativeContext.thesisBrief
// 自动喂进写脚本 facet(SEAM 已通,T-127d),脚本有据可依。

// 锁定展示顺序 + 列标签(与 server/ai/creative-context 的 THESIS_COLUMN_LABEL 同源)。
const COLUMN_ORDER: ReadonlyArray<ThesisColumn> = [
  "core",
  "support",
  "evidence",
  "counter",
];
const COLUMN_LABEL: Record<ThesisColumn, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};

// 立论点深链话术(与 creation-flow-ctas 的「立论点」按钮同款,单一创作流步骤)。
const THESIS_PREFILL =
  "基于选题、我的定位和已搜到的素材,帮我立一棵论点树:核心论点 + 支撑/证据/反驳分支。";

export function ThesisSkeletonPanel({
  nodes,
}: {
  nodes: ReadonlyArray<ThesisSkeletonNode> | null;
}) {
  const { openChat } = useDraftChatRequest();
  const buildThesis = React.useCallback(() => {
    openChat({
      functionKey: "planning.thesis",
      prefill: THESIS_PREFILL,
      autoSend: true,
    });
  }, [openChat]);

  const hasThesis = nodes != null && nodes.length > 0;

  return (
    <section
      data-slot="thesis-skeleton-panel"
      data-has-thesis={hasThesis ? "true" : "false"}
      aria-label="论点骨架"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            <GitBranch className="size-4 text-brand" aria-hidden="true" />
            论点骨架
          </h2>
          <p className="text-xs text-text-subtle">
            写脚本前先立论点:核心论点 + 支撑/证据/反驳 —— 采纳后自动作为写脚本的依据。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-xs"
          onClick={buildThesis}
        >
          <Sparkles className="size-3.5" />
          {hasThesis ? "重新立论点" : "立论点"}
        </Button>
      </div>

      {hasThesis ? (
        <div data-slot="thesis-skeleton-body" className="flex flex-col gap-2.5">
          {COLUMN_ORDER.map((col) => {
            const inColumn = nodes.filter((n) => n.column === col);
            if (inColumn.length === 0) return null;
            const isCore = col === "core";
            return (
              <div
                key={col}
                data-slot="thesis-column"
                data-column={col}
                className="flex flex-col gap-1.5"
              >
                <span
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    isCore ? "text-brand" : "text-text-subtle",
                  )}
                >
                  {COLUMN_LABEL[col]}
                </span>
                <ul className="flex flex-col gap-1.5">
                  {inColumn.map((n, i) => (
                    <li
                      key={`${col}-${i}`}
                      data-slot="thesis-node"
                      className={cn(
                        "rounded-md border px-2.5 py-1.5",
                        isCore
                          ? "border-brand/40 bg-brand-soft"
                          : "border-border bg-surface-subtle",
                      )}
                    >
                      {n.title ? (
                        <p className="text-[12.5px] font-medium text-foreground">
                          {n.title}
                        </p>
                      ) : null}
                      {n.summary ? (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {n.summary}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="text-[11px] text-text-subtle">
            想加/删分论点或改挂素材?在右侧编导对话里让我调整,或点「重新立论点」重生成。
          </p>
        </div>
      ) : (
        <div
          data-slot="thesis-skeleton-empty"
          className="rounded-md border border-dashed border-border bg-surface-subtle px-3 py-4 text-center"
        >
          <p className="text-xs text-muted-foreground">
            还没立论点。先搜素材、再基于素材立论点 —— 核心论点 + 支撑/证据/反驳会显示在这里,写脚本时自动作为依据。
          </p>
        </div>
      )}
    </section>
  );
}
