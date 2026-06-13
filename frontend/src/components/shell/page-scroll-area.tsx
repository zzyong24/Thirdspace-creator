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
  React.ComponentProps<"div">
>(function PageScrollArea({ className, children, ...rest }, ref) {
  return (
    <ScrollArea
      ref={ref}
      data-slot="page-scroll-area"
      data-testid="page-scroll-area"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto bg-canvas",
        className,
      )}
      {...rest}
    >
      {children}
    </ScrollArea>
  );
});
