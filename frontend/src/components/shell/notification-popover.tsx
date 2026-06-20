"use client";

/**
 * NotificationPopover (Increment 4 / COMP-006, page R1-5).
 *
 * The TopHeader bell becomes a real popover trigger: it lists the
 * canonical notifications (newest first) and surfaces an unread-count
 * badge on the bell. Built on the shared `ui/popover` (base-ui) and the
 * shared `ui/badge` — no new dependencies.
 *
 * Determinism: notifications come from `buildNotificationsViewModel`,
 * which reads the canonical dataset with no `Date.now` / `Math.random` /
 * network. The popover is a controlled-by-the-primitive island; the only
 * local state is the open flag (owned by base-ui) and a "mark read" set
 * so the unread badge can clear on interaction.
 */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { creatorIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  buildNotificationsViewModel,
  type NotificationsViewModel,
} from "@/fixtures/selectors";

const BellIcon = creatorIcons.notifications;

export interface NotificationPopoverProps {
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: NotificationsViewModel;
  /** Visual style of the trigger to match the host header variant. */
  readonly triggerClassName?: string;
}

export function NotificationPopover({
  viewModel,
  triggerClassName,
}: NotificationPopoverProps) {
  const vm = viewModel ?? buildNotificationsViewModel();
  // Locally track which notifications the user has dismissed/read so the
  // unread badge can clear when the popover is opened.
  const [readIds, setReadIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const unreadCount = vm.items.filter(
    (item) => !item.read && !readIds.has(item.id),
  ).length;

  const markAllRead = React.useCallback(() => {
    setReadIds(new Set(vm.items.map((item) => item.id)));
  }, [vm.items]);

  return (
    <Popover>
      <PopoverTrigger
        data-slot="notification-trigger"
        aria-label="通知"
        className={cn(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium transition-all outline-none select-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          triggerClassName,
        )}
      >
        <BellIcon className="size-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <Badge
            data-slot="notification-unread-badge"
            variant="destructive"
            aria-label={`${unreadCount} 条未读通知`}
            className="absolute -right-1 -top-1 size-4 min-w-4 rounded-full p-0 text-[10px] leading-none tabular-nums"
          >
            {unreadCount}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        data-slot="notification-popover"
        align="end"
        className="w-80"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">通知</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              data-slot="notification-mark-read"
              onClick={markAllRead}
              className="text-xs font-medium text-brand hover:underline focus:outline-none"
            >
              全部标记为已读
            </button>
          ) : null}
        </div>
        {vm.items.length === 0 ? (
          <p
            data-slot="notification-empty"
            className="py-4 text-center text-xs text-muted-foreground"
          >
            暂无通知
          </p>
        ) : (
          <ul
            data-slot="notification-list"
            aria-label="通知列表"
            className="flex flex-col gap-1.5"
          >
            {vm.items.map((item) => {
              const isUnread = !item.read && !readIds.has(item.id);
              return (
                <li
                  key={item.id}
                  data-slot="notification-item"
                  data-notification-id={item.id}
                  data-unread={isUnread ? "true" : "false"}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-md border border-border/70 px-2.5 py-1.5",
                    isUnread ? "bg-brand-soft/40" : "bg-surface",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {isUnread ? (
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-brand"
                      />
                    ) : null}
                    <span className="truncate text-xs font-medium text-foreground">
                      {item.title}
                    </span>
                  </div>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {item.body}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default NotificationPopover;
