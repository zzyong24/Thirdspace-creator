import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

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

const clientMock = vi.hoisted(() => ({
  listProjects: vi.fn(async () => [] as unknown[]),
  statusDouyin: vi.fn(async () => ({ loggedIn: false }) as unknown),
  getPositioningCenter: vi.fn(async () => ({ profile: null }) as unknown),
  getIntelligenceWorkspace: vi.fn(async () => ({ sources: [] }) as unknown),
  listIntelligenceItems: vi.fn(async () => [] as unknown[]),
}));
const readCurrentAccountId = vi.hoisted(() => vi.fn(() => "account-1"));

vi.mock("@/lib/contract-client", () => ({ client: clientMock }));
vi.mock("@/lib/http-transport", () => ({ readCurrentAccountId }));

import {
  OnboardingCard,
  requestOnboardingReopen,
} from "./onboarding-card";

const ORIGIN_KEY = "creatoros:onboarding:origin";
const REVIEWED_KEY =
  "creatoros:onboarding:reviewed-imported-projects:account-1";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  readCurrentAccountId.mockReturnValue("account-1");
  clientMock.listProjects.mockResolvedValue([]);
  clientMock.statusDouyin.mockResolvedValue({ loggedIn: false });
  clientMock.getPositioningCenter.mockResolvedValue({ profile: null });
  clientMock.getIntelligenceWorkspace.mockResolvedValue({ sources: [] });
  clientMock.listIntelligenceItems.mockResolvedValue([]);
});

afterEach(cleanup);

describe("[T-637] OnboardingCard", () => {
  it("首屏只展示创作成果主线，不展示自动化或模型配置", async () => {
    render(<OnboardingCard />);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="onboarding-card"]')).not.toBeNull(),
    );
    expect(document.body.textContent).toContain("绑定你的抖音号");
    expect(document.body.textContent).not.toContain("自动化");
    expect(document.body.textContent).not.toContain("配置文本模型");
  });

  it("已有作品出现后，点击“查看并确认”按账号记录确认并解锁定位", async () => {
    window.localStorage.setItem(ORIGIN_KEY, "existing");
    clientMock.statusDouyin.mockResolvedValue({ loggedIn: true });
    clientMock.listProjects.mockResolvedValue([
      { id: "old", source: "imported" },
    ]);
    render(<OnboardingCard />);

    const link = await waitFor(() => {
      const node = document.querySelector<HTMLAnchorElement>(
        '[data-step-key="review-imported-projects"] a',
      );
      expect(node).not.toBeNull();
      return node!;
    });
    expect(link.getAttribute("href")).toBe("/projects");
    fireEvent.click(link);
    expect(window.localStorage.getItem(REVIEWED_KEY)).toBe("1");
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-step-key="review-imported-projects"]')
          ?.getAttribute("data-done"),
      ).toBe("true"),
    );
  });

  it("全部完成时默认隐藏，但设置页发重新打开事件后立即显示", async () => {
    window.localStorage.setItem(ORIGIN_KEY, "fresh");
    clientMock.statusDouyin.mockResolvedValue({ loggedIn: true });
    clientMock.listProjects.mockResolvedValue([
      { id: "new", source: "topic" },
    ]);
    clientMock.getPositioningCenter.mockResolvedValue({
      profile: { id: "profile-1" },
    });
    clientMock.getIntelligenceWorkspace.mockResolvedValue({
      sources: [
        { id: "source-1", type: "creator_profile", monitorEnabled: true, status: "active" },
      ],
    });
    clientMock.listIntelligenceItems.mockResolvedValue([
      { item: { id: "item-1" } },
    ]);

    render(<OnboardingCard />);
    await waitFor(() =>
      expect(clientMock.listProjects).toHaveBeenCalled(),
    );
    expect(document.querySelector('[data-slot="onboarding-card"]')).toBeNull();

    requestOnboardingReopen();
    await waitFor(() =>
      expect(document.querySelector('[data-slot="onboarding-card"]')).not.toBeNull(),
    );
    expect(
      document.querySelector('[data-slot="onboarding-reopened-complete"]')
        ?.textContent,
    ).toContain("引导已重新打开");
  });

  it("重新打开会覆盖旧的“不再显示”偏好", async () => {
    window.localStorage.setItem("creatoros:onboarding:hidden", "1");
    requestOnboardingReopen();
    expect(window.localStorage.getItem("creatoros:onboarding:hidden")).toBeNull();
    expect(window.localStorage.getItem("creatoros:onboarding:force-open")).toBe("1");
  });
});
