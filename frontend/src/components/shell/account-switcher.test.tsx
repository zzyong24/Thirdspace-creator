import * as React from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-136 切片 a] AccountSwitcher 交互 + 退化接线测。证明:挂载后拉 listAccounts → 归一当前号
// (§E 自动选第一个 active)写 localStorage;切号写 localStorage + router.refresh;0 号显绑定引导;
// 读失败诚实降级。Radix 下拉在 jsdom 里需先点 trigger 展开。

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const listAccounts = vi.fn();
vi.mock("@/lib/contract-client", () => ({
  client: { listAccounts: (i: unknown) => listAccounts(i) },
}));

import { AccountSwitcher } from "./account-switcher";
import { CURRENT_ACCOUNT_KEY } from "@/lib/http-transport";

function row(
  id: string,
  status: "active" | "archived" = "active",
) {
  return {
    id,
    userId: "user-a",
    platform: "douyin",
    accountHandle: `@${id}`,
    secretReference: null,
    followerBaseline: 0,
    status,
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  };
}

beforeEach(() => {
  mockRouter.refresh.mockReset();
  listAccounts.mockReset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

describe("AccountSwitcher", () => {
  it("挂载后无 stored → 自动选第一个 active 号写 localStorage(§E ②)", async () => {
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() => {
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a");
    });
    // trigger 显当前号 handle
    expect(screen.getByTestId("account-switcher-trigger")).toHaveAttribute(
      "aria-label",
      "当前抖音号：@a",
    );
  });

  it("stored 指向已删号 → 清除回落第一个 active(§E ③)", async () => {
    window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "ghost");
    listAccounts.mockResolvedValue([row("a")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() => {
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a");
    });
  });

  it("切号 → 写 localStorage + router.refresh", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
    );
    // 展开菜单
    await user.click(screen.getByTestId("account-switcher-trigger"));
    const items = await screen.findAllByTestId("account-switcher-item");
    const itemB = items.find(
      (el) => el.getAttribute("data-account-id") === "b",
    )!;
    await user.click(itemB);
    await waitFor(() => {
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("b");
    });
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("0 个号 → 显绑定引导(§E ①,不崩)", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(screen.getByTestId("account-switcher")).toHaveAttribute(
        "data-state",
        "ready",
      ),
    );
    await user.click(screen.getByTestId("account-switcher-trigger"));
    expect(await screen.findByTestId("account-switcher-empty")).toBeTruthy();
    // 绑定入口存在,深链 /accounts(DropdownMenuItem asChild → testid 合并到 <a> 本体)。
    expect(screen.getByTestId("account-switcher-bind")).toHaveAttribute(
      "href",
      "/accounts",
    );
  });

  it("listAccounts 抛错 → 诚实降级(不崩,显不可用)", async () => {
    const user = userEvent.setup();
    listAccounts.mockRejectedValue(new Error("network down"));
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(screen.getByTestId("account-switcher")).toHaveAttribute(
        "data-state",
        "error",
      ),
    );
    await user.click(screen.getByTestId("account-switcher-trigger"));
    expect(await screen.findByTestId("account-switcher-error")).toBeTruthy();
  });

  it("只列 active 号,归档号不进切换列表", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("live"), row("arch", "archived")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("live"),
    );
    await user.click(screen.getByTestId("account-switcher-trigger"));
    const items = await screen.findAllByTestId("account-switcher-item");
    const ids = items.map((el) => el.getAttribute("data-account-id"));
    expect(ids).toContain("live");
    expect(ids).not.toContain("arch");
  });
});
