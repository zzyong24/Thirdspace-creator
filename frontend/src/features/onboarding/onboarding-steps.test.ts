/**
 * [T-131a] deriveSteps 纯逻辑单测 —— 锁 done 派生的三条铁律:
 *  - 配了 → done。
 *  - 没配(读到空 state)→ 未完成。
 *  - 读失败(state 字段 undefined)→ 未完成(诚实降级,绝不假打勾)。
 * 外加进度 / 全必备完成 / 分组 / href 深链的断言。
 */

import { describe, expect, it } from "vitest";

import {
  ONBOARDING_STEP_SET,
  allRequiredDone,
  deriveSteps,
  isOnboardingComplete,
  progressOf,
  type OnboardingState,
} from "./onboarding-steps";

/** 取某 key 的派生步。 */
function step(state: OnboardingState, key: string) {
  return deriveSteps(state).find((s) => s.key === key);
}

describe("deriveSteps — done 派生", () => {
  it("空 state(全未配 / 未加载)→ 所有步未完成", () => {
    const steps = deriveSteps({});
    expect(steps.length).toBe(ONBOARDING_STEP_SET.length);
    expect(steps.every((s) => s.done === false)).toBe(true);
  });

  it("配了文本模型(default capability)→ text-model done", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["default"]),
    };
    expect(step(state, "text-model")?.done).toBe(true);
    // 没配的其余步仍未完成。
    expect(step(state, "positioning-profile")?.done).toBe(false);
    expect(step(state, "first-project")?.done).toBe(false);
  });

  it("没配文本模型(集合里没有 default)→ text-model 未完成", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["image.generate"]),
    };
    expect(step(state, "text-model")?.done).toBe(false);
    // 但生图配了 → image-model done。
    expect(step(state, "image-model")?.done).toBe(true);
  });

  it("读失败(configuredCapabilities undefined)→ 相关模型步一律未完成,不假打勾", () => {
    const state: OnboardingState = { configuredCapabilities: undefined };
    for (const key of [
      "text-model",
      "image-model",
      "video-model",
      "review-model",
      "asr-model",
      "web-search",
    ]) {
      expect(step(state, key)?.done).toBe(false);
    }
  });

  it("定位母版:存在 → done;不存在 / 读失败 → 未完成", () => {
    expect(step({ hasPositioningProfile: true }, "positioning-profile")?.done).toBe(
      true,
    );
    expect(
      step({ hasPositioningProfile: false }, "positioning-profile")?.done,
    ).toBe(false);
    // 读失败(undefined)。
    expect(step({}, "positioning-profile")?.done).toBe(false);
  });

  it("首个项目:count≥1 → done;count=0 / 读失败 → 未完成", () => {
    expect(step({ projectCount: 3 }, "first-project")?.done).toBe(true);
    expect(step({ projectCount: 1 }, "first-project")?.done).toBe(true);
    expect(step({ projectCount: 0 }, "first-project")?.done).toBe(false);
    // 读失败(undefined)。
    expect(step({}, "first-project")?.done).toBe(false);
  });

  it("存储根:读到 → done;读失败 → 未完成", () => {
    expect(step({ hasStorageRoot: true }, "storage-root")?.done).toBe(true);
    expect(step({ hasStorageRoot: false }, "storage-root")?.done).toBe(false);
    expect(step({}, "storage-root")?.done).toBe(false);
  });

  it("[T-131d] 违禁词/审核规则:有 active 规则 → done;无 / 读失败 → 未完成", () => {
    expect(step({ hasActiveReviewRule: true }, "review-rules")?.done).toBe(true);
    expect(step({ hasActiveReviewRule: false }, "review-rules")?.done).toBe(false);
    expect(step({}, "review-rules")?.done).toBe(false);
  });

  it("[T-131d] 抖音登录:loggedIn → done;未登录 / 读失败 → 未完成", () => {
    expect(step({ douyinLoggedIn: true }, "douyin-login")?.done).toBe(true);
    expect(step({ douyinLoggedIn: false }, "douyin-login")?.done).toBe(false);
    expect(step({}, "douyin-login")?.done).toBe(false);
  });

  it("多能力可选模型 done 独立派生", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set([
        "video.generate",
        "script.review",
        "transcribe.audio",
        "web.search",
      ]),
    };
    expect(step(state, "video-model")?.done).toBe(true);
    expect(step(state, "review-model")?.done).toBe(true);
    expect(step(state, "asr-model")?.done).toBe(true);
    expect(step(state, "web-search")?.done).toBe(true);
    // 没配的仍未完成。
    expect(step(state, "image-model")?.done).toBe(false);
  });
});

