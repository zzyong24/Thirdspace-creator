"use client";

/**
 * 项目自动处理流水线（雷达中心 / 选题只负责选方案，转写、补全资料、写稿统一在项目里完成）。
 *
 * 布局：来源素材 → 自动步骤（转写正文 / 拆解与补全资料 / 文案初稿）→ 下方原有稿面。
 * 每一步状态都来自真实数据（transcriptState / briefDetail / 脚本版本 / 雷达改写稿），不编造进度。
 * 从选题升级而来（from=topic）且选题卡未补全时，自动在右侧编导栏启动一次 brief.fill；
 * 编导产出的字段对照卡仍需人点「写入选题卡」才落库（AI 只产候选）。
 */

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, CircleDashed, ExternalLink, Loader2, MinusCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDraftChatRequest } from "./draft-chat-request";
import { TranscribeNowButton } from "./transcribe-now-button";
import type { ProjectTranscriptState } from "./draft-workbench-data";

export type PipelineOrigin = "radar" | "topic" | "imported" | "manual";
export type PipelineStepState = "done" | "running" | "todo" | "failed" | "skipped";

export interface PipelineSourceRef {
  readonly label: string;
  readonly url: string;
  readonly platform: string;
}

export const BRIEF_FILL_PREFILL =
  "请根据这个项目的选题、来源和已有素材，补全选题卡：目标观众、内容目的、核心信息。缺少的信息请标注待确认，不要编造。";

const ORIGIN_LABEL: Record<PipelineOrigin, string> = {
  radar: "来自内容雷达",
  topic: "来自选题",
  imported: "真实导入作品",
  manual: "手动新建",
};

const STATE_META: Record<PipelineStepState, { label: string; icon: LucideIcon; tone: string }> = {
  done: { label: "已完成", icon: CheckCircle2, tone: "text-success" },
  running: { label: "进行中", icon: Loader2, tone: "text-brand" },
  todo: { label: "待处理", icon: Circle, tone: "text-text-subtle" },
  failed: { label: "需要处理", icon: CircleDashed, tone: "text-warning" },
  skipped: { label: "不需要", icon: MinusCircle, tone: "text-text-subtle" },
};

export function transcriptStepState(origin: PipelineOrigin, hasDouyinAnchor: boolean, state: ProjectTranscriptState): PipelineStepState {
  // 雷达升级流水线在建项目前已完成转写（逐字稿作为后台证据保留在雷达条目）。
  if (origin === "radar") return "done";
  if (!hasDouyinAnchor) return "skipped";
  if (state === "done") return "done";
  if (state === "queued" || state === "running") return "running";
  if (state === "failed") return "failed";
  return "todo";
}

