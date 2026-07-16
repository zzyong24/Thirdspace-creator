/**
 * [T-161/T-348] OnboardingCard 有序引导流集成测(重构自 T-132 三档清单测):
 *  - 显隐:hidden(localStorage)→ null;isComplete(可见步全 done)→ null;有缺口 → 渲染。
 *  - 步序渲染:竖向编号步,order 升序;当前步(第一个未 done 未 blocked)高亮。
 *  - [T-348] 0 号:绑定抖音号 = 高亮第一步(current)+ CTA→/accounts;后续步(配模型…)blocked 置灰。
 *  - 门控:绑号未 done → 配模型 blocked(锁);绑号 done → 配模型解锁。
 *  - 起点分支:未选 origin → 不显 init-data(existing 专属);选「已有存量」→ 显后台初始化。
 *  - 起点二选一:点「从零开始/已有存量」→ 写 localStorage origin + 卡内重算。
 *  - 清理:web-search / asr 步不再出现。
 *  - 「不再显示」→ 写 hidden + 卡隐藏。
 *
 * jsdom 无 HTTP 后端 → mock contract-client 的读 op。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

// mock next/link(渲成裸 <a>)。
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// mock contract-client 读 op。
const clientMock = vi.hoisted(() => ({
  listModels: vi.fn(async () => [] as unknown[]),
  getProfile: vi.fn(async () => ({}) as unknown),
  // [T-194] loadHasProfile 改用 getPositioningCenter 判 profile 非空(修 getProfile 假阳)。
  getPositioningCenter: vi.fn(async () => ({ profile: null }) as unknown),
  listProjects: vi.fn(async () => [] as unknown[]),
  statusDouyin: vi.fn(async () => ({ loggedIn: false }) as unknown),
}));
vi.mock("@/lib/contract-client", () => ({ client: clientMock }));

async function importCard() {
  return await import("./onboarding-card");
}

const HIDDEN_KEY = "creatoros:onboarding:hidden";
const ORIGIN_KEY = "creatoros:onboarding:origin";

/** 全读失败 → 全能力 state 缺席 = 有缺口(未完成)。 */
function makeAllFail() {
  clientMock.listModels.mockRejectedValue(new Error("no backend"));
  clientMock.getProfile.mockRejectedValue(new Error("404"));
  clientMock.getPositioningCenter.mockRejectedValue(new Error("no backend"));
  clientMock.listProjects.mockRejectedValue(new Error("no backend"));
  clientMock.statusDouyin.mockRejectedValue(new Error("no backend"));
}

/** 只配了文本模型(未绑号),其余未 → 起点选择步在卡内可见、init-data 仍随 origin 隐。 */
function makeTextModelDone() {
  clientMock.listModels.mockResolvedValue([
    { capability: "default", provider: "anthropic", modelName: "claude", hasSecret: true },
  ]);
  clientMock.getProfile.mockRejectedValue(new Error("404"));
  clientMock.getPositioningCenter.mockResolvedValue({ profile: null });
  clientMock.listProjects.mockResolvedValue([]);
  clientMock.statusDouyin.mockResolvedValue({ loggedIn: false });
}

/**
 * [T-348] 已绑号 + 已配文本模型(步1、步2 done)→ 步3「确认起点」成为当前步(unblocked),
 * 卡内起点二选一按钮显示。用于走「起点分支」的用例(需先越过绑号+配模型两道门)。
 */
function makeBoundTextModelDone() {
  clientMock.listModels.mockResolvedValue([
    { capability: "default", provider: "anthropic", modelName: "claude", hasSecret: true },
  ]);
  clientMock.getProfile.mockRejectedValue(new Error("404"));
  clientMock.getPositioningCenter.mockResolvedValue({ profile: null });
  clientMock.listProjects.mockResolvedValue([]);
  clientMock.statusDouyin.mockResolvedValue({ loggedIn: true }); // 已绑号 → 步1 done
}

/** fresh 全 done(绑号 + 文本模型 + 定位 + 项目;起点由 localStorage 预置 fresh)→ isComplete=true。 */
function makeFreshComplete() {
  clientMock.listModels.mockResolvedValue([
    { capability: "default", provider: "anthropic", modelName: "claude", hasSecret: true },
  ]);
  clientMock.getProfile.mockResolvedValue({ id: "p", persona: "x" });
  clientMock.getPositioningCenter.mockResolvedValue({ profile: { id: "p", persona: "x" } });
  clientMock.listProjects.mockResolvedValue([{ id: "proj-1", title: "T", source: "manual" }]);
  // [T-348] 全隔离:fresh 也须绑号,否则绑号步未完成 → onboarding 不算完成。
  clientMock.statusDouyin.mockResolvedValue({ loggedIn: true });
}

