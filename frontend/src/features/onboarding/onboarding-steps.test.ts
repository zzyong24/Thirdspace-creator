/**
 * [T-161] deriveGuidedSteps 纯逻辑单测 —— 有序引导流(取代 T-131a 扁平三档)。
 *
 * 锁住:
 *  - 步序([T-348] 账号全隔离重排):绑定抖音号 → 配文本模型 → 确认起点 →(existing)后台初始化 →
 *    创建定位 → 创建首个项目,order 递增。绑号=全员第一步(0 号是一切前提)。
 *  - 门控:前置未 done → 该步 blocked(灰/锁);前置 done → 解锁。
 *  - 分支:origin=fresh → 隐藏 existing 专属步(后台初始化);origin=existing → 全程。绑号=全员步(不随分支隐)。
 *  - done 判定:各步 isDone 从 state 派生(诚实降级,读失败一律未完成)。
 *  - 清理:web-search / asr 步不再出现(T-159/T-160 联动)。
 *  - 全 done → isOnboardingComplete=true(按可见步,fresh 看 5 步含绑号)。
 */

import { describe, expect, it } from "vitest";

import {
  GUIDED_STEP_SET,
  deriveGuidedSteps,
  isOnboardingComplete,
  progressOf,
  resolveOrigin,
  type OnboardingState,
} from "./onboarding-steps";

/** 取某 key 的派生步(按给定 state / origin)。 */
function step(state: OnboardingState, key: string) {
  return deriveGuidedSteps(state).find((s) => s.key === key);
}

/** 各步 key([T-348] 声明序:绑号提为第一步)。 */
const ALL_KEYS = [
  "import-account",
  "text-model",
  "confirm-origin",
  "init-data",
  "positioning-profile",
  "first-project",
] as const;

