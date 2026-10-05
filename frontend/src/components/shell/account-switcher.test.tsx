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
import {
  CURRENT_ACCOUNT_KEY,
  CURRENT_ACCOUNT_COOKIE,
} from "@/lib/http-transport";
import {
  beginForegroundActivity,
  resetForegroundActivitiesForTest,
} from "@/lib/foreground-activity";

function row(
  id: string,
  status: "active" | "archived" = "active",
  platform = "douyin",
) {
  return {
    id,
    userId: "user-a",
    platform,
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
  // [T-332 S4] cookie / 前台操作注册表也是切换器状态,测试间必须隔离。
  document.cookie = `${CURRENT_ACCOUNT_COOKIE}=; Path=/; Max-Age=0`;
  resetForegroundActivitiesForTest();
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
      "当前账号：@a",
    );
  });

  it("小红书账号也可成为当前工作区，并与抖音号一起切换", async () => {
    listAccounts.mockResolvedValue([row("xhs", "active", "xiaohongshu"), row("dy")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() => expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("xhs"));
    expect(screen.getByTestId("account-switcher-trigger")).toHaveAttribute("aria-label", "当前账号：@xhs");
    expect(screen.getByTestId("account-switcher-trigger").textContent).toContain("小红书");
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ query: { page: 1, pageSize: 100 } }));
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

  // [T-332 S4] 切号 = 切整个工作区(SPEC §6.1):cookie 镜像 + accountsChanged 广播。
  it("切号 → 同步镜像 current-account cookie(RSC 首个 refresh 即新号)", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
    );
    await user.click(screen.getByTestId("account-switcher-trigger"));
    const items = await screen.findAllByTestId("account-switcher-item");
    await user.click(
      items.find((el) => el.getAttribute("data-account-id") === "b")!,
    );
    await waitFor(() => {
      expect(document.cookie).toContain(`${CURRENT_ACCOUNT_COOKIE}=b`);
    });
  });

  it("切号 → 广播 accountsChanged(island 内部缓存态统一失效重取)", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    const onChanged = vi.fn();
    window.addEventListener("creatoros:accounts-changed", onChanged);
    try {
      render(<AccountSwitcher collapsed={false} />);
      await waitFor(() =>
        expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
      );
      expect(onChanged).not.toHaveBeenCalled(); // 挂载归一不广播,只有真切号才广播
      await user.click(screen.getByTestId("account-switcher-trigger"));
      const items = await screen.findAllByTestId("account-switcher-item");
      await user.click(
        items.find((el) => el.getAttribute("data-account-id") === "b")!,
      );
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener("creatoros:accounts-changed", onChanged);
    }
  });

  it("[T-909] 切号广播不让切换器重复拉账号列表", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
    );
    listAccounts.mockClear();

    await user.click(screen.getByTestId("account-switcher-trigger"));
    const items = await screen.findAllByTestId("account-switcher-item");
    await user.click(
      items.find((el) => el.getAttribute("data-account-id") === "b")!,
    );

    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("b"),
    );
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("[T-912] 切号先提交可见选中态，整页数据刷新延后一帧", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "a");
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    const afterPaint: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        afterPaint.push(callback);
        return 1;
      });
    try {
      render(<AccountSwitcher collapsed={false} />);
      await waitFor(() =>
        expect(screen.getByTestId("account-switcher-trigger")).toHaveAttribute(
          "aria-label",
          "当前账号：@a",
        ),
      );

      await user.click(screen.getByTestId("account-switcher-trigger"));
      const items = await screen.findAllByTestId("account-switcher-item");
      await user.click(
        items.find((el) => el.getAttribute("data-account-id") === "b")!,
      );

      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("b");
      expect(screen.getByTestId("account-switcher-trigger")).toHaveAttribute(
        "aria-label",
        "当前账号：@b",
      );
      expect(mockRouter.refresh).not.toHaveBeenCalled();
      expect(afterPaint).toHaveLength(1);

      afterPaint[0]!(0);
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
    } finally {
      raf.mockRestore();
    }
  });

  it("stored 失效自愈(回落自动选号)→ 补 router.refresh(RSC 首屏按归一号重渲)", async () => {
    window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "ghost");
    listAccounts.mockResolvedValue([row("a")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  // [T-332 S4·§6.1] 有进行中的前台操作 → 弹确认;取消留在原号,确认才切。
  it("前台操作进行中 → 切号先弹确认;取消不切", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
    );
    const end = beginForegroundActivity("AI 编导正在生成回复");
    try {
      await user.click(screen.getByTestId("account-switcher-trigger"));
      const items = await screen.findAllByTestId("account-switcher-item");
      await user.click(
        items.find((el) => el.getAttribute("data-account-id") === "b")!,
      );
      // 弹确认,未切号
      expect(await screen.findByTestId("account-switch-confirm")).toBeTruthy();
      expect(
        screen.getByText("AI 编导正在生成回复"),
      ).toBeInTheDocument();
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a");
      // 取消 → 留在当前号
      await user.click(screen.getByTestId("account-switch-cancel"));
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a");
    } finally {
      end();
    }
  });

  it("前台操作进行中 → 确认「仍要切换」后才真切号", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
    );
    const end = beginForegroundActivity("表单提交中");
    try {
      await user.click(screen.getByTestId("account-switcher-trigger"));
      const items = await screen.findAllByTestId("account-switcher-item");
      await user.click(
        items.find((el) => el.getAttribute("data-account-id") === "b")!,
      );
      await user.click(
        await screen.findByTestId("account-switch-confirm-action"),
      );
      await waitFor(() =>
        expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("b"),
      );
      expect(mockRouter.refresh).toHaveBeenCalled();
    } finally {
      end();
    }
  });

  it("无前台操作 → 直切,不弹确认(SPEC §6.1 默认直切)", async () => {
    const user = userEvent.setup();
    listAccounts.mockResolvedValue([row("a"), row("b")]);
    render(<AccountSwitcher collapsed={false} />);
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("a"),
    );
    await user.click(screen.getByTestId("account-switcher-trigger"));
    const items = await screen.findAllByTestId("account-switcher-item");
    await user.click(
      items.find((el) => el.getAttribute("data-account-id") === "b")!,
    );
    await waitFor(() =>
      expect(window.localStorage.getItem(CURRENT_ACCOUNT_KEY)).toBe("b"),
    );
    expect(screen.queryByTestId("account-switch-confirm")).toBeNull();
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
