"use client";

/**
 * 稿面选题卡(T-055a,SPEC §3.1 区块 1)。
 *
 * 折叠一行:✓ 选题已定 + 标题 + 观众/冲突摘要;展开 = 完整 BriefWorkbench
 * (T-014 既有可编辑组件,patchProject 落库链路原样复用)——治「brief 在项目
 * 导航栏不存在」:立项信息第一次有了稿面内的常驻入口。
 */

import * as React from "react";
import Link from "next/link";

import { BriefWorkbench } from "@/features/project-overview/brief-workbench";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import type { ProjectBriefDetail } from "@/types/domain";
import { cn } from "@/lib/utils";

export function TopicCard({
  projectId,
  title,
  brief,
  briefDetail,
}: {
  projectId: string;
  title: string;
  brief: string;
  briefDetail: ProjectBriefDetail | null;
}) {
  const [open, setOpen] = React.useState(false);
  // 「已定」判据:核心必填(目标受众/内容目标/核心信息,与 brief gate 对齐)非空。
  const settled = Boolean(
    briefDetail?.targetAudience?.trim() &&
      briefDetail?.contentGoal?.trim() &&
      briefDetail?.coreMessage?.trim(),
  );
  const summary = [
    briefDetail?.targetAudience ? `目标观众:${briefDetail.targetAudience}` : null,
    briefDetail?.coreMessage ? `核心信息:${briefDetail.coreMessage}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      id="topic"
      data-slot="draft-topic-card"
      data-settled={settled}
      className="scroll-mt-20 rounded-card border border-border bg-surface"
    >
      <button
        type="button"
        data-slot="draft-topic-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-card"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            settled
              ? "bg-success-soft text-success"
              : "bg-warning-soft text-warning",
          )}
        >
          {settled ? "✓" : "!"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "shrink-0 text-[11px] font-semibold",
                settled ? "text-success" : "text-warning",
              )}
            >
              {settled ? "选题已定" : "选题待补"}
            </span>
            <span className="truncate text-[13.5px] font-semibold text-foreground">
              {title}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-text-subtle">
            {summary || brief || "展开补全目标观众、内容目标与核心信息"}
          </span>
        </span>
        <span className="shrink-0 text-xs text-text-subtle">
          {open ? "收起 ▴" : "展开 ▾"}
        </span>
      </button>
      {/* [T-077b] 「选题待补」态引导:让编导在对话里把选题卡填了(brief.fill 工具)。
          深链打开 Copilot(surface=project + 选中本项目 + 预填话术),用户回车 → 模型调
          brief.fill 产字段对照卡 → 人点「写入选题卡」落库(铁律②确认门,不自动发送)。 */}
      {!settled ? (
        <div
          data-slot="draft-topic-fill-hint"
          className="border-t border-border/60 px-4 py-2"
        >
          <Link
            href={copilotDeepLink(
              "project",
              "brief.fill",
              { kind: "project", id: projectId, title },
              "根据我们聊的,帮我把选题卡填了",
            )}
            data-slot="draft-topic-fill-link"
            className="text-xs font-medium text-brand underline-offset-2 hover:underline"
          >
            让编导帮你填 →
          </Link>
        </div>
      ) : null}
      {open ? (
        <div
          data-slot="draft-topic-expanded"
          className="border-t border-border px-4 py-4"
        >
          <BriefWorkbench
            projectId={projectId}
            projectTitle={title}
            briefDetail={briefDetail ?? undefined}
          />
        </div>
      ) : null}
    </section>
  );
}
