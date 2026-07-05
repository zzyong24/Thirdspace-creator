"use client";

/**
 * onboarding-checklist — [T-132 切片 2;T-138] 引导清单的展示件。
 *
 * `ProgressBar` / `StepGroup` / `StepRow` 导出供常驻卡(onboarding-card)渲染同一套
 * 清单。(T-138 弹窗已删,常驻卡是唯一消费方。)
 * 唯一增益:
 *   - `StepGroup` 已支持传入 `heading` / `hint` —— 现在有三档(required / recommended
 *     / optional),调用方各传各自组标题;`steps.length === 0` → return null(某档为空
 *     则不渲)。
 *   - `compact` 可选 prop(供常驻卡用更紧凑间距;弹窗不传 = 原间距)。
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type OnboardingStep } from "./onboarding-steps";

/** 顶部进度条「已完成 N/总 M」。 */
export function ProgressBar({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div data-slot="onboarding-progress" className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          已完成 {done}/{total}
        </span>
        <span>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="上手进度"
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 一组步骤(某个档位)。空组 → return null(该档不渲)。 */
export function StepGroup({
  heading,
  hint,
  steps,
  onNavigate,
  compact = false,
}: {
  heading: string;
  hint: string;
  steps: readonly OnboardingStep[];
  onNavigate: () => void;
  /** 常驻卡用更紧凑间距;弹窗不传 = 原间距。 */
  compact?: boolean;
}) {
  if (steps.length === 0) return null;
  return (
    <section
      data-slot="onboarding-group"
      data-group={steps[0]?.group}
      className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-foreground">
          {heading}
        </h3>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <ul className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
        {steps.map((step) => (
          <StepRow
            key={step.key}
            step={step}
            onNavigate={onNavigate}
            compact={compact}
          />
        ))}
      </ul>
    </section>
  );
}

/** 单步行:完成 → 打勾灰显;未完成 → 标题 + why +「去配置」深链。 */
export function StepRow({
  step,
  onNavigate,
  compact = false,
}: {
  step: OnboardingStep;
  onNavigate: () => void;
  compact?: boolean;
}) {
  return (
    <li
      data-slot="onboarding-step"
      data-step-key={step.key}
      data-done={step.done}
      className={cn(
        "flex items-start gap-3 rounded-card border border-border",
        compact ? "p-2.5" : "p-3",
        step.done ? "bg-surface-subtle" : "bg-background",
      )}
    >
      <span
        data-slot="onboarding-step-status"
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
          step.done
            ? "border-transparent bg-brand text-primary-foreground"
            : "border-border text-transparent",
        )}
      >
        <CheckIcon className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            step.done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {step.title}
        </p>
        {step.done ? (
          <p className="mt-0.5 text-xs text-muted-foreground">已完成</p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">{step.why}</p>
        )}
      </div>
      {step.done ? null : (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="shrink-0"
          data-slot="onboarding-step-cta"
        >
          <Link href={step.href} onClick={onNavigate}>
            去配置
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      )}
    </li>
  );
}