beforeEach(() => {
  clientMock.listModels.mockReset();
  clientMock.getProfile.mockReset();
  clientMock.getPositioningCenter.mockReset();
  clientMock.listProjects.mockReset();
  clientMock.statusDouyin.mockReset();
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});

afterEach(() => {
  cleanup();
});

describe("[T-161] OnboardingCard — 显隐矩阵", () => {
  it("有缺口(全读失败=0 号)→ 渲染卡片,含进度与步序", async () => {
    makeAllFail();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);

    await waitFor(() => {
      expect(document.querySelector('[data-slot="onboarding-card"]')).not.toBeNull();
    });
    // [T-348] 步1(绑定抖音号)在,未完成。
    const s1 = document.querySelector('[data-step-key="import-account"]');
    expect(s1).not.toBeNull();
    expect(s1?.getAttribute("data-done")).toBe("false");
    // 步2(配置文本模型)、步3(确认起点)在。
    expect(document.querySelector('[data-step-key="text-model"]')).not.toBeNull();
    expect(document.querySelector('[data-step-key="confirm-origin"]')).not.toBeNull();
  });

  it("已 hidden(localStorage=1)→ 不渲染", async () => {
    window.localStorage.setItem(HIDDEN_KEY, "1");
    makeAllFail();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(clientMock.listModels).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[data-slot="onboarding-card"]')).toBeNull();
  });

  it("fresh 全 done(起点=fresh + 文本模型 + 定位 + 项目)→ 不渲染(卡自动隐藏)", async () => {
    window.localStorage.setItem(ORIGIN_KEY, "fresh");
    makeFreshComplete();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(clientMock.listModels).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[data-slot="onboarding-card"]')).toBeNull();
  });
});

describe("[T-161/T-348] OnboardingCard — 门控 / 高亮", () => {
  it("[T-348] 0 号:绑定抖音号 = 当前高亮步 + CTA→/accounts;配模型 blocked 置灰", async () => {
    makeAllFail(); // 全 per-account 读失败 = 0 号
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(document.querySelector('[data-step-key="import-account"]')).not.toBeNull();
    });
    const bind = document.querySelector('[data-step-key="import-account"]');
    // 绑号 = 当前步(高亮)、未完成、未锁。
    expect(bind?.getAttribute("data-current")).toBe("true");
    expect(bind?.getAttribute("data-done")).toBe("false");
    expect(bind?.getAttribute("data-blocked")).toBe("false");
    // CTA 深链 → /accounts(绑号步内唯一的 <a> 即 CTA)。
    const cta = bind?.querySelector("a");
    expect(cta?.getAttribute("href")).toBe("/accounts");
    // 步2(配置文本模型)被绑号门锁住(置灰 + 锁提示)。
    const s2 = document.querySelector('[data-step-key="text-model"]');
    expect(s2?.getAttribute("data-blocked")).toBe("true");
    expect(s2?.querySelector('[data-slot="onboarding-step-locked"]')).not.toBeNull();
  });

  it("绑号未 done → 配模型 blocked(锁提示,无 CTA)", async () => {
    makeAllFail();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(document.querySelector('[data-step-key="text-model"]')).not.toBeNull();
    });
    const s2 = document.querySelector('[data-step-key="text-model"]');
    expect(s2?.getAttribute("data-blocked")).toBe("true");
    expect(s2?.querySelector('[data-slot="onboarding-step-locked"]')).not.toBeNull();
    // blocked 步不渲 CTA。
    expect(s2?.querySelector('[data-slot="onboarding-step-cta"]')).toBeNull();
  });

  it("[T-348] 绑号 + 配模型 done → 确认起点解锁 + 成为当前步 + 起点二选一按钮显示", async () => {
    makeBoundTextModelDone();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(document.querySelector('[data-step-key="confirm-origin"]')).not.toBeNull();
    });
    const s1 = document.querySelector('[data-step-key="import-account"]');
    const s2 = document.querySelector('[data-step-key="text-model"]');
    const s3 = document.querySelector('[data-step-key="confirm-origin"]');
    expect(s1?.getAttribute("data-done")).toBe("true"); // 绑号 done
    expect(s2?.getAttribute("data-done")).toBe("true"); // 配模型 done
    expect(s3?.getAttribute("data-blocked")).toBe("false");
    expect(s3?.getAttribute("data-current")).toBe("true");
    expect(s3?.querySelector('[data-slot="onboarding-origin-choice"]')).not.toBeNull();
  });
});

