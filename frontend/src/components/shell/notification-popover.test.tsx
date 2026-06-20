/**
 * Behavior tests for the TopHeader NotificationPopover (Increment 4 /
 * COMP-006, page R1-5).
 *
 *  - the bell trigger carries the accessible "通知" name,
 *  - an unread-count badge is rendered when there are unread items,
 *  - clicking the bell opens a popover listing the notifications,
 *  - "全部标记为已读" clears the unread badge.
 *
 * Determinism: the ViewModel is injected so the assertions don't depend
 * on the canonical fixture drifting.
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { NotificationPopover } from "./notification-popover";
import {
  buildNotificationsViewModel,
  type NotificationsViewModel,
} from "@/fixtures/selectors";

afterEach(() => cleanup());

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
  ],
  unreadCount: 1,
};

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
    expect(badge.textContent).toBe("1");
  });

  it("opens a popover listing the notifications when the bell is clicked", async () => {
    const user = userEvent.setup();
    render(<NotificationPopover viewModel={VM} />);
    await user.click(screen.getByRole("button", { name: "通知" }));

    const list = await screen.findByRole("list", { name: "通知列表" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("脚本大纲即将到期");
    // The unread item is flagged for styling.
    expect(
      list.querySelector('[data-notification-id="n-1"]'),
    ).toHaveAttribute("data-unread", "true");
  });

  it("clears the unread badge after 全部标记为已读", async () => {
    const user = userEvent.setup();
    render(<NotificationPopover viewModel={VM} />);
    await user.click(screen.getByRole("button", { name: "通知" }));
    await user.click(await screen.findByText("全部标记为已读"));
    expect(
      document.querySelector('[data-slot="notification-unread-badge"]'),
    ).toBeNull();
  });

  it("derives a non-negative unread count from the canonical selector", () => {
    const vm = buildNotificationsViewModel();
    expect(vm.unreadCount).toBeGreaterThanOrEqual(0);
    expect(vm.unreadCount).toBe(vm.items.filter((i) => !i.read).length);
  });
});
