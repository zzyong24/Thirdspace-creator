"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Loader2, Sparkles } from "lucide-react";
import type { ExecutionTaskResourceV2 } from "@creatoros/contract";

import { Button } from "@/components/ui/button";
import { upgradeLabel, upgradeNotice, upgradeProjectId } from "./use-project-upgrade-queue";

/** 升级流水线的真实阶段（与后端 checkpoint.stage 同名）。 */
export const UPGRADE_STAGES = [
  { key: "transcribing", label: "转写正文" },
  { key: "generating", label: "拆解选题与补全资料" },
  { key: "creating_project", label: "创建项目与文案" },
] as const;

export type UpgradeStageState = "done" | "active" | "pending";

export function upgradeStageStates(task?: ExecutionTaskResourceV2): UpgradeStageState[] {
  if (!task) return UPGRADE_STAGES.map(() => "pending");
  if (task.status === "succeeded") return UPGRADE_STAGES.map(() => "done");
  const stage = (task.checkpoint as { stage?: string } | null)?.stage ?? "";
  if (stage === "completed") return UPGRADE_STAGES.map(() => "done");
  const at = UPGRADE_STAGES.findIndex((item) => item.key === stage);
  return UPGRADE_STAGES.map((_, index) => (at < 0 ? "pending" : index < at ? "done" : index === at ? "active" : "pending"));
}

const ACTIVE = ["queued", "running", "paused", "pause_requested"];

/** 雷达 / 选题共用的唯一处理入口：只有「升级为项目」，处理步骤在项目中自动完成。 */
export function RadarUpgradeAction({
  task,
  submitting,
  onUpgrade,
  onCancel,
}: {
  readonly task?: ExecutionTaskResourceV2;
  readonly submitting: boolean;
  readonly onUpgrade?: () => void;
  readonly onCancel?: () => void;
}) {
  const projectId = upgradeProjectId(task);
  const states = upgradeStageStates(task);
  const notice = upgradeNotice(task);
  const running = Boolean(task && ACTIVE.includes(task.status));
  return (
    <div data-slot="radar-upgrade-action" className="mt-3 rounded-xl border border-border bg-surface p-4">
      {task ? (
        <ol aria-label="项目自动处理步骤" className="mb-3 grid gap-2 sm:grid-cols-3">
          {UPGRADE_STAGES.map((stage, index) => {
            const state = states[index];
            return (
              <li key={stage.key} data-stage={stage.key} data-state={state} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {state === "done" ? (
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
                ) : state === "active" ? (
                  <Loader2 className="size-3.5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5" aria-hidden="true" />
                )}
                <span className={state === "active" ? "font-medium text-foreground" : undefined}>{stage.label}</span>
                <span className="sr-only">{state === "done" ? "已完成" : state === "active" ? "进行中" : "未开始"}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {projectId ? (
          <Link
            href={`/projects/${encodeURIComponent(projectId)}`}
            data-slot="radar-upgrade-open-project"
            className="inline-flex min-h-10 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            查看项目<ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : onUpgrade ? (
          <Button
            type="button"
            data-slot="radar-upgrade-button"
            onClick={onUpgrade}
            disabled={submitting || running}
            aria-busy={submitting || running}
            className="gap-1.5"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {submitting ? "正在加入…" : upgradeLabel(task)}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">当前环境暂不支持升级为项目。</p>
        )}
        {running && onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
            取消
          </Button>
        ) : null}
      </div>
      {notice ? <p role="status" className="mt-2 text-xs text-warning">{notice}</p> : null}
    </div>
  );
}
