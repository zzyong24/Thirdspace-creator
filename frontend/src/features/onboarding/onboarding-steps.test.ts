import { describe, expect, it } from "vitest";

import {
  GUIDED_STEP_SET,
  deriveGuidedSteps,
  isOnboardingComplete,
  progressOf,
  resolveOrigin,
  type OnboardingState,
} from "./onboarding-steps";

function step(state: OnboardingState, key: string) {
  return deriveGuidedSteps(state).find((item) => item.key === key);
}

const ALL_KEYS = [
  "import-account",
  "confirm-origin",
  "review-imported-projects",
  "positioning-profile",
  "benchmark-monitor",
  "benchmark-topic",
  "first-project",
] as const;

describe("[T-637] 新手引导主线", () => {
  it("只展示创作成果路径，不暴露模型配置或自动化", () => {
    expect(GUIDED_STEP_SET.map((item) => item.key)).toEqual([...ALL_KEYS]);
    expect(GUIDED_STEP_SET.map((item) => item.href)).not.toContain("/automations");
    expect(GUIDED_STEP_SET.map((item) => item.key)).not.toContain("text-model");
    expect(GUIDED_STEP_SET.map((item) => item.key)).not.toContain("init-data");
  });

  it("新号跳过历史项目，顺序为账号→定位→对标→选题→项目", () => {
    const steps = deriveGuidedSteps({ origin: "fresh" });
    expect(steps.map((item) => item.key)).toEqual([
      "import-account",
      "confirm-origin",
      "positioning-profile",
      "benchmark-monitor",
      "benchmark-topic",
      "first-project",
    ]);
    expect(steps.map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("已有作品账号必须先查看并确认导入项目，才解锁定位", () => {
    const waiting: OnboardingState = {
      douyinLoggedIn: true,
      origin: "existing",
      hasImportedWorks: false,
      hasReviewedImportedProjects: false,
    };
    expect(step(waiting, "review-imported-projects")?.done).toBe(false);
    expect(step(waiting, "positioning-profile")?.blocked).toBe(true);

    const imported = { ...waiting, hasImportedWorks: true };
    expect(step(imported, "review-imported-projects")?.done).toBe(false);
    expect(step(imported, "positioning-profile")?.blocked).toBe(true);

    const confirmed = { ...imported, hasReviewedImportedProjects: true };
    expect(step(confirmed, "review-imported-projects")?.done).toBe(true);
    expect(step(confirmed, "positioning-profile")?.blocked).toBe(false);
  });

  it("对标监控、对标选题和新建项目逐级解锁", () => {
    const base: OnboardingState = {
      douyinLoggedIn: true,
      origin: "fresh",
      hasPositioningProfile: true,
    };
    expect(step(base, "benchmark-monitor")?.blocked).toBe(false);
    expect(step(base, "benchmark-topic")?.blocked).toBe(true);

    const monitored = { ...base, hasBenchmarkMonitor: true };
    expect(step(monitored, "benchmark-topic")?.blocked).toBe(false);
    expect(step(monitored, "first-project")?.blocked).toBe(true);

    const converted = { ...monitored, hasBenchmarkTopic: true };
    expect(step(converted, "first-project")?.blocked).toBe(false);
  });

  it("历史导入项目不冒充用户新建的项目", () => {
    const base: OnboardingState = {
      douyinLoggedIn: true,
      origin: "fresh",
      hasPositioningProfile: true,
      hasBenchmarkMonitor: true,
      hasBenchmarkTopic: true,
    };
    expect(step({ ...base, hasCreatedProject: false }, "first-project")?.done).toBe(false);
    expect(step({ ...base, hasCreatedProject: true }, "first-project")?.done).toBe(true);
  });

  it("完整路径完成后进度为全满", () => {
    const state: OnboardingState = {
      douyinLoggedIn: true,
      origin: "existing",
      hasImportedWorks: true,
      hasReviewedImportedProjects: true,
      hasPositioningProfile: true,
      hasBenchmarkMonitor: true,
      hasBenchmarkTopic: true,
      hasCreatedProject: true,
    };
    const steps = deriveGuidedSteps(state);
    expect(isOnboardingComplete(steps)).toBe(true);
    expect(progressOf(steps)).toEqual({ done: 7, total: 7 });
  });
});

describe("resolveOrigin", () => {
  it("尊重显式选择，并以真实导入作品兜底识别已有作品账号", () => {
    expect(resolveOrigin("fresh", { hasImportedWorks: true })).toBe("fresh");
    expect(resolveOrigin("existing", {})).toBe("existing");
    expect(resolveOrigin(null, { hasImportedWorks: true })).toBe("existing");
    expect(resolveOrigin(null, { douyinLoggedIn: true })).toBeNull();
  });
});
