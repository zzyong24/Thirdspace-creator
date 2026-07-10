/**
 * onboarding-data 装配层单测。
 *
 * [Bug #3] `loadConfiguredCapabilities` 铁律:**「已配」= 真能跑(provider 非空 且
 * hasSecret),不是「行存在」**(空占位骨架不打勾)。
 *
 * [T-161] 新增:
 *  - origin 起点落盘(localStorage `creatoros:onboarding:origin`)读/写。
 *  - `loadHasImportedWorks`:存在 ≥1 个 source==="imported" 的项目 → true(推断后台初始化跑过)。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const listModels = vi.hoisted(() => vi.fn());
const listProjects = vi.hoisted(() => vi.fn());
const statusDouyin = vi.hoisted(() => vi.fn());
const getProfile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/contract-client", () => ({
  client: { listModels, listProjects, statusDouyin, getProfile },
}));

import {
  loadConfiguredCapabilities,
  loadHasImportedWorks,
  loadState,
  readOrigin,
  writeOrigin,
} from "./onboarding-data";

const ORIGIN_KEY = "creatoros:onboarding:origin";

/** 造一行 listModels DTO —— 默认「真配了」,各 case 覆写要考察的字段。 */
function modelRow(over: Record<string, unknown> = {}) {
  return {
    capability: "default",
    provider: "anthropic",
    modelName: "claude-3-5-sonnet",
    hasSecret: true,
    ...over,
  };
}

describe("loadConfiguredCapabilities — 「真配了」才入集合", () => {
  beforeEach(() => {
    listModels.mockReset();
  });

  it("真配了(provider 非空 且 hasSecret)→ capability 入集合", async () => {
    listModels.mockResolvedValue([modelRow({ capability: "default" })]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("default")).toBe(true);
  });

  it("T-135 空占位骨架(provider 非空但 hasSecret=false)→ 不入集合", async () => {
    listModels.mockResolvedValue([
      modelRow({ capability: "default", hasSecret: false }),
    ]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("default")).toBe(false);
  });

  it("provider 空占位(且无 secret)→ 不入集合", async () => {
    listModels.mockResolvedValue([
      modelRow({ capability: "default", provider: "", hasSecret: false }),
    ]);
    const set = await loadConfiguredCapabilities();
    expect(set?.has("default")).toBe(false);
  });

  it("读失败(listModels reject)→ undefined(诚实降级)", async () => {
    listModels.mockRejectedValue(new Error("read failed"));
    const set = await loadConfiguredCapabilities();
    expect(set).toBeUndefined();
  });
});

describe("[T-161] loadHasImportedWorks — 有 imported 作品才 true", () => {
  beforeEach(() => {
    listProjects.mockReset();
  });

  it("存在 ≥1 个 source==='imported' 的项目 → true", async () => {
    listProjects.mockResolvedValue([
      { id: "p1", source: "manual" },
      { id: "p2", source: "imported" },
    ]);
    expect(await loadHasImportedWorks()).toBe(true);
  });

  it("全是 manual / topic(无导入)→ false", async () => {
    listProjects.mockResolvedValue([
      { id: "p1", source: "manual" },
      { id: "p2", source: "topic" },
    ]);
    expect(await loadHasImportedWorks()).toBe(false);
  });

  it("空列表 → false", async () => {
    listProjects.mockResolvedValue([]);
    expect(await loadHasImportedWorks()).toBe(false);
  });

  it("读失败 → undefined(诚实降级)", async () => {
    listProjects.mockRejectedValue(new Error("no backend"));
    expect(await loadHasImportedWorks()).toBeUndefined();
  });
});

describe("[T-161] origin 起点落盘(localStorage)", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* noop */
    }
  });

  it("未写过 → readOrigin() = null", () => {
    expect(readOrigin()).toBeNull();
  });

  it("写 fresh → 读回 fresh;写 existing → 读回 existing", () => {
    writeOrigin("fresh");
    expect(readOrigin()).toBe("fresh");
    writeOrigin("existing");
    expect(readOrigin()).toBe("existing");
  });

  it("脏值(非 fresh/existing)→ readOrigin() 降级为 null", () => {
    window.localStorage.setItem("creatoros:onboarding:origin", "garbage");
    expect(readOrigin()).toBeNull();
  });
});

describe("[T-189b] loadState — origin 回灌(显式选择优先 > 绑定态,不落盘)", () => {
  beforeEach(() => {
    listModels.mockReset();
    listProjects.mockReset();
    statusDouyin.mockReset();
    getProfile.mockReset();
    try {
      window.localStorage.clear();
    } catch {
      /* noop */
    }
    // 默认全空 / 降级:无模型、无项目、无定位、未登录。
    listModels.mockResolvedValue([]);
    listProjects.mockResolvedValue([]);
    getProfile.mockRejectedValue(new Error("404"));
    statusDouyin.mockResolvedValue({ loggedIn: false });
  });

  it("localStorage 无选择 + douyinLoggedIn=true → origin 回灌 existing", async () => {
    statusDouyin.mockResolvedValue({ loggedIn: true });
    const s = await loadState();
    expect(s.origin).toBe("existing");
    expect(s.douyinLoggedIn).toBe(true);
    // 回灌只是运行时派生,不写 localStorage。
    expect(window.localStorage.getItem(ORIGIN_KEY)).toBeNull();
  });

  it("localStorage 无选择 + hasImportedWorks=true → origin 回灌 existing", async () => {
    listProjects.mockResolvedValue([{ id: "p", source: "imported" }]);
    const s = await loadState();
    expect(s.origin).toBe("existing");
    expect(s.hasImportedWorks).toBe(true);
  });

  it("用户已手选 fresh → 不被回灌成 existing(即便已登录)", async () => {
    window.localStorage.setItem(ORIGIN_KEY, "fresh");
    statusDouyin.mockResolvedValue({ loggedIn: true });
    const s = await loadState();
    expect(s.origin).toBe("fresh");
  });

  it("无选择 + 无绑定态 → origin=null(仍未分叉)", async () => {
    const s = await loadState();
    expect(s.origin).toBeNull();
  });
});
