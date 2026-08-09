/**
 * PageScrollArea is the single scrollable region inside the AppShell main
 * frame. The Sidebar and the TopHeader are pinned; only the page content
 * scrolls. This is a Server Component — there is no interactive state.
 *
 * It deliberately wraps the shared `ScrollArea` primitive so page content
 * can opt into a custom scrollbar in the future without changing layout.
 */

import * as React from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const PageScrollArea = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof ScrollArea>
>(function PageScrollArea({ className, children, ...rest }, ref) {
  return (
    <ScrollArea
      ref={ref}
      data-slot="page-scroll-area"
      data-testid="page-scroll-area"
      className={cn(
        // Radix Viewport 才持有真实内容和滚动位置；Root 只负责 flex 尺寸与裁剪。
        // 两层同时声明纵向滚动会让桌面 WebKit 的滚轮命中不稳定。
        "min-h-0 flex-1 overflow-hidden bg-canvas",
        className,
      )}
      {...rest}
    >
      {children}
    </ScrollArea>
  );
});
