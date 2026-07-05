/**
 * [T-131 b/c] OnboardingOverlay 集成测:
 *  - 空态(全读失败 = 全未配)→ 自动弹 + 必备步全未完成 + 去配置深链可达。
 *  - 进度条「已完成 N/总 M」派生自真 state。
 *  - 全必备完成 → 不自动弹。
 *  - dismiss(关闭 dialog)→ 记 localStorage,重挂不再自动弹;手动 openOnboarding 仍可重开。
 *
 * jsdom 无 HTTP 后端 → mock contract-client 的四个读 op。mock resolver 可变,
 * 单测据此驱动「已配 / 未配 / 读失败」各路径。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

// ── mock contract-client 四读 op(可变 resolver)──────────────────────────
const clientMock = vi.hoisted(() => ({
  listModels: vi.fn(async () => [] as unknown[]),
  getProfile: vi.fn(async () => ({}) as unknown),
  listProjects: vi.fn(async () => [] as unknown[]),
  getStorage: vi.fn(async () => ({ rootPath: "" }) as unknown),
  // [T-131d] 违禁词/审核规则 + 抖音登录态。
  listReviewRules: vi.fn(async () => [] as unknown[]),
  statusDouyin: vi.fn(async () => ({ loggedIn: false }) as unknown),
}));
vi.mock("@/lib/contract-client", () => ({ client: clientMock }));

async function importOverlay() {
  return await import("./onboarding-overlay");
}

/** 全读失败(reject)→ 全能力 state 缺席 = 空态。 */
function makeAllFail() {
  clientMock.listModels.mockRejectedValue(new Error("no backend"));
  clientMock.getProfile.mockRejectedValue(new Error("404"));
  clientMock.listProjects.mockRejectedValue(new Error("no backend"));
  clientMock.getStorage.mockRejectedValue(new Error("no backend"));
  clientMock.listReviewRules.mockRejectedValue(new Error("no backend"));
  clientMock.statusDouyin.mockRejectedValue(new Error("no backend"));
}

/** 必备全配:text 模型 + 定位母版 + 1 个项目。 */
function makeAllRequiredDone() {
  clientMock.listModels.mockResolvedValue([
    { capability: "default", provider: "anthropic", modelName: "claude" },
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

describe("OnboardingOverlay — 自动弹 / 空态", () => {
  it("空态(全读失败)→ 自动弹,必备步全未完成 + 去配置深链可达", async () => {
    makeAllFail();
    const { OnboardingOverlay } = await importOverlay();
    render(<OnboardingOverlay />);

    // 挂载后拉 state → 判定自动弹 → dialog 内容出现。
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="onboarding-overlay"]'),
      ).not.toBeNull();
    });

    // 必备三步都在 + 全未完成。
    for (const key of ["text-model", "positioning-profile", "first-project"]) {
      const row = document.querySelector(
        `[data-slot="onboarding-step"][data-step-key="${key}"]`,
      );
      expect(row).not.toBeNull();
      expect(row?.getAttribute("data-done")).toBe("false");
    }

    // 去配置深链:文本模型 → /settings,定位 → /positioning,项目 → /projects/new。
    const textCta = document
      .querySelector('[data-step-key="text-model"]')
      ?.querySelector("a");
    expect(textCta?.getAttribute("href")).toBe("/settings");
    const posCta = document
      .querySelector('[data-step-key="positioning-profile"]')
      ?.querySelector("a");
    expect(posCta?.getAttribute("href")).toBe("/positioning");
    const projCta = document
      .querySelector('[data-step-key="first-project"]')
      ?.querySelector("a");
    expect(projCta?.getAttribute("href")).toBe("/projects/new");
  });

  it("进度条显「已完成 N/总 M」派生自真 state", async () => {
    // text 模型配了,其余没配 → done = 1。
    clientMock.listModels.mockResolvedValue([
      { capability: "default", provider: "anthropic", modelName: "claude" },
    ]);
    clientMock.getProfile.mockRejectedValue(new Error("404"));
    clientMock.listProjects.mockResolvedValue([]);
    clientMock.getStorage.mockRejectedValue(new Error("no backend"));

    const { OnboardingOverlay } = await importOverlay();
    render(<OnboardingOverlay />);

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="onboarding-progress"]'),
      ).not.toBeNull();
    });
    const progress = document.querySelector(
      '[data-slot="onboarding-progress"]',
    ) as HTMLElement;
    // 11 步总(3 必备 + 8 可选,含 T-131d 违禁词/抖音),配了 1 步。
    expect(progress.textContent).toContain("已完成 1/11");
    // text-model 打勾。
    const textRow = document.querySelector(
      '[data-step-key="text-model"]',
    ) as HTMLElement;
    expect(textRow.getAttribute("data-done")).toBe("true");
  });

  it("全必备完成 → 不自动弹(dialog 内容不出现)", async () => {
    makeAllRequiredDone();
    const { OnboardingOverlay } = await importOverlay();
    render(<OnboardingOverlay />);

    // 给足时间让 effect 拉完 state。
    await waitFor(() => {
      expect(clientMock.listProjects).toHaveBeenCalled();
    });
    // 必备全配 → 不弹 → dialog content 不在 DOM。
    await new Promise((r) => setTimeout(r, 0));
    expect(
      document.querySelector('[data-slot="onboarding-overlay"]'),
    ).toBeNull();
  });

  it("已 dismissed(localStorage=1)→ 空态也不自动弹", async () => {
    window.localStorage.setItem("creatoros:onboarding:dismissed", "1");
    makeAllFail();
    const { OnboardingOverlay } = await importOverlay();
    render(<OnboardingOverlay />);

    await waitFor(() => {
      expect(clientMock.listProjects).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(
      document.querySelector('[data-slot="onboarding-overlay"]'),
    ).toBeNull();
  });
});

describe("OnboardingOverlay — dismiss / 手动重开", () => {
  it("关闭 dialog → 记 localStorage dismissed=1", async () => {
    makeAllFail();
    const { OnboardingOverlay } = await importOverlay();
    render(<OnboardingOverlay />);

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="onboarding-overlay"]'),
      ).not.toBeNull();
    });

    // 按 Esc 关闭 dialog(radix Dialog 触发 onOpenChange(false))。
    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        window.localStorage.getItem("creatoros:onboarding:dismissed"),
      ).toBe("1");
    });
  });

  it("openOnboarding() 手动重开:即便已 dismissed 也弹开", async () => {
    window.localStorage.setItem("creatoros:onboarding:dismissed", "1");
    makeAllFail();
    const { OnboardingOverlay, openOnboarding } = await importOverlay();
    render(<OnboardingOverlay />);

    // 已 dismissed → 初次不自动弹。
    await waitFor(() => {
      expect(clientMock.listProjects).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(
      document.querySelector('[data-slot="onboarding-overlay"]'),
    ).toBeNull();

    // 手动触发 → 弹开。
    openOnboarding();
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="onboarding-overlay"]'),
      ).not.toBeNull();
    });
  });
});
