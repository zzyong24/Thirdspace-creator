"use client";

/**
 * 稿面成熟度条 + 主行动按钮(T-055a,SPEC §3.2)。
 *
 * 阶段从「七个页面的导航」降级为「稿子的成熟度标记」:五个点对 currentStage
 * 七枚举做 UI 分组(枚举不改,零数据迁移)。点击行为:
 *   选题/脚本/发布 → 页内滚动到稿面对应区块锚点;
 *   制作 → 跳独立制作工作台(用户拍板保留);复盘 → 跳复盘页。
 *
 * 主行动随成熟度变:选题/脚本态「定稿,进制作 →」(transitionProjectStage 到
 * production,best-effort 与 WorkspacePrimaryAction 同款语义)、制作态「打开
 * 制作工作台 →」、发布态「去发布 →」(滚动)、复盘态「看复盘 →」。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import type { ProjectStageName } from "@/types/domain";

// 五个成熟度点(SPEC §3.2 映射表)。
const MATURITY_STEPS = [
  { id: "topic", label: "选题", stages: ["brief", "research", "planning"], anchor: "#topic" },
  { id: "script", label: "脚本", stages: ["script"], anchor: "#script" },
  { id: "production", label: "制作", stages: ["production"], anchor: null },
  { id: "publish", label: "发布", stages: ["publishing"], anchor: "#publish" },
  { id: "review", label: "复盘", stages: ["review"], anchor: null },
] as const;

function stepIndexOf(stage: ProjectStageName): number {
  const i = MATURITY_STEPS.findIndex((s) =>
    (s.stages as ReadonlyArray<string>).includes(stage),
  );
  return i === -1 ? 0 : i;
}

function scrollToAnchor(anchor: string) {
  const el = document.querySelector(anchor);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function MaturityBar({
  projectId,
  currentStage,
}: {
  projectId: string;
  currentStage: ProjectStageName;
}) {
  const router = useRouter();
  const nowIndex = stepIndexOf(currentStage);

  const onStep = React.useCallback(
    (step: (typeof MATURITY_STEPS)[number]) => {
      if (step.id === "production") {
        router.push(`/projects/${projectId}/production`);
        return;
      }
      if (step.id === "review") {
        router.push(`/projects/${projectId}/review`);
        return;
      }
      if (step.anchor) scrollToAnchor(step.anchor);
    },
    [projectId, router],
  );

  return (
    <div
      data-slot="maturity-bar"
      role="group"
      aria-label="内容成熟度"
      className="flex items-center"
    >
      {MATURITY_STEPS.map((step, i) => {
        const done = i < nowIndex;
        const now = i === nowIndex;
        return (
          <React.Fragment key={step.id}>
            {i > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-2 h-px w-4",
                  done || now ? "bg-success" : "bg-border",
                )}
              />
            ) : null}
            <button
              type="button"
              data-slot="maturity-step"
              data-step={step.id}
              data-state={done ? "done" : now ? "now" : "todo"}
              onClick={() => onStep(step)}
              className="group flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md px-0.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
                  done &&
                    "border-success bg-success-soft text-success",
                  now &&
                    "border-brand bg-brand text-white shadow-[0_0_0_3px_var(--color-brand-soft)]",
                  !done && !now && "border-border bg-surface text-text-subtle",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] whitespace-nowrap",
                  now ? "font-semibold text-brand" : done ? "text-success" : "text-text-subtle",
                )}
              >
                {step.label}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 主行动按钮
// ---------------------------------------------------------------------------

export function DraftPrimaryAction({
  projectId,
  currentStage,
  scriptHasVersion,
}: {
  projectId: string;
  currentStage: ProjectStageName;
  scriptHasVersion: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  // 选题/脚本 → 定稿进制作(transition);production → 打开制作台;
  // publishing → 滚到发布包;review → 看复盘。
  const isEarly = ["brief", "research", "planning", "script"].includes(currentStage);

  const finalizeToProduction = React.useCallback(() => {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        // 与 WorkspacePrimaryAction 同款 best-effort:状态机拒绝(已完成等)也照常导航。
        try {
          await client.transitionProjectStage({
            params: { projectId, stage: "production" },
            query: undefined,
            body: {},
          });
        } catch {
          // best-effort:导航照走。
        }
        router.push(`/projects/${projectId}/production`);
        router.refresh();
      } finally {
        setPending(false);
      }
    })();
  }, [pending, projectId, router]);

  if (isEarly) {
    return (
      <Button
        type="button"
        size="sm"
        data-slot="draft-primary-action"
        disabled={pending || !scriptHasVersion}
        title={scriptHasVersion ? undefined : "脚本保存一版后才能定稿"}
        onClick={finalizeToProduction}
      >
        定稿,进制作 →
      </Button>
    );
  }
  if (currentStage === "production") {
    return (
      <Button
        type="button"
        size="sm"
        data-slot="draft-primary-action"
        onClick={() => router.push(`/projects/${projectId}/production`)}
      >
        打开制作工作台 →
      </Button>
    );
  }
  if (currentStage === "publishing") {
    return (
      <Button
        type="button"
        size="sm"
        data-slot="draft-primary-action"
        onClick={() => scrollToAnchor("#publish")}
      >
        去发布 →
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      data-slot="draft-primary-action"
      onClick={() => router.push(`/projects/${projectId}/review`)}
    >
      看复盘 →
    </Button>
  );
}
