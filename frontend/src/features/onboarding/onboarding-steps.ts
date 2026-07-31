/**
 * 新手引导的纯状态机。
 *
 * T-637 把技术配置/自动化从用户主线移出，只保留能形成创作成果的路径：
 * 绑定账号 →（识别是否有历史作品）→ 查看历史项目 → 定位 → 对标监控 → 对标选题 → 项目。
 */

export type OnboardingOrigin = "fresh" | "existing" | null;
export type StepBranch = "all" | "existing";

export interface OnboardingState {
  readonly origin?: OnboardingOrigin;
  readonly douyinLoggedIn?: boolean;
  readonly hasImportedWorks?: boolean;
  readonly hasReviewedImportedProjects?: boolean;
  readonly hasPositioningProfile?: boolean;
  readonly hasBenchmarkMonitor?: boolean;
  readonly hasBenchmarkTopic?: boolean;
  readonly hasCreatedProject?: boolean;
}

export interface GuidedStep {
  readonly key: string;
  readonly order: number;
  readonly branch: StepBranch;
  readonly title: string;
  readonly why: string;
  readonly ctaLabel: string;
  readonly done: boolean;
  readonly blocked: boolean;
  readonly blockedReason: string;
  readonly href: string;
}

interface GuidedStepSpec {
  readonly key: string;
  readonly order: number;
  readonly branch: StepBranch;
  readonly title: string;
  readonly why: string;
  readonly ctaLabel: string;
  readonly href: string;
  readonly isDone: (state: OnboardingState) => boolean;
  readonly isBlocked?: (state: OnboardingState) => boolean;
  readonly blockedReason: string;
}

export const GUIDED_STEP_SET: readonly GuidedStepSpec[] = [
  {
    key: "import-account",
    order: 1,
    branch: "all",
    title: "绑定你的抖音号",
    why: "绑定后，CreatorOS 会把这个账号的作品、项目和创作资料放进同一个工作区。",
    ctaLabel: "去绑定",
    href: "/accounts",
    isDone: (state) => state.douyinLoggedIn === true,
    blockedReason: "",
  },
  {
    key: "confirm-origin",
    order: 2,
    branch: "all",
    title: "确认账号情况",
    why: "告诉我们这个账号以前是否发过作品；已有作品会先同步到项目中心，新号则直接开始定位。",
    ctaLabel: "确认",
    href: "#origin",
    isDone: (state) => state.origin === "fresh" || state.origin === "existing",
    blockedReason: "先绑定抖音号，再确认账号情况。",
  },
  {
    key: "review-imported-projects",
    order: 3,
    branch: "existing",
    title: "查看已发布的历史项目",
    why: "作品同步完成后，先去项目中心看一遍历史作品是否齐全；确认后再进入定位。",
    ctaLabel: "查看并确认",
    href: "/projects",
    isDone: (state) =>
      state.hasImportedWorks === true &&
      state.hasReviewedImportedProjects === true,
    isBlocked: (state) => state.hasImportedWorks !== true,
    blockedReason: "历史作品正在后台同步，出现项目后即可查看。",
  },
  {
    key: "positioning-profile",
    order: 4,
    branch: "all",
    title: "确定账号定位",
    why: "先明确受众、内容方向和表达方式，后续对标、选题和项目才不会跑偏。",
    ctaLabel: "去创建定位",
    href: "/positioning",
    isDone: (state) => state.hasPositioningProfile === true,
    blockedReason: "先完成前面的账号准备，再创建定位。",
  },
  {
    key: "benchmark-monitor",
    order: 5,
    branch: "all",
    title: "添加一个对标账号",
    why: "在内容雷达里持续监控一个对标账号，后续可以直接从真实内容中找机会。",
    ctaLabel: "去监控对标",
    href: "/intelligence",
    isDone: (state) => state.hasBenchmarkMonitor === true,
    blockedReason: "先确定账号定位，再选择值得监控的对标。",
  },
  {
    key: "benchmark-topic",
    order: 6,
    branch: "all",
    title: "从对标内容创建选题",
    why: "选一条对标内容完成拆解，并转成符合你账号定位的选题。",
    ctaLabel: "去创建选题",
    href: "/intelligence",
    isDone: (state) => state.hasBenchmarkTopic === true,
    blockedReason: "先添加并监控一个对标账号。",
  },
  {
    key: "first-project",
    order: 7,
    branch: "all",
    title: "把选题变成项目",
    why: "从刚创建的选题进入项目，继续完成脚本、制作、发布和复盘。",
    ctaLabel: "去选题中心立项",
    href: "/topics?source=benchmark",
    isDone: (state) => state.hasCreatedProject === true,
    blockedReason: "先从对标内容创建一个选题。",
  },
];

export function resolveOrigin(
  explicit: OnboardingOrigin,
  signals: {
    readonly douyinLoggedIn?: boolean;
    readonly hasImportedWorks?: boolean;
  },
): OnboardingOrigin {
  if (explicit === "fresh" || explicit === "existing") return explicit;
  return signals.hasImportedWorks === true ? "existing" : null;
}

function isVisible(spec: GuidedStepSpec, origin: OnboardingOrigin): boolean {
  return spec.branch === "all" || origin === "existing";
}

export function deriveGuidedSteps(state: OnboardingState): GuidedStep[] {
  const visible = GUIDED_STEP_SET.filter((spec) =>
    isVisible(spec, state.origin ?? null),
  );
  const out: GuidedStep[] = [];
  let previousDone = true;
  for (const spec of visible) {
    const done = spec.isDone(state);
    const blocked = !previousDone || (spec.isBlocked?.(state) ?? false);
    out.push({
      key: spec.key,
      // 分支过滤后重新编号，避免新号看到 1、2、4、5 这种断号。
      order: out.length + 1,
      branch: spec.branch,
      title: spec.title,
      why: spec.why,
      ctaLabel: spec.ctaLabel,
      done,
      blocked,
      blockedReason: blocked ? spec.blockedReason : "",
      href: spec.href,
    });
    previousDone = done;
  }
  return out;
}

export function isOnboardingComplete(steps: readonly GuidedStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.done);
}

export function progressOf(steps: readonly GuidedStep[]): {
  readonly done: number;
  readonly total: number;
} {
  return {
    done: steps.filter((step) => step.done).length,
    total: steps.length,
  };
}
