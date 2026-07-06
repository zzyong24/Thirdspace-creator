/**
 * [T-132 切片 3;T-138] OnboardingCard 常驻卡集成测:
 *  - 显隐矩阵:hidden(localStorage)→ null;isComplete(required+recommended 全配)→ null;
 *    有缺口 → 渲染。
 *  - 点「不再显示」→ 写 localStorage hidden=1 且卡隐藏。
 *  - clearOnboardingFlags 清 hidden flag(设置页入口用,清后导航回首页 → 卡重现)。
 *
 * [T-138] 弹窗已删,常驻卡是唯一引导载体:无「打开完整引导」按钮、无 open event、
 * 无 reopenOnboarding、无 dismissed flag。
 *
 * jsdom 无 HTTP 后端 → mock contract-client 的读 op。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

// ── mock next/link(不触发真路由,渲成裸 <a>)────────────────────────────
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

// ── mock contract-client 读 op(可变 resolver)────────────────────────────
const clientMock = vi.hoisted(() => ({
  listModels: vi.fn(async () => [] as unknown[]),
  getProfile: vi.fn(async () => ({}) as unknown),
  listProjects: vi.fn(async () => [] as unknown[]),
  getStorage: vi.fn(async () => ({ rootPath: "" }) as unknown),
  listReviewRules: vi.fn(async () => [] as unknown[]),
  statusDouyin: vi.fn(async () => ({ loggedIn: false }) as unknown),
}));
vi.mock("@/lib/contract-client", () => ({ client: clientMock }));

async function importCard() {
  return await import("./onboarding-card");
}

const HIDDEN_KEY = "creatoros:onboarding:hidden";

/** 全读失败 → 全能力 state 缺席 = 有缺口(未完成)。 */
function makeAllFail() {
  clientMock.listModels.mockRejectedValue(new Error("no backend"));
  clientMock.getProfile.mockRejectedValue(new Error("404"));
  clientMock.listProjects.mockRejectedValue(new Error("no backend"));
  clientMock.getStorage.mockRejectedValue(new Error("no backend"));
  clientMock.listReviewRules.mockRejectedValue(new Error("no backend"));
  clientMock.statusDouyin.mockRejectedValue(new Error("no backend"));
}

/** required + recommended 全配(text 模型 + 定位 + 项目 + 联网搜索)→ isComplete=true。 */
function makeRequiredAndRecommendedDone() {
  clientMock.listModels.mockResolvedValue([
    // text 模型必配 key(hasSecret)才算「真能跑」;web.search 免 key(rss 无需密钥)。
    { capability: "default", provider: "anthropic", modelName: "claude", hasSecret: true },
    { capability: "web.search", provider: "rss", modelName: "" },
  ]);
  clientMock.getProfile.mockResolvedValue({ id: "p", persona: "x" });
  clientMock.listProjects.mockResolvedValue([{ id: "proj-1", title: "T" }]);
  clientMock.getStorage.mockRejectedValue(new Error("no backend"));
  clientMock.listReviewRules.mockResolvedValue([]);
  clientMock.statusDouyin.mockResolvedValue({ loggedIn: false });
}

beforeEach(() => {
  clientMock.listModels.mockReset();
  clientMock.getProfile.mockReset();
  clientMock.listProjects.mockReset();
  clientMock.getStorage.mockReset();
  clientMock.listReviewRules.mockReset();
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

describe("OnboardingCard — 显隐矩阵", () => {
  it("有缺口(全读失败)→ 渲染卡片,含进度与三档清单", async () => {
    makeAllFail();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);

    await waitFor(() => {
      expect(document.querySelector('[data-slot="onboarding-card"]')).not.toBeNull();
    });
    // 必备步在(未完成)。
    const textRow = document.querySelector(
      '[data-slot="onboarding-step"][data-step-key="text-model"]',
    );
    expect(textRow).not.toBeNull();
    expect(textRow?.getAttribute("data-done")).toBe("false");
    // 建议组也渲(定位母版在 recommended)。
    expect(
      document.querySelector('[data-step-key="positioning-profile"]'),
    ).not.toBeNull();
  });

  it("已 hidden(localStorage=1)→ 不渲染", async () => {
    window.localStorage.setItem(HIDDEN_KEY, "1");
    makeAllFail();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);

    // 给足时间让 effect 拉完 state。
    await waitFor(() => {
      expect(clientMock.listProjects).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[data-slot="onboarding-card"]')).toBeNull();
  });

  it("required + recommended 全配 → 不渲染(卡自动隐藏)", async () => {
    makeRequiredAndRecommendedDone();
    const { OnboardingCard } = await importCard();
    render(<OnboardingCard />);

    await waitFor(() => {
      expect(clientMock.listProjects).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[data-slot="onboarding-card"]')).toBeNull();
  });
});

describe("OnboardingCard — 交互", () => {
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

  it("点卡头折叠切换 → 折叠隐藏清单主体(进度条仍在)", async () => {
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
    // 进度条仍渲(折叠只藏主体)。
    expect(document.querySelector('[data-slot="onboarding-progress"]')).not.toBeNull();
  });
});

describe("clearOnboardingFlags — [T-138] 让「不再显示」可逆(设置页入口用)", () => {
  it("清 hidden flag(清后常驻卡下次挂载重现)", async () => {
    window.localStorage.setItem(HIDDEN_KEY, "1");
    const { clearOnboardingFlags } = await importCard();

    clearOnboardingFlags();

    // hidden 被清 → 常驻卡下次挂载重现。
    expect(window.localStorage.getItem(HIDDEN_KEY)).toBeNull();
  });
});