describe("[T-161/T-348] OnboardingCard — 起点分支", () => {
  it("未选 origin → 不显 init-data(existing 专属);绑号(全员)恒显", async () => {
    makeBoundTextModelDone(); // 绑号+配模型 done → 起点步可操作;origin 未选(localStorage 空)
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(document.querySelector('[data-step-key="confirm-origin"]')).not.toBeNull();
    });
    // [T-348] 绑号是全员步,恒显;init-data 仍随 origin 隐。
    expect(document.querySelector('[data-step-key="import-account"]')).not.toBeNull();
    expect(document.querySelector('[data-step-key="init-data"]')).toBeNull();
  });

  it("点「已有存量」→ 写 localStorage origin=existing + 显示后台初始化步", async () => {
    makeBoundTextModelDone();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="onboarding-origin-existing"]'),
      ).not.toBeNull();
    });
    const btn = document.querySelector(
      '[data-slot="onboarding-origin-existing"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    // 选 existing → init-data(后台初始化)现身。
    await waitFor(() => {
      expect(document.querySelector('[data-step-key="init-data"]')).not.toBeNull();
    });
    expect(window.localStorage.getItem(ORIGIN_KEY)).toBe("existing");
  });

  it("点「从零开始」→ 写 origin=fresh + 不显 init-data(从零无历史可导)", async () => {
    makeBoundTextModelDone();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="onboarding-origin-fresh"]'),
      ).not.toBeNull();
    });
    const btn = document.querySelector(
      '[data-slot="onboarding-origin-fresh"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(window.localStorage.getItem(ORIGIN_KEY)).toBe("fresh");
    });
    expect(document.querySelector('[data-step-key="init-data"]')).toBeNull();
    // 绑号(全员)仍在。
    expect(document.querySelector('[data-step-key="import-account"]')).not.toBeNull();
    // 起点步变 done(打勾),定位步成为下一个可做步。
    expect(
      document
        .querySelector('[data-step-key="confirm-origin"]')
        ?.getAttribute("data-done"),
    ).toBe("true");
  });
});

describe("[T-161] OnboardingCard — 清理 / 交互", () => {
  it("清理:web-search / asr / 生图 步不再出现(existing 全展开也没有)", async () => {
    window.localStorage.setItem(ORIGIN_KEY, "existing");
    makeTextModelDone();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(document.querySelector('[data-step-key="import-account"]')).not.toBeNull();
    });
    for (const gone of ["web-search", "asr-model", "image-model", "video-model"]) {
      expect(document.querySelector(`[data-step-key="${gone}"]`)).toBeNull();
    }
  });

  it("点「不再显示」→ 写 localStorage hidden=1 且卡隐藏", async () => {
    makeAllFail();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(document.querySelector('[data-slot="onboarding-card"]')).not.toBeNull();
    });
    const dismissBtn = document.querySelector(
      '[data-slot="onboarding-card-dismiss"]',
    ) as HTMLButtonElement;
    fireEvent.click(dismissBtn);
    await waitFor(() => {
      expect(document.querySelector('[data-slot="onboarding-card"]')).toBeNull();
    });
    expect(window.localStorage.getItem(HIDDEN_KEY)).toBe("1");
  });

  it("点卡头折叠 → 折叠隐藏步序主体(进度条仍在)", async () => {
    makeAllFail();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(document.querySelector('[data-slot="onboarding-card-body"]')).not.toBeNull();
    });
    const toggle = document.querySelector(
      '[data-slot="onboarding-card-toggle"]',
    ) as HTMLButtonElement;
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(document.querySelector('[data-slot="onboarding-card-body"]')).toBeNull();
    });
    expect(document.querySelector('[data-slot="onboarding-progress"]')).not.toBeNull();
  });
});

