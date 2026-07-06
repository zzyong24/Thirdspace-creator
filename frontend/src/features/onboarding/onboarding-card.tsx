"use client";

/**
 * OnboardingCard — [T-161] Dashboard 顶部常驻**有序引导流**卡(重构自 T-132/T-138 扁平清单卡)。
 *
 * 从「三档打勾清单」改「有序引导流」(SPEC `2026-07-06-onboarding-guided-flow-design.md`):
 *   - 竖向编号步(order 1..N)、当前步高亮、前置未满足(blocked)置灰 + 锁提示。
 *   - 起点分支:步2「确认起点」= 卡内二选一(从零 / 有存量),选完写 localStorage origin 并重算;
 *     origin=existing 才显示步3(扫码导入)/步4(后台初始化),fresh 跳过。
 *   - 步5(定位)在 existing 场景 CTA 深链带「基于我已导入的作品」prefill(复用 positioning.generate,
 *     它已吃真实作品画像 —— 见 chat-tools generatePositioning);fresh 走普通定位页。
 *   - 全可见步 done → 卡自动隐藏(isOnboardingComplete)。
 *
 * onboarding 只剩两个 localStorage flag:`creatoros:onboarding:hidden`(点「不再显示」永久隐藏)
 * 与 `creatoros:onboarding:origin`(起点选择,读/写在 onboarding-data)。
 *
 * 渲染条件(任一为真 → 不渲):数据未 ready / readHidden() / isOnboardingComplete()。
 * 诚实降级:loadState 失败一律当未完成(不假打勾)。不硬锁导航 —— blocked 只是灰 + 锁提示,
 * 用户仍可点开某页(推荐序 + 门控提示,非强制线性,SPEC §5)。
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
import { loadState, writeOrigin } from "./onboarding-data";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";

/** 常驻卡「不再显示」的永久 localStorage key(onboarding 隐藏 flag)。 */
const HIDDEN_KEY = "creatoros:onboarding:hidden";

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
  } catch {
    /* noop */
  }
}

/**
 * [T-137;T-138] 清「永久隐藏」(hidden)flag,让常驻卡下次挂载重现(设置页「重新打开新手引导」用)。
 */
export function clearOnboardingFlags(): void {
  try {
    window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* noop */
  }
}

/**
 * 步5(定位)在 existing 场景的 CTA 深链 —— 打开 Copilot 定位 surface 并预调 positioning.generate,
 * 带一句 prefill 让模型「基于我已导入的作品」草拟第一版定位。positioning.generate 已吃真实作品
 * 画像(后台 works 读端口读 imported 作品),故无需额外 facet:一进对话即可读作品反推定位。
 */
const EXISTING_POSITIONING_PREFILL =
  "请基于我已经导入的抖音作品(标题、逐字稿、数据表现),反推并草拟第一版账号定位提案给我过目。";

function positioningHref(origin: OnboardingState["origin"]): string {
  if (origin === "existing") {
    return copilotDeepLink(
      "positioning",
      "positioning.generate",
      undefined,
      EXISTING_POSITIONING_PREFILL,
    );
  }
  return "/positioning";
}

/** 步5 的 why 按 origin 微调(existing 强调基于导入作品预设)。 */
function positioningWhy(
  step: GuidedStep,
  origin: OnboardingState["origin"],
): string {
  if (step.key !== "positioning-profile") return step.why;
  return origin === "existing"
    ? "基于你刚导入的作品,AI 会反推草拟第一版定位提案 —— 你过目采纳即可,不用从零手写。"
    : "和 AI 聊几句,把你想做的方向、受众聊清楚,生成第一版定位。定位是下游选题 / 评分的约束源。";
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly state: OnboardingState };

export function OnboardingCard() {
  const [load, setLoad] = React.useState<Load>({ kind: "loading" });
  const [hidden, setHidden] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  // 挂载后拉真值;同时读一次永久隐藏偏好。
  React.useEffect(() => {
    let alive = true;
    setHidden(readHidden());
    void (async () => {
      const state = await loadState();
      if (!alive) return;
      setLoad({ kind: "ready", state });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = React.useCallback(() => {
    writeHidden();
    setHidden(true);
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

  // 数据未 ready / 已永久隐藏 → 不渲。
  if (load.kind !== "ready" || hidden) return null;

  const state = load.state;
  const origin = state.origin ?? null;
  const steps = deriveGuidedSteps(state);
  // 可见步全 done → 卡自动隐藏。
  if (isOnboardingComplete(steps)) return null;

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

      {collapsed ? null : (
        <ol
          data-slot="onboarding-card-body"
          className="flex flex-col gap-2"
        >
          {steps.map((step, i) => (
            <GuidedStepRow
              key={step.key}
              step={step}
              index={i}
              isCurrent={i === currentIndex}
              origin={origin}
              onChooseOrigin={chooseOrigin}
              onNavigate={() => {}}
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
  index,
  isCurrent,
  origin,
  onChooseOrigin,
  onNavigate,
}: {
  readonly step: GuidedStep;
  readonly index: number;
  readonly isCurrent: boolean;
  readonly origin: OnboardingState["origin"];
  readonly onChooseOrigin: (o: "fresh" | "existing") => void;
  readonly onNavigate: () => void;
}) {
  const isOriginStep = step.key === "confirm-origin";
  const why = positioningWhy(step, origin);
  const href = step.key === "positioning-profile" ? positioningHref(origin) : step.href;

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
          <Link href={href} onClick={onNavigate}>
            去做
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      ) : null}
    </li>
  );
}