export function ProjectPipelinePanel({
  projectId,
  title,
  origin,
  sourceRefs,
  douyinExternalId,
  transcriptState,
  briefSettled,
  draftReady,
  autoFillBrief = false,
}: {
  readonly projectId: string;
  readonly title: string;
  readonly origin: PipelineOrigin;
  readonly sourceRefs: readonly PipelineSourceRef[];
  readonly douyinExternalId: string | null;
  readonly transcriptState: ProjectTranscriptState;
  readonly briefSettled: boolean;
  readonly draftReady: boolean;
  readonly autoFillBrief?: boolean;
}) {
  const { openChat } = useDraftChatRequest();
  // from=topic 时补全对话已（或即将）由下方 effect 发起，初始即标为进行中。
  const [fillStarted, setFillStarted] = React.useState(() => autoFillBrief && !briefSettled);

  const sendBriefFill = React.useCallback(() => {
    openChat({
      functionKey: "brief.fill",
      prefill: BRIEF_FILL_PREFILL,
      autoSend: true,
      selection: { kind: "project", id: projectId, title },
    });
  }, [openChat, projectId, title]);

  const startBriefFill = React.useCallback(() => {
    setFillStarted(true);
    sendBriefFill();
  }, [sendBriefFill]);

  // 只自动启动一次：同一项目在本标签页内刷新不会重复发起补全对话。
  React.useEffect(() => {
    if (!autoFillBrief || briefSettled) return;
    const key = `creatoros:project-pipeline:brief-fill:${projectId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* 无法记录时仍只在本次挂载启动一次。 */
    }
    sendBriefFill();
  }, [autoFillBrief, briefSettled, projectId, sendBriefFill]);

  const transcript = transcriptStepState(origin, Boolean(douyinExternalId), transcriptState);
  const brief: PipelineStepState = briefSettled ? "done" : fillStarted ? "running" : "todo";
  const draft: PipelineStepState = draftReady ? "done" : "todo";

  const steps: ReadonlyArray<{ key: string; label: string; state: PipelineStepState; note: string; action?: React.ReactNode }> = [
    {
      key: "transcript",
      label: "转写正文",
      state: transcript,
      note:
        transcript === "skipped"
          ? "没有关联视频来源，无需转写。"
          : transcript === "done"
            ? origin === "radar" ? "升级时已完成转写，逐字稿作为来源证据保留。" : "逐字稿已就绪。"
            : transcript === "running"
              ? "正在后台转写，完成后自动更新。"
              : "尚未取得逐字稿。",
      // 有抖音锚时始终保留原作品任务入口（已有逐字稿时它只展示原任务状态，内部禁止二次抓取）。
      action:
        douyinExternalId ? (
          <TranscribeNowButton projectId={projectId} awemeId={douyinExternalId} initialState={transcriptState} />
        ) : undefined,
    },
    {
      key: "brief",
      label: "拆解选题与补全资料",
      state: brief,
      note: briefSettled
        ? "目标观众、内容目的与核心信息已填齐。"
        : fillStarted
          ? "编导正在右侧补全，核对后点「写入选题卡」保存。"
          : "选题卡还缺目标观众、内容目的或核心信息。",
      action: briefSettled ? undefined : (
        <Button type="button" size="sm" variant="outline" onClick={startBriefFill} data-slot="pipeline-brief-fill">
          {fillStarted ? "重新让编导补全" : "让编导补全资料"}
        </Button>
      ),
    },
    {
      key: "draft",
      label: "文案初稿",
      state: draft,
      note: draftReady
        ? origin === "radar" ? "已带入雷达确认的改写稿，可在下方继续编辑。" : "已有口播稿版本。"
        : "补全资料后在下方写稿，或让右侧编导起草。",
      action: draftReady ? undefined : (
        <Link href="#script" className="inline-flex min-h-8 items-center text-sm font-medium text-brand underline-offset-2 hover:underline">
          去写稿
        </Link>
      ),
    },
  ];
  const doneCount = steps.filter((step) => step.state === "done" || step.state === "skipped").length;

  return (
    <section
      id="pipeline"
      data-slot="project-pipeline"
      aria-labelledby="project-pipeline-title"
      className="scroll-mt-20 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="project-pipeline-title" className="text-base font-semibold text-foreground">项目准备</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ORIGIN_LABEL[origin]} · 已完成 <span className="tabular-nums">{doneCount}/{steps.length}</span> 步
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(200px,0.8fr)_minmax(0,2fr)]">
        <div data-slot="pipeline-source" className="min-w-0 rounded-xl bg-surface-subtle p-4">
          <h3 className="text-sm font-semibold text-foreground">来源素材</h3>
          {sourceRefs.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {sourceRefs.slice(0, 4).map((ref) => (
                <li key={ref.url} className="min-w-0">
                  <a href={ref.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm text-brand hover:underline">
                    <span className="truncate">{ref.label}</span>
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  </a>
                  <span className="block text-xs text-text-subtle">{ref.platform}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {origin === "imported" ? "本账号已发布作品。" : "未记录外部来源，以项目选题与素材为准。"}
            </p>
          )}
        </div>

        <ol aria-label="项目自动处理步骤" className="grid min-w-0 gap-3 md:grid-cols-3">
          {steps.map((step, index) => {
            const meta = STATE_META[step.state];
            const Icon = meta.icon;
            return (
              <li
                key={step.key}
                data-step={step.key}
                data-state={step.state}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-text-subtle">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="text-sm font-semibold text-foreground">{step.label}</h3>
                </div>
                <p className={`flex items-center gap-1.5 text-xs font-medium ${meta.tone}`}>
                  <Icon className={`size-3.5 ${step.state === "running" ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
                  {meta.label}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">{step.note}</p>
                {step.action ? <div className="mt-auto pt-1">{step.action}</div> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
