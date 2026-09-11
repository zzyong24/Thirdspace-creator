"use client";

/**
 * 稿面选题卡(T-055a,SPEC §3.1 区块 1)。
 *
 * 常驻展示当前方向、观众收益和可核对来源；展开 = 完整 BriefWorkbench
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
  // 这里只检查字段是否填齐，不作选题价值或用户确认的判断。
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
      data-fields-complete={settled}
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
          {"?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "shrink-0 text-[11px] font-semibold",
                settled ? "text-success" : "text-warning",
              )}
            >
              {"这条为什么值得做"}
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
      <dl className="grid gap-1.5 border-t border-border/60 px-4 py-3 text-xs">
        <div><dt className="inline text-text-subtle">给谁看：</dt><dd className="inline">{briefDetail?.targetAudience || "尚未明确具体观众和处境，可让编导结合已有资料判断"}</dd></div>
        <div><dt className="inline text-text-subtle">希望带来什么：</dt><dd className="inline">{briefDetail?.contentGoal || "尚未明确主要目的"}{briefDetail?.coreMessage ? ` · ${briefDetail.coreMessage}` : ""}</dd></div>
        <div><dt className="inline text-text-subtle">依据与缺口：</dt><dd className="inline">{briefDetail?.contentRadarEvidence?.sourceReferences.length ? `已有 ${briefDetail.contentRadarEvidence.sourceReferences.length} 条对标来源；仍需核对哪些经历、演示或材料属于本账号。` : "选题卡尚未记录可核对来源；不代表账号没有材料，需结合素材确认。"}</dd></div>
        {briefDetail?.contentRadarEvidence?.decomposition.reusablePattern ? <div><dt className="inline text-text-subtle">可借表达：</dt><dd className="inline">{briefDetail.contentRadarEvidence.decomposition.reusablePattern}</dd></div> : null}
        {briefDetail?.contentRadarEvidence?.strategy.replace.length ? <div><dt className="inline text-text-subtle">必须替换：</dt><dd className="inline">{briefDetail.contentRadarEvidence.strategy.replace.join("；")}</dd></div> : null}
      </dl>
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
