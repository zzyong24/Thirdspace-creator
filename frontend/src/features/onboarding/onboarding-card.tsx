"use client";

/**
 * Dashboard 顶部常驻有序引导卡。
 * T-637 只展示创作成果路径；技术配置和自动化留在后台。force-open 让设置页可以在
 * 全部步骤完成后仍真实重新打开卡片，同页事件避免设置路由覆盖首页时状态不刷新。
 */

import * as React from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  LockIcon,
  ArrowRightIcon,
  Sparkles,
  Rocket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deriveGuidedSteps,
  isOnboardingComplete,
  progressOf,
  type GuidedStep,
  type OnboardingState,
} from "./onboarding-steps";
import {
  loadState,
  writeOrigin,
  writeReviewedImportedProjects,
} from "./onboarding-data";
import { useAccountsChanged } from "@/lib/account-events";
import { readCurrentAccountId } from "@/lib/http-transport";

/** 常驻卡「不再显示」的永久 localStorage key(onboarding 隐藏 flag)。 */
const HIDDEN_KEY = "creatoros:onboarding:hidden";
const FORCE_OPEN_KEY = "creatoros:onboarding:force-open";
export const ONBOARDING_REOPEN_EVENT = "creatoros:onboarding-reopen";

/** 读永久隐藏偏好(try/catch 降级,不抛)。 */
export function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** 写永久隐藏偏好(try/catch 降级,不抛)。 */
export function writeHidden(): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, "1");
    window.localStorage.removeItem(FORCE_OPEN_KEY);
  } catch {
    /* noop */
  }
}