describe("[T-161] GUIDED_STEP_SET — 步序 / 元数据", () => {
  it("恰含 6 个引导步,order 从 1 递增无重复", () => {
    const orders = GUIDED_STEP_SET.map((s) => s.order);
    expect(GUIDED_STEP_SET.map((s) => s.key)).toEqual([...ALL_KEYS]);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("清理:web-search / asr / 生图 / 存储 / 违禁词步不再出现(T-159/T-160 联动)", () => {
    const keys = GUIDED_STEP_SET.map((s) => s.key);
    for (const gone of [
      "web-search",
      "asr-model",
      "image-model",
      "video-model",
      "review-model",
      "storage-root",
      "review-rules",
      "douyin-login",
    ]) {
      expect(keys).not.toContain(gone);
    }
  });

  it("[T-348] existing 专属步 = 仅后台初始化(导入历史);绑号/配模型/起点/定位/项目为全员步", () => {
    const existingOnly = GUIDED_STEP_SET.filter(
      (s) => s.branch === "existing",
    ).map((s) => s.key);
    expect(existingOnly).toEqual(["init-data"]);
    const allBranch = GUIDED_STEP_SET.filter((s) => s.branch === "all").map(
      (s) => s.key,
    );
    expect(allBranch).toEqual([
      "import-account",
      "text-model",
      "confirm-origin",
      "positioning-profile",
      "first-project",
    ]);
  });

  it("[T-348] 绑号(import-account)= 全员第一步(order=1、branch=all、CTA→/accounts、无前置)", () => {
    const bind = GUIDED_STEP_SET.find((s) => s.key === "import-account");
    expect(bind?.order).toBe(1);
    expect(bind?.branch).toBe("all");
    expect(bind?.href).toBe("/accounts");
    expect(bind?.blockedReason).toBe(""); // 第一步无前置
  });

  it("每步都带非空 title / why / href 深链", () => {
    for (const s of GUIDED_STEP_SET) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
      expect(s.href.length).toBeGreaterThan(0);
    }
  });
});

describe("[T-189b / T-348] resolveOrigin — 显式选择优先,仅「已有导入作品」回灌兜底", () => {
  it("显式 fresh → 保持 fresh(即便已绑抖音 / 已有导入作品,也不回灌 existing)", () => {
    expect(
      resolveOrigin("fresh", { douyinLoggedIn: true, hasImportedWorks: true }),
    ).toBe("fresh");
  });

  it("显式 existing → 保持 existing", () => {
    expect(resolveOrigin("existing", {})).toBe("existing");
  });

  it("[T-348] 无显式选择 + 仅 douyinLoggedIn=true(绑号但无作品)→ null(绑号≠有存量,仍问新/老)", () => {
    // 全隔离后绑号是全员前提,新号也绑;绑号不再回灌 existing —— 否则新号被塞进导入分支无作品可导。
    expect(resolveOrigin(null, { douyinLoggedIn: true })).toBeNull();
  });

  it("无显式选择 + hasImportedWorks=true(真有存量)→ 回灌 existing", () => {
    expect(resolveOrigin(null, { hasImportedWorks: true })).toBe("existing");
  });

  it("无显式选择 + 无绑定态(false / undefined)→ null(仍未分叉)", () => {
    expect(
      resolveOrigin(null, { douyinLoggedIn: false, hasImportedWorks: false }),
    ).toBeNull();
    expect(resolveOrigin(null, {})).toBeNull();
  });

  it("回灌后(有导入作品)existing 分支步随 deriveGuidedSteps 可见(起点 done + init-data 现身)", () => {
    const origin = resolveOrigin(null, { hasImportedWorks: true });
    const steps = deriveGuidedSteps({ origin, hasImportedWorks: true });
    const keys = steps.map((s) => s.key);
    expect(keys).toContain("import-account"); // 绑号=全员步,恒显
    expect(keys).toContain("init-data"); // existing 分支的后台初始化现身
    expect(steps.find((s) => s.key === "confirm-origin")?.done).toBe(true);
  });
});

describe("[T-161/T-348] deriveGuidedSteps — 分支显隐(按 origin)", () => {
  it("origin=null(未选起点)→ 后台初始化(existing 专属)暂不显示;绑号(全员)恒显", () => {
    const keys = deriveGuidedSteps({ origin: null }).map((s) => s.key);
    // [T-348] 绑号是全员第一步,不随 origin 分支隐(0 号也须先看到「绑号」这一步)。
    expect(keys).toContain("import-account");
    expect(keys).not.toContain("init-data"); // 后台初始化仍是 existing 专属
  });

  it("origin=fresh → 隐藏 后台初始化(从零无历史可导);绑号/配模型/起点/定位/项目仍在", () => {
    const keys = deriveGuidedSteps({ origin: "fresh" }).map((s) => s.key);
    expect(keys).toEqual([
      "import-account",
      "text-model",
      "confirm-origin",
      "positioning-profile",
      "first-project",
    ]);
  });

  it("origin=existing → 全程 6 步(含后台初始化)", () => {
    const keys = deriveGuidedSteps({ origin: "existing" }).map((s) => s.key);
    expect(keys).toEqual([...ALL_KEYS]);
  });
});

describe("[T-161] deriveGuidedSteps — done 派生", () => {
  it("配了文本模型(default capability)→ text-model done", () => {
    expect(
      step({ configuredCapabilities: new Set(["default"]) }, "text-model")?.done,
    ).toBe(true);
    expect(step({}, "text-model")?.done).toBe(false);
  });

  it("确认起点:origin 非 null → confirm-origin done;null → 未完成", () => {
    expect(step({ origin: "fresh" }, "confirm-origin")?.done).toBe(true);
    expect(step({ origin: "existing" }, "confirm-origin")?.done).toBe(true);
    expect(step({ origin: null }, "confirm-origin")?.done).toBe(false);
    expect(step({}, "confirm-origin")?.done).toBe(false);
  });

  it("[T-348] 绑定抖音号:douyinLoggedIn → done;未登录 / 读失败 → 未完成(全员步,不需 origin)", () => {
    // 绑号是全员第一步(branch=all),origin=null 也可见。
    expect(step({ douyinLoggedIn: true }, "import-account")?.done).toBe(true);
    expect(step({ douyinLoggedIn: false }, "import-account")?.done).toBe(false);
    expect(step({}, "import-account")?.done).toBe(false);
  });

  it("后台初始化:存在 imported 作品 → done;无 / 读失败 → 未完成", () => {
    const base = { origin: "existing" as const };
    expect(step({ ...base, hasImportedWorks: true }, "init-data")?.done).toBe(
      true,
    );
    expect(step({ ...base, hasImportedWorks: false }, "init-data")?.done).toBe(
      false,
    );
    expect(step(base, "init-data")?.done).toBe(false);
  });

  it("创建定位:hasPositioningProfile → done", () => {
    expect(
      step({ hasPositioningProfile: true }, "positioning-profile")?.done,
    ).toBe(true);
    expect(
      step({ hasPositioningProfile: false }, "positioning-profile")?.done,
    ).toBe(false);
    expect(step({}, "positioning-profile")?.done).toBe(false);
  });

  it("创建首个项目:projectCount≥1 → done", () => {
    expect(step({ projectCount: 1 }, "first-project")?.done).toBe(true);
    expect(step({ projectCount: 0 }, "first-project")?.done).toBe(false);
    expect(step({}, "first-project")?.done).toBe(false);
  });
});

describe("[T-161/T-348] deriveGuidedSteps — 门控(前置未满足 → blocked)", () => {
  it("步1(绑定抖音号)永不 blocked(第一步无前置)", () => {
    expect(step({}, "import-account")?.blocked).toBe(false);
  });

  it("[T-348] 0 号(绑号未 done)→ 步2(配置文本模型)blocked + 锁提示", () => {
    const s = step({}, "text-model");
    expect(s?.blocked).toBe(true);
    expect(s?.blockedReason && s.blockedReason.length > 0).toBe(true);
  });

  it("步1(绑号)done → 步2(配模型)解锁(不 blocked)", () => {
    const s = step({ douyinLoggedIn: true }, "text-model");
    expect(s?.blocked).toBe(false);
  });

  it("步2(配模型)未 done → 步3(确认起点)blocked(门控只看前一可见步)", () => {
    // 绑号已 done 但模型未配 → 起点仍锁。
    const s = step({ douyinLoggedIn: true }, "confirm-origin");
    expect(s?.blocked).toBe(true);
  });

  it("步2(配模型)done → 步3(确认起点)解锁", () => {
    const s = step(
      { douyinLoggedIn: true, configuredCapabilities: new Set(["default"]) },
      "confirm-origin",
    );
    expect(s?.blocked).toBe(false);
  });

  it("existing 全前置就绪:绑号 + 配模型 + 起点=existing → 步4(后台初始化)解锁", () => {
    const state: OnboardingState = {
      origin: "existing",
      configuredCapabilities: new Set(["default"]),
      douyinLoggedIn: true,
    };
    // init-data 的前置 = confirm-origin(origin=existing 恒 done)→ 解锁。
    expect(step(state, "init-data")?.blocked).toBe(false);
  });

  it("existing:步4(初始化)未 done → 步5(定位)blocked", () => {
    const state: OnboardingState = {
      origin: "existing",
      configuredCapabilities: new Set(["default"]),
      douyinLoggedIn: true,
      hasImportedWorks: false, // 未初始化
    };
    expect(step(state, "positioning-profile")?.blocked).toBe(true);
  });

  it("fresh:配模型 done + 起点已选 → 步5(定位)解锁(fresh 无 init-data 前置)", () => {
    const state: OnboardingState = {
      origin: "fresh",
      configuredCapabilities: new Set(["default"]),
    };
    // fresh 可见链:绑号→配模型→起点→定位;定位前置=起点(fresh 恒 done)→ 解锁。
    expect(step(state, "positioning-profile")?.blocked).toBe(false);
  });

  it("步5(定位)未 done → 步6(首个项目)blocked;定位 done → 解锁", () => {
    const gated: OnboardingState = {
      origin: "fresh",
      configuredCapabilities: new Set(["default"]),
      hasPositioningProfile: false,
    };
    expect(step(gated, "first-project")?.blocked).toBe(true);
    const unlocked: OnboardingState = {
      ...gated,
      hasPositioningProfile: true,
    };
    expect(step(unlocked, "first-project")?.blocked).toBe(false);
  });
});

describe("[T-161/T-348] isOnboardingComplete — 按可见步(origin 分支)", () => {
  it("fresh 全 done(绑号+文本模型+起点+定位+项目)→ true(全隔离:fresh 也须绑号,不看 init-data)", () => {
    const state: OnboardingState = {
      origin: "fresh",
      douyinLoggedIn: true, // [T-348] fresh 也须绑号(全隔离前提)
      configuredCapabilities: new Set(["default"]),
      hasPositioningProfile: true,
      projectCount: 1,
    };
    expect(isOnboardingComplete(deriveGuidedSteps(state))).toBe(true);
  });

  it("[T-348] fresh 缺绑号(douyinLoggedIn 未真)→ false(绑号是全员必完成步)", () => {
    const state: OnboardingState = {
      origin: "fresh",
      configuredCapabilities: new Set(["default"]),
      hasPositioningProfile: true,
      projectCount: 1,
    };
    expect(isOnboardingComplete(deriveGuidedSteps(state))).toBe(false);
  });

  it("existing 全 done(6 步)→ true", () => {
    const state: OnboardingState = {
      origin: "existing",
      configuredCapabilities: new Set(["default"]),
      douyinLoggedIn: true,
      hasImportedWorks: true,
      hasPositioningProfile: true,
      projectCount: 1,
    };
    expect(isOnboardingComplete(deriveGuidedSteps(state))).toBe(true);
  });

  it("existing 缺 绑号(douyinLoggedIn=false)→ false", () => {
    const state: OnboardingState = {
      origin: "existing",
      configuredCapabilities: new Set(["default"]),
      douyinLoggedIn: false, // 缺绑号(步1 未 done)
      hasImportedWorks: true,
      hasPositioningProfile: true,
      projectCount: 1,
    };
    expect(isOnboardingComplete(deriveGuidedSteps(state))).toBe(false);
  });

  it("未选起点(origin=null)→ false(至少还差确认起点这一步)", () => {
    const state: OnboardingState = {
      origin: null,
      configuredCapabilities: new Set(["default"]),
      hasPositioningProfile: true,
      projectCount: 1,
    };
    expect(isOnboardingComplete(deriveGuidedSteps(state))).toBe(false);
  });

  it("空 state → false", () => {
    expect(isOnboardingComplete(deriveGuidedSteps({}))).toBe(false);
  });

  it("无步(空数组)→ true(防空数组误判)", () => {
    expect(isOnboardingComplete([])).toBe(true);
  });
});

describe("[T-161/T-348] progressOf — 已完成 / 总(可见步)", () => {
  it("fresh:文本模型+起点已 done、绑号/定位/项目未 → 2/5(fresh 5 步含绑号)", () => {
    const state: OnboardingState = {
      origin: "fresh",
      configuredCapabilities: new Set(["default"]),
    };
    const { done, total } = progressOf(deriveGuidedSteps(state));
    expect(done).toBe(2); // text-model + confirm-origin(绑号未 done)
    expect(total).toBe(5); // [T-348] 含绑号,fresh 从 4 步变 5 步
  });

  it("existing:文本模型+起点 done(绑号未)→ 2/6", () => {
    const state: OnboardingState = {
      origin: "existing",
      configuredCapabilities: new Set(["default"]),
    };
    // origin=existing → confirm-origin 也算 done(origin!=null);绑号未 done,故 2/6。
    const { done, total } = progressOf(deriveGuidedSteps(state));
    expect(total).toBe(6);
    expect(done).toBe(2);
  });
});