describe("deriveSteps — 分组 / 元数据", () => {
  it("必备组恰为 文本模型 / 首个项目(定位/联网搜索改归 recommended)", () => {
    const required = deriveSteps({})
      .filter((s) => s.group === "required")
      .map((s) => s.key);
    expect(required).toEqual(["text-model", "first-project"]);
  });

  it("[T-132] 强烈建议组恰为 定位母版 / 联网搜索", () => {
    const recommended = deriveSteps({})
      .filter((s) => s.group === "recommended")
      .map((s) => s.key);
    expect(recommended).toEqual(["positioning-profile", "web-search"]);
  });

  it("[T-132] positioning-profile 与 web-search 归 recommended,不再 required/optional", () => {
    const byKey = (key: string) =>
      deriveSteps({}).find((s) => s.key === key)?.group;
    expect(byKey("positioning-profile")).toBe("recommended");
    expect(byKey("web-search")).toBe("recommended");
  });

  it("每步都带非空 title / why / href 深链", () => {
    for (const s of deriveSteps({})) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
      expect(s.href.startsWith("/")).toBe(true);
    }
  });

  it("必备/建议步深链指向对应配置页", () => {
    const steps = deriveSteps({});
    // [T-132] settings 类步骤带 ?highlight=<key> 深链锚点(settings 页据此定位卡片)。
    expect(steps.find((s) => s.key === "text-model")?.href).toBe(
      "/settings?highlight=text-model",
    );
    // 整页跳转类(定位 / 首个项目)不带 highlight。
    expect(steps.find((s) => s.key === "positioning-profile")?.href).toBe(
      "/positioning",
    );
    expect(steps.find((s) => s.key === "first-project")?.href).toBe(
      "/projects/new",
    );
    // 联网搜索(recommended,settings 类)带 highlight。
    expect(steps.find((s) => s.key === "web-search")?.href).toBe(
      "/settings?highlight=web-search",
    );
  });
});

describe("allRequiredDone", () => {
  it("必备全配 → true(即使可选未配)", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["default"]),
      hasPositioningProfile: true,
      projectCount: 2,
    };
    const steps = deriveSteps(state);
    expect(allRequiredDone(steps)).toBe(true);
  });

  it("任一必备未完成 → false", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["default"]),
      hasPositioningProfile: true,
      projectCount: 0, // 缺首个项目
    };
    expect(allRequiredDone(deriveSteps(state))).toBe(false);
  });

  it("空 state → false", () => {
    expect(allRequiredDone(deriveSteps({}))).toBe(false);
  });
});

describe("progressOf", () => {
  it("统计已完成 / 总步数", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["default", "image.generate"]),
      hasPositioningProfile: true,
      projectCount: 0,
    };
    const steps = deriveSteps(state);
    const { done, total } = progressOf(steps);
    // done: text-model + positioning-profile + image-model = 3
    expect(done).toBe(3);
    expect(total).toBe(ONBOARDING_STEP_SET.length);
  });

  it("空 state → 0 / total", () => {
    const { done, total } = progressOf(deriveSteps({}));
    expect(done).toBe(0);
    expect(total).toBe(ONBOARDING_STEP_SET.length);
  });
});

describe("[T-132] isOnboardingComplete", () => {
  /** required + recommended 全配(optional 一律没配)。 */
  const requiredAndRecommended: OnboardingState = {
    configuredCapabilities: new Set(["default", "web.search"]),
    hasPositioningProfile: true,
    projectCount: 1,
  };

  it("required + recommended 全 done → true(即使 optional 全未配)", () => {
    expect(isOnboardingComplete(deriveSteps(requiredAndRecommended))).toBe(true);
  });

  it("仅缺一个 optional(如存储根)→ 仍 true(optional 不计入)", () => {
    // requiredAndRecommended 本就没配任何 optional → 已覆盖「缺 optional 仍 true」。
    // 这里再显式补配一部分 optional、独缺 storage-root,确认结论不变。
    const state: OnboardingState = {
      ...requiredAndRecommended,
      configuredCapabilities: new Set([
        "default",
        "web.search",
        "image.generate",
        "video.generate",
      ]),
      // 独缺 hasStorageRoot(optional)。
    };
    expect(isOnboardingComplete(deriveSteps(state))).toBe(true);
  });

  it("缺一个 recommended(联网搜索)→ false", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["default"]), // 缺 web.search
      hasPositioningProfile: true,
      projectCount: 1,
    };
    expect(isOnboardingComplete(deriveSteps(state))).toBe(false);
  });

  it("缺一个 recommended(定位母版)→ false", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["default", "web.search"]),
      hasPositioningProfile: false, // 缺定位
      projectCount: 1,
    };
    expect(isOnboardingComplete(deriveSteps(state))).toBe(false);
  });

  it("缺一个 required(首个项目)→ false", () => {
    const state: OnboardingState = {
      configuredCapabilities: new Set(["default", "web.search"]),
      hasPositioningProfile: true,
      projectCount: 0, // 缺项目
    };
    expect(isOnboardingComplete(deriveSteps(state))).toBe(false);
  });

  it("空 state → false", () => {
    expect(isOnboardingComplete(deriveSteps({}))).toBe(false);
  });

  it("无 required+recommended 步(空数组)→ true(防空数组误判)", () => {
    expect(isOnboardingComplete([])).toBe(true);
  });
});
