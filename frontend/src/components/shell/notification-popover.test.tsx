/**
 * Behavior tests for the TopHeader NotificationPopover (Increment 4 /
 * COMP-006, page R1-5; Module 01 Notifications G2/G4).
 *
 *  - the bell trigger carries the accessible "通知" name,
 *  - an unread-count badge is rendered when there are unread items,
 *  - clicking the bell opens a popover listing the notifications,
 *  - "全部标记为已读" issues one `markNotificationRead` per UNREAD id (no bulk
 *    endpoint exists) and then triggers `router.refresh()` so the server
 *    re-reads (G1) and the badge clears from real state.
 *
 * Determinism: the ViewModel is injected so the assertions don't depend on the
 * canonical fixture drifting. The browser contract client + router are mocked
 * (mutations flow island -> client.markNotificationRead -> router.refresh()).
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const markNotificationRead = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ input }),
);

vi.mock("@/lib/contract-client", () => ({
  client: {
    markNotificationRead: (input: unknown) => markNotificationRead(input),
  },
}));

import { NotificationPopover } from "./notification-popover";
import {
  buildNotificationsViewModel,
  type NotificationsViewModel,
} from "@/fixtures/selectors";

const VM: NotificationsViewModel = {
  items: [
    {
      id: "n-1",
      title: "脚本大纲即将到期",
      body: "还有 1 天到期。",
      type: "task",
      read: false,
      createdAt: "2026-06-19T10:00:00+08:00",
    },
    {
      id: "n-2",
      title: "数据已采集",
      body: "本期数据已回传。",
      type: "publish",
      read: true,
      createdAt: "2026-06-12T10:30:00+08:00",
    },
    {
      id: "n-3",
      title: "导入完成",
      body: "素材已入库。",
      type: "import",
      read: false,
      createdAt: "2026-06-18T10:00:00+08:00",
    },
  ],
  unreadCount: 2,
};

beforeEach(() => {
  mockRouter.refresh.mockClear();
  // 复位实现(mockClear 只清调用记录):防某用例的 mockImplementation 泄漏到后续用例。
  markNotificationRead.mockReset();
  markNotificationRead.mockImplementation(
    (input: unknown): Promise<unknown> => Promise.resolve({ input }),
  );
});

afterEach(() => cleanup());

describe("NotificationPopover", () => {
  it("renders the bell trigger with the accessible 通知 name", () => {
    render(<NotificationPopover viewModel={VM} />);
    expect(screen.getByRole("button", { name: "通知" })).toBeInTheDocument();
  });

  it("shows an unread-count badge reflecting the unread items", () => {
    render(<NotificationPopover viewModel={VM} />);
    const badge = document.querySelector(
      '[data-slot="notification-unread-badge"]',
    ) as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("2");
  });

  it("opens a popover listing the notifications when the bell is clicked", async () => {
    const user = userEvent.setup();
    render(<NotificationPopover viewModel={VM} />);
    await user.click(screen.getByRole("button", { name: "通知" }));

    const list = await screen.findByRole("list", { name: "通知列表" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // The unread item is flagged for styling.
    expect(
      list.querySelector('[data-notification-id="n-1"]'),
    ).toHaveAttribute("data-unread", "true");
  });

  it("issues one markNotificationRead per unread id then refreshes the router", async () => {
    const user = userEvent.setup();
    render(<NotificationPopover viewModel={VM} />);
    await user.click(screen.getByRole("button", { name: "通知" }));
    await user.click(await screen.findByText("全部标记为已读"));

    // Two unread ids (n-1, n-3) → two calls; the read n-2 is NOT marked.
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2));
    const markedIds = markNotificationRead.mock.calls.map(
      ([input]) => (input as { params: { notificationId: string } }).params.notificationId,
    );
    expect(new Set(markedIds)).toEqual(new Set(["n-1", "n-3"]));
    expect(markedIds).not.toContain("n-2");

    // After awaiting all marks, the server re-read is triggered.
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  // [FE-M05] allSettled + 失败回滚:一条失败不能连累其余,也不能把失败项悄悄留在「已读」
  //  (那样 badge 显示的未读数比真实少)。失败项回滚未读态;成功项照常并 router.refresh()。
  it("部分标记失败时回滚失败项的未读态(badge 恢复真实未读),成功项仍触发 refresh", async () => {
    const user = userEvent.setup();
    // n-1 标记失败,n-3 成功。
    markNotificationRead.mockImplementation((input: unknown) => {
      const id = (input as { params: { notificationId: string } }).params
        .notificationId;
      return id === "n-1"
        ? Promise.reject(new Error("mark failed"))
        : Promise.resolve({ ok: true });
    });
    render(<NotificationPopover viewModel={VM} />);
    await user.click(screen.getByRole("button", { name: "通知" }));
    await user.click(await screen.findByText("全部标记为已读"));

    // 两个未读都被尝试标记。
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2));
    // 失败的 n-1 回滚 → badge 恢复为 1(而不是被乐观清成 0)。
    await waitFor(() => {
      const badge = document.querySelector(
        '[data-slot="notification-unread-badge"]',
      );
      expect(badge?.textContent).toBe("1");
    });
    // 成功项的真值仍要回流(refresh 照常触发)。
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("optimistically clears the unread badge after 全部标记为已读", async () => {
    const user = userEvent.setup();
    render(<NotificationPopover viewModel={VM} />);
    await user.click(screen.getByRole("button", { name: "通知" }));
    await user.click(await screen.findByText("全部标记为已读"));
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="notification-unread-badge"]'),
      ).toBeNull(),
    );
  });

  it("derives a non-negative unread count from the canonical selector", () => {
    const vm = buildNotificationsViewModel();
    expect(vm.unreadCount).toBeGreaterThanOrEqual(0);
    expect(vm.unreadCount).toBe(vm.items.filter((i) => !i.read).length);
  });
});
