"use client";

/**
 * OnboardingOverlay — 新用户首次引导 checklist(T-131 b + c;T-132 三档 + 抽共用)。
 *
 * 挂载后并行拉各能力 state(loadState,from onboarding-data)→ deriveSteps → 用
 * `ui/dialog` 弹(禁原生 window.alert/confirm)。顶部进度条「已完成 N/总 M」;
 * required / recommended / optional 三组分组渲染(展示件 ProgressBar/StepGroup/
 * StepRow 已抽到 onboarding-checklist 共用,弹窗与常驻卡复用同一套)。每步:完成→
 * 打勾灰显,未完成→标题 + why +「去配置 →」跳深链。
 *
 * [T-132] 本文件由「自持装配 + 自持展示」重构为「复用 onboarding-data 的 loadState
 * + 复用 onboarding-checklist 的展示件」—— 对外行为不变(自动弹 / session-dismiss /
 * 手动重开语义一字不改),仅新增 recommended 组的渲染。
 *
 * 自动弹条件:未 dismissed 且有必备项未完成(allRequiredDone 只看 required,判据
 * 不变)。全必备完成 → 不自动弹。dismissed 存 localStorage
 * ['creatoros:onboarding:dismissed']=1(读写 try/catch 降级不抛)。dismissed 与
 * completed 分离 —— 用户可暂关但没配完,后续仍能手动重开(导出 `openOnboarding` +
 * `onboarding:open` 自定义事件,供侧栏 / 首页 / 常驻卡挂手动入口)。
 */

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  allRequiredDone,
  deriveSteps,
  progressOf,
  type OnboardingStep,
} from "./onboarding-steps";
import { loadState } from "./onboarding-data";
import { ProgressBar, StepGroup } from "./onboarding-checklist";

const DISMISS_KEY = "creatoros:onboarding:dismissed";
/** 手动重开引导的自定义事件名(shell / 侧栏 / 常驻卡 dispatch 它即弹开)。 */
export const ONBOARDING_OPEN_EVENT = "creatoros:onboarding:open";

/** 手动打开引导(供侧栏 / 首页 / 常驻卡入口调用)。仅在浏览器环境派发事件。 */
export function openOnboarding(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT));
  } catch {
    /* noop —— 事件派发失败不影响主流程 */
  }
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // localStorage 不可用(隐私模式 / SSR)→ 当未 dismissed,正常走自动弹判定。
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* noop —— 写失败不抛,dismissed 只是本地偏好 */
  }
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly steps: OnboardingStep[] };

export function OnboardingOverlay() {
  const [load, setLoad] = React.useState<Load>({ kind: "loading" });
  const [open, setOpen] = React.useState(false);
  // 手动重开:即便已 dismissed / 必备全配,用户点入口也能强制打开一次。
  const forcedRef = React.useRef(false);

  // 挂载后拉真值 → 判是否自动弹。
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const state = await loadState();
      if (!alive) return;
      const steps = deriveSteps(state);
      setLoad({ kind: "ready", steps });
      // 自动弹:未 dismissed 且有必备项未完成。全必备完成 → 不自动弹。
      if (!forcedRef.current && !readDismissed() && !allRequiredDone(steps)) {
        setOpen(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 手动重开入口(侧栏 / 首页 / 常驻卡 dispatch ONBOARDING_OPEN_EVENT)。
  React.useEffect(() => {
    function onOpen() {
      forcedRef.current = true;
      setOpen(true);
    }
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpen);
  }, []);

  // dialog 关闭 → 记 dismissed(本次会话不再自动弹;手动入口仍可重开)。
  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      writeDismissed();
    }
  }, []);

  // state 未加载完 → 不渲 dialog 内容(避免空态误弹 + 不给 shell 多渲元素)。
  if (load.kind !== "ready") return null;

  const steps = load.steps;
  const { done, total } = progressOf(steps);
  const requiredSteps = steps.filter((s) => s.group === "required");
  const recommendedSteps = steps.filter((s) => s.group === "recommended");
  const optionalSteps = steps.filter((s) => s.group === "optional");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-slot="onboarding-overlay"
        className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-lg"
      >
        <DialogHeader className="gap-1">
          <DialogTitle>快速上手</DialogTitle>
          <DialogDescription>
            按下面几步把 CreatorOS 配起来,跑通选题 → 脚本 → 发布 → 复盘飞轮。
          </DialogDescription>
        </DialogHeader>

        <ProgressBar done={done} total={total} />

        <div className="mt-4 flex flex-col gap-5 overflow-y-auto pr-1">
          <StepGroup
            heading="必备"
            hint="不配无法跑通核心流程"
            steps={requiredSteps}
            onNavigate={() => handleOpenChange(false)}
          />
          <StepGroup
            heading="建议"
            hint="配了少走弯路"
            steps={recommendedSteps}
            onNavigate={() => handleOpenChange(false)}
          />
          <StepGroup
            heading="可选(增益)"
            hint="配了体验更完整"
            steps={optionalSteps}
            onNavigate={() => handleOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
