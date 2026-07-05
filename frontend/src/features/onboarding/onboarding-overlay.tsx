"use client";

/**
 * OnboardingOverlay — 新用户首次引导 checklist(T-131 b + c)。
 *
 * 挂载后并行拉各能力 state(listModels / getProfile / listProjects / getStorage)
 * → deriveSteps → 用 `ui/dialog` 弹(禁原生 window.alert/confirm)。顶部进度条
 * 「已完成 N/总 M」;必备 / 可选分组渲染;每步:完成→打勾灰显,未完成→标题 +
 * why +「去配置 →」跳深链(next/link 到 /settings、/positioning、/projects/new)。
 *
 * 诚实降级(照抄 sidebar-storage-card 范式):每个读 op 各自 try/catch,失败 →
 * 该能力 state 缺席(undefined)→ deriveSteps 判该步未完成,绝不假打勾、不崩。
 *
 * 自动弹条件:未 dismissed 且有必备项未完成。全必备完成 → 不自动弹。dismissed 存
 * localStorage['creatoros:onboarding:dismissed']=1(读写 try/catch 降级不抛)。
 * dismissed 与 completed 分离 —— 用户可暂关但没配完,后续仍能手动重开
 * (导出 `openOnboarding` + `onboarding:open` 自定义事件,供侧栏 / 首页挂手动入口)。
 *
 * data-slot 齐全(onboarding-overlay / onboarding-progress / onboarding-step 等)
 * 供测试与后续定位。
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";

import { client } from "@/lib/contract-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  allRequiredDone,
  deriveSteps,
  progressOf,
  type OnboardingState,
  type OnboardingStep,
} from "./onboarding-steps";

const DISMISS_KEY = "creatoros:onboarding:dismissed";
/** 手动重开引导的自定义事件名(shell / 侧栏 dispatch 它即弹开)。 */
export const ONBOARDING_OPEN_EVENT = "creatoros:onboarding:open";

/** 手动打开引导(供侧栏 / 首页入口调用)。仅在浏览器环境派发事件。 */
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

/**
 * 并行拉各能力 state。每个读 op 各自 try/catch:失败 → 该字段留 undefined
 * (诚实降级),不让一个读失败拖垮整份 state。返回可直接喂 deriveSteps 的 state。
 */
async function loadState(): Promise<OnboardingState> {
  const [
    capabilities,
    hasProfile,
    projectCount,
    hasStorageRoot,
    hasActiveReviewRule,
    douyinLoggedIn,
  ] = await Promise.all([
    loadConfiguredCapabilities(),
    loadHasProfile(),
    loadProjectCount(),
    loadHasStorageRoot(),
    loadHasActiveReviewRule(),
    loadDouyinLoggedIn(),
  ]);
  return {
    configuredCapabilities: capabilities,
    hasPositioningProfile: hasProfile,
    projectCount,
    hasStorageRoot,
    hasActiveReviewRule,
    douyinLoggedIn,
  };
}

/** 已配的 model capability 集合(provider + modelName 非空才算已配)。读失败 → undefined。 */
async function loadConfiguredCapabilities(): Promise<
  ReadonlySet<string> | undefined
> {
  try {
    const rows = (await client.listModels({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<{
      capability?: unknown;
      provider?: unknown;
      modelName?: unknown;
    }>;
    const set = new Set<string>();
    for (const row of rows) {
      const capability =
        typeof row.capability === "string" ? row.capability : "";
      const provider = typeof row.provider === "string" ? row.provider : "";
      const modelName = typeof row.modelName === "string" ? row.modelName : "";
      // web.search 档 model 选填(只需 provider);其余档要 provider 齐。统一以
      // provider 非空为「已配」下限 —— 未配的行 provider 为空,不误判 done。
      if (capability && provider) {
        // model 非空更稳,但 web.search 允许空 model(provider 即可用);这里以
        // provider 为准(与设置页搜索档判定一致),避免 web.search 永远判未完成。
        void modelName;
        set.add(capability);
      }
    }
    return set;
  } catch {
    return undefined;
  }
}

/** 定位母版是否存在(getProfile 成功 resolve → true;404 / 读失败 → undefined)。 */
async function loadHasProfile(): Promise<boolean | undefined> {
  try {
    await client.getProfile({
      params: undefined,
      query: undefined,
      body: undefined,
    });
    return true;
  } catch {
    // 无 profile → 后端返 404(OwnershipError)→ reject → 诚实降级为未完成。
    return undefined;
  }
}

/** 项目数(listProjects 长度)。读失败 → undefined。 */
async function loadProjectCount(): Promise<number | undefined> {
  try {
    const rows = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<unknown>;
    return Array.isArray(rows) ? rows.length : undefined;
  } catch {
    return undefined;
  }
}

/** 存储根可读性(getStorage 成功且 rootPath 非空)。读失败 → undefined。 */
async function loadHasStorageRoot(): Promise<boolean | undefined> {
  try {
    const s = (await client.getStorage({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as { rootPath?: unknown };
    return typeof s.rootPath === "string" && s.rootPath.trim().length > 0
      ? true
      : undefined;
  } catch {
    return undefined;
  }
}

/** [T-131d] 是否有 ≥1 条 active 审核规则(listReviewRules,status==="active")。读失败 → undefined。 */
async function loadHasActiveReviewRule(): Promise<boolean | undefined> {
  try {
    const rows = (await client.listReviewRules({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as unknown as ReadonlyArray<{ status?: unknown }>;
    return Array.isArray(rows)
      ? rows.some((r) => r.status === "active") || undefined
      : undefined;
  } catch {
    return undefined;
  }
}

/** [T-131d] 抖音扫码登录态(statusDouyin → {loggedIn})。读失败 → undefined。 */
async function loadDouyinLoggedIn(): Promise<boolean | undefined> {
  try {
    const s = (await client.statusDouyin({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as { loggedIn?: unknown };
    return s.loggedIn === true ? true : undefined;
  } catch {
    return undefined;
  }
}

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

  // 手动重开入口(侧栏 / 首页 dispatch ONBOARDING_OPEN_EVENT)。
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

function ProgressBar({ done, total }: { done: number; total: number }) {
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

function StepGroup({
  heading,
  hint,
  steps,
  onNavigate,
}: {
  heading: string;
  hint: string;
  steps: readonly OnboardingStep[];
  onNavigate: () => void;
}) {
  if (steps.length === 0) return null;
  return (
    <section
      data-slot="onboarding-group"
      data-group={steps[0]?.group}
      className="flex flex-col gap-2"
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-foreground">
          {heading}
        </h3>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => (
          <StepRow key={step.key} step={step} onNavigate={onNavigate} />
        ))}
      </ul>
    </section>
  );
}

function StepRow({
  step,
  onNavigate,
}: {
  step: OnboardingStep;
  onNavigate: () => void;
}) {
  return (
    <li
      data-slot="onboarding-step"
      data-step-key={step.key}
      data-done={step.done}
      className={cn(
        "flex items-start gap-3 rounded-card border border-border p-3",
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