describe("[T-189b] OnboardingCard — 引导与实际行为双向绑定", () => {
  it("Gap A:账号绑定广播 → 重拉引导态(绑号后 statusDouyin 翻真 → 步1「绑定抖音号」变已完成)", async () => {
    window.localStorage.setItem(ORIGIN_KEY, "existing");
    makeTextModelDone(); // 初始 statusDouyin loggedIn=false → 绑号步未完成
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-step-key="import-account"]'),
      ).not.toBeNull();
    });
    // 初始:未登录 → 步3 未完成。
    expect(
      document
        .querySelector('[data-step-key="import-account"]')
        ?.getAttribute("data-done"),
    ).toBe("false");

    // 模拟绑定成功:statusDouyin 翻真 + 广播账号变更 → 卡应重拉并刷新引导态。
    clientMock.statusDouyin.mockResolvedValue({ loggedIn: true });
    fireEvent(window, new CustomEvent("creatoros:accounts-changed"));

    await waitFor(() => {
      expect(
        document
          .querySelector('[data-step-key="import-account"]')
          ?.getAttribute("data-done"),
      ).toBe("true");
    });
  });

  it("[T-348] Gap B:仅已绑抖音(无导入作品)+ 无起点选择 → 不回灌,确认起点步现身让用户手选新/老", async () => {
    // 无 ORIGIN_KEY;statusDouyin 登录但无导入作品 → 绑号≠有存量 → 不回灌,origin 仍为 null。
    clientMock.listModels.mockResolvedValue([
      { capability: "default", provider: "anthropic", modelName: "claude", hasSecret: true },
    ]);
    clientMock.getProfile.mockRejectedValue(new Error("404"));
    clientMock.getPositioningCenter.mockResolvedValue({ profile: null });
    clientMock.listProjects.mockResolvedValue([]); // 无导入作品
    clientMock.statusDouyin.mockResolvedValue({ loggedIn: true }); // 已绑号
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-step-key="confirm-origin"]'),
      ).not.toBeNull();
    });
    const s3 = document.querySelector('[data-step-key="confirm-origin"]');
    // 未回灌 → 确认起点未 done,成为当前步(绑号+配模型 done 已越过前两门),起点二选一按钮显示。
    expect(s3?.getAttribute("data-done")).toBe("false");
    expect(s3?.getAttribute("data-current")).toBe("true");
    expect(
      s3?.querySelector('[data-slot="onboarding-origin-choice"]'),
    ).not.toBeNull();
    // 未回灌 existing → 后台初始化(init-data)不显。
    expect(document.querySelector('[data-step-key="init-data"]')).toBeNull();
    // 不落盘。
    expect(window.localStorage.getItem(ORIGIN_KEY)).toBeNull();
  });

  it("Gap B:已有 imported 作品 + localStorage 无选择 → 同样回灌 existing", async () => {
    clientMock.listModels.mockResolvedValue([
      { capability: "default", provider: "anthropic", modelName: "claude", hasSecret: true },
    ]);
    clientMock.getProfile.mockRejectedValue(new Error("404"));
    clientMock.listProjects.mockResolvedValue([{ id: "p", title: "T", source: "imported" }]);
    clientMock.statusDouyin.mockResolvedValue({ loggedIn: false });
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-step-key="init-data"]'),
      ).not.toBeNull();
    });
    expect(
      document
        .querySelector('[data-step-key="confirm-origin"]')
        ?.getAttribute("data-done"),
    ).toBe("true");
    expect(window.localStorage.getItem(ORIGIN_KEY)).toBeNull();
  });

  it("Gap B:用户已手选 fresh + 已登录 → 不被回灌成 existing(显式选择优先)", async () => {
    window.localStorage.setItem(ORIGIN_KEY, "fresh");
    clientMock.listModels.mockResolvedValue([
      { capability: "default", provider: "anthropic", modelName: "claude", hasSecret: true },
    ]);
    clientMock.getProfile.mockRejectedValue(new Error("404"));
    clientMock.listProjects.mockResolvedValue([]);
    clientMock.statusDouyin.mockResolvedValue({ loggedIn: true });
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-step-key="confirm-origin"]'),
      ).not.toBeNull();
    });
    // [T-348] 手选 fresh → init-data(existing 专属)不显(未被回灌);绑号(全员)仍在。
    expect(document.querySelector('[data-step-key="init-data"]')).toBeNull();
    expect(document.querySelector('[data-step-key="import-account"]')).not.toBeNull();
  });
});

describe("clearOnboardingFlags — 让「不再显示」可逆(设置页入口用)", () => {
  it("清 hidden flag(清后常驻卡下次挂载重现)", async () => {
    window.localStorage.setItem(HIDDEN_KEY, "1");
    const { clearOnboardingFlags } = await importCard();
    clearOnboardingFlags();
    expect(window.localStorage.getItem(HIDDEN_KEY)).toBeNull();
  });
});
