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

  it("历史作品确认单独完成，不用引导锁阻断定位", () => {
    const waiting: OnboardingState = {
      douyinLoggedIn: true,
      origin: "existing",
      hasImportedWorks: false,
      hasReviewedImportedProjects: false,
    };
    expect(step(waiting, "review-imported-projects")?.done).toBe(false);
    expect(step(waiting, "positioning-profile")?.blocked).toBe(false);

    const imported = { ...waiting, hasImportedWorks: true };
    expect(step(imported, "review-imported-projects")?.done).toBe(false);
    expect(step(imported, "positioning-profile")?.blocked).toBe(false);

    const confirmed = { ...imported, hasReviewedImportedProjects: true };
    expect(step(confirmed, "review-imported-projects")?.done).toBe(true);
    expect(step(confirmed, "positioning-profile")?.blocked).toBe(false);
  });

  it("引导提供建议但不阻断直接访问对标选题和项目", () => {
    const base: OnboardingState = {
      douyinLoggedIn: true,
      origin: "fresh",
      hasPositioningProfile: true,
    };
    expect(step(base, "benchmark-monitor")?.blocked).toBe(false);
    expect(step(base, "benchmark-topic")?.blocked).toBe(false);

    const monitored = { ...base, hasBenchmarkMonitor: true };
    expect(step(monitored, "benchmark-topic")?.blocked).toBe(false);
    expect(step(monitored, "first-project")?.blocked).toBe(false);

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

  it("暂时缺少业务信号不会撤销已保存的历史里程碑", () => {
    expect(step({completedSteps: ["import-account", "first-project"]}, "import-account")?.done).toBe(true);
    expect(step({completedSteps: ["first-project"], hasCreatedProject: false}, "first-project")?.done).toBe(true);
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

it('T1408 首用户先创建组，有效组或旧账号默认直接定位',()=>{
 expect(deriveGuidedSteps({needsFirstGroup:true} as any)[0]).toMatchObject({title:'创建第一个账号组',ctaLabel:'去创建',href:'/accounts'});
 expect(deriveGuidedSteps({groupId:'g',memberCount:0})[0]).toMatchObject({key:'positioning-profile',done:false,href:'/positioning'});
 expect(deriveGuidedSteps({accountId:'legacy'})[0]).toMatchObject({key:'positioning-profile',done:false,href:'/positioning'});
});

it.each([{groupId:'g',memberCount:0},{accountId:'legacy'}])('T1408 %j 平台绑定不计必做，定位提前且其余顺序/历史完成记录保留',workspace=>{
 const state={...workspace,origin:'existing' as const,completedSteps:['import-account'] as const};
 const steps=deriveGuidedSteps(state);
 expect(steps.map(item=>item.key)).toEqual(['positioning-profile','confirm-origin','review-imported-projects','benchmark-monitor','benchmark-topic','first-project']);
 expect(steps.map(item=>item.order)).toEqual([1,2,3,4,5,6]);
 // origin 已明确选择，因此仅确认起点算完成；历史绑定里程碑不再计数。
 expect(steps.filter(item=>item.done).map(item=>item.key)).toEqual(['confirm-origin']);
 expect(progressOf(steps)).toEqual({done:1,total:6});
 expect(state.completedSteps).toEqual(['import-account']);
});

it('T1362组内已采集作品进入真实目录，旧账号历史项目路径保持',()=>{
 const group=deriveGuidedSteps({groupId:'g',memberCount:1,origin:'existing',hasImportedWorks:false});
 expect(group.find(step=>step.key==='review-imported-projects')).toMatchObject({href:'/accounts/works',ctaLabel:'查看已采集作品'});
 expect(deriveGuidedSteps({accountId:'legacy',origin:'existing'}).find(step=>step.key==='review-imported-projects')?.href).toBe('/projects');
});