export function readForceOpen(): boolean {
  try {
    return window.localStorage.getItem(FORCE_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** 设置页调用：即使旧流程已全部完成，也强制把卡片重新展开。 */
export function requestOnboardingReopen(): void {
  try {
    window.localStorage.removeItem(HIDDEN_KEY);
    window.localStorage.setItem(FORCE_OPEN_KEY, "1");
  } catch {
    /* storage 不可用时仍继续发事件，让当前页面即时响应 */
  }
  window.dispatchEvent(new Event(ONBOARDING_REOPEN_EVENT));
}

/** 定位说明按账号情况微调；入口始终回定位中心，避免再弹全局 Copilot。 */
function positioningWhy(
  step: GuidedStep,
  origin: OnboardingState["origin"],
): string {
  if (step.key !== "positioning-profile") return step.why;
  return origin === "existing"
    ? "基于你刚导入的作品,AI 会反推草拟第一版定位提案 —— 你过目采纳即可,不用从零手写。"
    : "和 AI 聊几句,把你想做的方向、受众聊清楚,生成第一版定位。之后选题和打分都会围绕这个定位来。";
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly state: OnboardingState };

export function OnboardingCard() {
  const [load, setLoad] = React.useState<Load>({ kind: "loading" });
  const [hidden, setHidden] = React.useState(readHidden);
  const [forceOpen, setForceOpen] = React.useState(readForceOpen);
  const [collapsed, setCollapsed] = React.useState(false);

  // 卸载后不再 setState(异步 loadState 回来时组件可能已卸载 → 防泄漏 / 防 warning)。
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // [T-189b] 重拉真值刷新引导态 —— 稳定 callback,挂载时跑一次、账号绑定/变更广播时再跑
  // (引导与实际行为双向绑定;loadState 内每读各自 try/catch,失败当未完成、绝不假打勾)。
  const refresh = React.useCallback(() => {
    void (async () => {
      const state = await loadState();
      if (!aliveRef.current) return;
      setLoad({ kind: "ready", state });
    })();
  }, []);

  // 挂载后拉真值；隐藏/强制打开偏好由 useState lazy initializer 读取。
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const reopen = () => {
      setHidden(false);
      setForceOpen(true);
      setCollapsed(false);
      refresh();
    };
    window.addEventListener(ONBOARDING_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(ONBOARDING_REOPEN_EVENT, reopen);
  }, [refresh]);

  // [T-189b Gap A] 订阅账号态广播(loginDouyin / 绑定成功后走 notifyAccountsChanged)→ 重拉引导态。
  //   绑了抖音后 statusDouyin.loggedIn 翻真 → 步3「扫码导入」立即变已完成、后续步解锁,不再对
  //   已绑号的人继续追问「扫码导入」。useAccountsChanged 内部 effect 清理时自动解绑,防监听泄漏。
  useAccountsChanged(refresh);

  const dismiss = React.useCallback(() => {
    writeHidden();
    setHidden(true);
    setForceOpen(false);
  }, []);

  // 起点二选一:写 localStorage 后就地更新 state.origin(不重拉后端,其余信号不变)。
  const chooseOrigin = React.useCallback((origin: "fresh" | "existing") => {
    writeOrigin(origin);
    setLoad((prev) =>
      prev.kind === "ready"
        ? { kind: "ready", state: { ...prev.state, origin } }
        : prev,
    );
  }, []);

  const reviewImportedProjects = React.useCallback(() => {
    writeReviewedImportedProjects(readCurrentAccountId());
    setLoad((previous) =>
      previous.kind === "ready"
        ? {
            kind: "ready",
            state: {
              ...previous.state,
              hasReviewedImportedProjects: true,
            },
          }
        : previous,
    );
  }, []);

  // 数据未 ready / 已永久隐藏 → 不渲。
  if (load.kind !== "ready" || hidden) return null;

  const state = load.state;
  const origin = state.origin ?? null;
  const steps = deriveGuidedSteps(state);
  // 可见步全 done → 卡自动隐藏。
  if (isOnboardingComplete(steps) && !forceOpen) return null;

  const { done, total } = progressOf(steps);
  // 当前步 = 第一个未 done 的可见步(高亮它;blocked 步不当当前步,当前步永远是「下一个能做的」)。
  const currentIndex = steps.findIndex((s) => !s.done && !s.blocked);

  return (
    <section
      data-slot="onboarding-card"
      aria-label="新手引导"
      // mt-14:避让 AppShell 顶部 absolute header(见 T-132 注)。
      className="mt-14 flex flex-col gap-3 rounded-card border border-brand/30 bg-brand-soft/30 p-4"
    >
      {/* 卡头:折叠切换 + 标题 + 进度 + 不再显示。 */}
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
          <Rocket aria-hidden="true" className="size-4 shrink-0 text-brand" />
          <span className="text-sm font-semibold text-foreground">上手引导</span>
          <span
            data-slot="onboarding-card-progress-count"
            className="text-xs text-muted-foreground"
          >
            第 {Math.min(done + 1, total)} / {total} 步
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

      {/* 进度条(折叠态也留)。 */}
      <GuidedProgressBar done={done} total={total} />

      {forceOpen && isOnboardingComplete(steps) ? (
        <p className="text-xs text-muted-foreground" data-slot="onboarding-reopened-complete">
          引导已重新打开。当前步骤都已完成，你仍可回看完整路径。
        </p>
      ) : null}

      {collapsed ? null : (
        <ol
          data-slot="onboarding-card-body"
          className="flex flex-col gap-2"
        >
          {steps.map((step, i) => (
            <GuidedStepRow
              key={step.key}
              step={step}
              isCurrent={i === currentIndex}
              origin={origin}
              onChooseOrigin={chooseOrigin}
              onReviewImportedProjects={reviewImportedProjects}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/** 进度条「第 N / M 步」。 */
function GuidedProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div data-slot="onboarding-progress" className="mt-1">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="上手进度"
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * 单个引导步行:
 *   - 左侧编号徽标:done → 打勾;blocked → 锁;否则显步号(当前步高亮 brand)。
 *   - done → 灰显划线「已完成」;blocked → 灰显 + 锁提示;current/available → 高亮 + why + CTA。
 *   - confirm-origin 步(href=#origin)→ 卡内二选一(from零 / 有存量),不跳页。
 */
function GuidedStepRow({
  step,
  isCurrent,
  origin,
  onChooseOrigin,
  onReviewImportedProjects,
}: {
  readonly step: GuidedStep;
  readonly isCurrent: boolean;
  readonly origin: OnboardingState["origin"];
  readonly onChooseOrigin: (o: "fresh" | "existing") => void;
  readonly onReviewImportedProjects: () => void;
}) {
  const isOriginStep = step.key === "confirm-origin";
  const why = positioningWhy(step, origin);
  const href = step.href;

  return (
    <li
      data-slot="onboarding-step"
      data-step-key={step.key}
      data-order={step.order}
      data-done={step.done}
      data-blocked={step.blocked}
      data-current={isCurrent}
      className={cn(
        "flex items-start gap-3 rounded-card border p-3 transition-colors",
        step.done
          ? "border-border bg-surface-subtle"
          : step.blocked
            ? "border-dashed border-border bg-surface-subtle/40 opacity-60"
            : isCurrent
              ? "border-brand bg-brand-soft/40"
              : "border-border bg-background",
      )}
    >
      {/* 编号 / 打勾 / 锁 徽标 */}
      <span
        data-slot="onboarding-step-badge"
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          step.done
            ? "border-transparent bg-brand text-primary-foreground"
            : step.blocked
              ? "border-border bg-surface text-muted-foreground"
              : isCurrent
                ? "border-brand bg-brand text-primary-foreground"
                : "border-border bg-surface text-foreground",
        )}
      >
        {step.done ? (
          <CheckIcon className="size-3.5" />
        ) : step.blocked ? (
          <LockIcon className="size-3" />
        ) : (
          step.order
        )}
      </span>

      {/* 标题 + 状态/why + CTA */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "text-sm font-medium",
              step.done
                ? "text-muted-foreground line-through"
                : step.blocked
                  ? "text-muted-foreground"
                  : "text-foreground",
            )}
          >
            {step.title}
          </p>
          {isCurrent && !step.done ? (
            <span
              data-slot="onboarding-step-current-badge"
              className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-primary-foreground"
            >
              <Sparkles className="size-2.5" />
              当前
            </span>
          ) : null}
        </div>

        {step.done ? (
          <p className="mt-0.5 text-xs text-muted-foreground">已完成</p>
        ) : step.blocked ? (
          <p
            data-slot="onboarding-step-locked"
            className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
          >
            <LockIcon className="size-3" />
            {step.blockedReason}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">{why}</p>
        )}

        {/* 起点二选一(卡内,不跳页) */}
        {isOriginStep && !step.done && !step.blocked ? (
          <div
            data-slot="onboarding-origin-choice"
            className="mt-2 flex flex-wrap gap-2"
          >
            <button
              type="button"
              data-slot="onboarding-origin-fresh"
              onClick={() => onChooseOrigin("fresh")}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand hover:bg-brand-soft/40"
            >
              从零开始
              <span className="text-[10px] text-muted-foreground">(还没在抖音发过)</span>
            </button>
            <button
              type="button"
              data-slot="onboarding-origin-existing"
              onClick={() => onChooseOrigin("existing")}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand hover:bg-brand-soft/40"
            >
              已有存量
              <span className="text-[10px] text-muted-foreground">(导入我的作品)</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* CTA(非起点步、未 done、未 blocked 才显「去做」深链) */}
      {!isOriginStep && !step.done && !step.blocked ? (
        <Button
          asChild
          variant={isCurrent ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          data-slot="onboarding-step-cta"
        >
          <Link
            href={href}
            onClick={
              step.key === "review-imported-projects"
                ? onReviewImportedProjects
                : undefined
            }
          >
            {step.ctaLabel}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      ) : null}
    </li>
  );
}
