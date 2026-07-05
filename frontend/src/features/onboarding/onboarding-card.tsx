"use client";

/**
 * OnboardingCard — [T-132 切片 3;T-138] Dashboard 顶部常驻可折叠新手清单。
 *
 * [T-138] 弹窗(overlay)已彻底删除,常驻卡是唯一的引导载体。整个 onboarding 只剩
 * 一个 localStorage flag:`creatoros:onboarding:hidden`(用户点「不再显示」后永久隐藏),
 * 无「首次自动弹」、无 dismissed 概念。
 *
 * 渲染条件(任一为真 → 不渲):
 *   - 数据未 ready(loadState 未回)→ null(不闪空态)。
 *   - readHidden() === true(用户点过「不再显示」)→ null。
 *   - isOnboardingComplete(steps) === true(required + recommended 全配)→ null(卡自动隐藏)。
 * 否则渲染一张卡:复用 onboarding-checklist 的 ProgressBar + 三档 StepGroup(compact)。
 *
 * 卡头:标题「新手清单」+ progressOf 进度;折叠切换(折叠时只留卡头+进度条);
 * 「不再显示」→ writeHidden() 后隐藏。全程用 ui/button。
 * 诚实降级:loadState 失败一律当未完成(不假打勾)。
 */

import * as React from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deriveSteps,
  isOnboardingComplete,
  progressOf,
  type OnboardingStep,
} from "./onboarding-steps";
import { loadState } from "./onboarding-data";
import { ProgressBar, StepGroup } from "./onboarding-checklist";

/** 常驻卡「不再显示」的永久 localStorage key(onboarding 唯一 flag)。 */
const HIDDEN_KEY = "creatoros:onboarding:hidden";

/** 读永久隐藏偏好(try/catch 降级,不抛)。 */
export function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    // localStorage 不可用(隐私模式 / SSR)→ 当未隐藏,正常渲染。
    return false;
  }
}

/** 写永久隐藏偏好(try/catch 降级,不抛)。 */
export function writeHidden(): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, "1");
  } catch {
    /* noop —— 写失败不抛,hidden 只是本地偏好 */
  }
}

/**
 * [T-137;T-138] 清「永久隐藏」(hidden)flag,让常驻卡下次挂载重现。
 * 设置页「重新打开新手引导」入口用它:清 flag 后导航回首页 → 常驻卡重现。
 * (T-138 弹窗已删,不再有 dismissed flag,故只清 hidden 一个。)
 */
export function clearOnboardingFlags(): void {
  try {
    window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* noop —— 清 flag 失败不影响后续导航 */
  }
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly steps: OnboardingStep[] };

export function OnboardingCard() {
  const [load, setLoad] = React.useState<Load>({ kind: "loading" });
  const [hidden, setHidden] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  // 挂载后拉真值 → deriveSteps;同时读一次永久隐藏偏好。
  React.useEffect(() => {
    let alive = true;
    setHidden(readHidden());
    void (async () => {
      const state = await loadState();
      if (!alive) return;
      setLoad({ kind: "ready", steps: deriveSteps(state) });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = React.useCallback(() => {
    writeHidden();
    setHidden(true);
  }, []);

  // 数据未 ready / 已永久隐藏 → 不渲。
  if (load.kind !== "ready" || hidden) return null;

  const steps = load.steps;
  // required + recommended 全配 → 卡自动隐藏(optional 未配不阻止退场)。
  if (isOnboardingComplete(steps)) return null;

  const { done, total } = progressOf(steps);
  const requiredSteps = steps.filter((s) => s.group === "required");
  const recommendedSteps = steps.filter((s) => s.group === "recommended");
  const optionalSteps = steps.filter((s) => s.group === "optional");

  return (
    <section
      data-slot="onboarding-card"
      aria-label="新手清单"
      // mt-14:避让 AppShell 顶部 absolute header(高 80px,z-20,悬浮盖住内容顶部);
      // 内容容器只有 py-8(32px)避让,缺口 48px 会把卡头「不再显示」压到
      // header 的搜索框/新建项目下重合 —— 加 top margin 让卡整体落到 header 下方。
      // 卡不渲染时(hidden/complete)此 margin 不生效,不影响无卡态布局。
      className="mt-14 flex flex-col gap-3 rounded-card border border-brand/30 bg-brand-soft/30 p-4"
    >
      {/* 卡头:折叠切换 + 标题 + 进度 + 操作按钮。 */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          data-slot="onboarding-card-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 text-left",
            "rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {collapsed ? (
            <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">新手清单</span>
          <span
            data-slot="onboarding-card-progress-count"
            className="text-xs text-muted-foreground"
          >
            已完成 {done}/{total}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-slot="onboarding-card-dismiss"
            className="text-muted-foreground"
            onClick={dismiss}
          >
            不再显示
          </Button>
        </div>
      </div>

      {/* 折叠态只留进度条一行;展开态渲三档清单(compact)。 */}
      <ProgressBar done={done} total={total} />

      {collapsed ? null : (
        <div
          data-slot="onboarding-card-body"
          className="flex flex-col gap-4"
        >
          <StepGroup
            heading="必备"
            hint="不配无法跑通核心流程"
            steps={requiredSteps}
            onNavigate={() => {}}
            compact
          />
          <StepGroup
            heading="建议"
            hint="配了少走弯路"
            steps={recommendedSteps}
            onNavigate={() => {}}
            compact
          />
          <StepGroup
            heading="可选(增益)"
            hint="配了体验更完整"
            steps={optionalSteps}
            onNavigate={() => {}}
            compact
          />
        </div>
      )}
    </section>
  );
}
