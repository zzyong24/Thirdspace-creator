"use client";

/**
 * NotificationPopover (Increment 4 / COMP-006, page R1-5; Module 01 G1-G3).
 *
 * The TopHeader bell is a real popover trigger: it lists the signed-in user's
 * notifications (newest first) and surfaces a real unread-count badge.
 *
 *  - G1 (server read): the `viewModel` prop is the REAL `GET /notifications`
 *    result, built server-side in the (creator) layout via the server contract
 *    client and threaded down through the Shell. The `viewModel?` test seam is
 *    preserved; only when omitted does it fall back to the deterministic
 *    canonical selector (keeps Storybook/static renders working).
 *  - G2 (全部标记为已读): there is NO bulk endpoint (roadmap §428), so the handler
 *    issues N per-id `client.markNotificationRead` calls — one per currently
 *    UNREAD item — awaits `Promise.all`, then `router.refresh()` so the server
 *    re-reads (G1) and the badge clears from real state. An optimistic local
 *    `readIds` set clears the badge instantly; truth comes from the refresh.
 *  - G3 (list item): each `<li>` is intentionally DECORATIVE (no per-item
 *    handler / deep-link) — see the comment on the item below.
 *
 * Mutations flow island -> client.markNotificationRead -> router.refresh().
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { client } from "@/lib/contract-client";
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
  const router = useRouter();
  // Optimistic local set: which notifications the user has marked read this
  // session, so the unread badge clears instantly. Server truth arrives via the
  // post-mutation router.refresh() (re-reads G1).
  const [readIds, setReadIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pending, setPending] = React.useState(false);

  const unreadItems = vm.items.filter(
    (item) => !item.read && !readIds.has(item.id),
  );
  const unreadCount = unreadItems.length;

  const markAllRead = React.useCallback(() => {
    if (pending || unreadItems.length === 0) return;
    const ids = unreadItems.map((item) => item.id);
    // Optimistically clear the badge before the round-trip.
    setReadIds((prev) => new Set([...prev, ...ids]));
    setPending(true);
    // No bulk endpoint (roadmap §428): N per-id reads, then revalidate so the
    // server re-read (G1) is the source of truth.
    void Promise.all(
      ids.map((id) =>
        client.markNotificationRead({ params: { notificationId: id } }),
      ),
    )
      .then(() => {
        router.refresh();
      })
      .finally(() => {
        setPending(false);
      });
  }, [pending, router, unreadItems]);

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
              disabled={pending}
              className="text-xs font-medium text-brand hover:underline focus:outline-none disabled:opacity-50"
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
              // G3 (decorative): the list item is intentionally INERT — no
              // per-item onClick / deep-link (roadmap §4 line 351). A future
              // per-item read would reuse `notifications.read`, but it is out of
              // scope for Wave 1. Do NOT add a handler here.
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
