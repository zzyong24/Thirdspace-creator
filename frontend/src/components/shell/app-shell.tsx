"use client";

/**
 * AppShell is the single shared application frame for every CreatorOS page
 * (SPEC §4.1, D-004, D-005).
 *
 * It composes:
 *  - one `Sidebar` on the left,
 *  - a `MainFrame` on the right containing a `TopHeader` and a
 *    `PageScrollArea` that hosts the route outlet.
 *
 * The component runs in the client because it is composed from the
 * `(creator)/shell-router` route group which needs `usePathname()` to
 * resolve the active nav, header mode and contextual-card variant. Active
 * state, header mode and sidebar context are passed in as props so the
 * shell itself remains a pure function of its inputs and is testable
 * without a router runtime.
 */

import * as React from "react";
import {SettingsReturnProvider} from "./settings-return-context";

import {
  PageScrollArea,
} from "./page-scroll-area";
import {
  Sidebar,
  type SidebarContextSection,
  type SidebarContextualCardVariant,
  type SidebarUser,
} from "./sidebar";
import {
  TopHeader,
  type TopHeaderMode,
  type TopHeaderProjectIdentity,
  type TopHeaderStage,
} from "./top-header";
import { cn } from "@/lib/utils";
import type { NotificationsViewModel } from "@/fixtures/selectors";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AppShellProps {
  readonly pathname: string;
  readonly user?: SidebarUser;
  // G1: the server-read Shell notifications, forwarded to the TopHeader bell.
  readonly notifications?: NotificationsViewModel;
  readonly headerMode?: TopHeaderMode;
  readonly pageTitle?: string;
  readonly pageDescription?: string;
  readonly contextualCardVariant?: SidebarContextualCardVariant;
  readonly sidebarContext?: SidebarContextSection;
  readonly project?: TopHeaderProjectIdentity;
  readonly projectStages?: ReadonlyArray<TopHeaderStage>;
  readonly primaryActionLabel?: string;
  // [T-209] secondaryActionLabel(假「分享」)已随按钮移除。
  readonly searchPlaceholder?: string;
  readonly searchValue?: string;
  readonly overlayMasked?: boolean;
  /** 固定高度工作台只切换滚动和尺寸样式，保持页面子树及未保存会话。 */
  readonly contentFill?: boolean;
  readonly children: React.ReactNode;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppShell({
  pathname,
  user,
  notifications,
  headerMode = "global",
  pageTitle,
  pageDescription,
  contextualCardVariant = "assistant",
  sidebarContext,
  project,
  projectStages,
  primaryActionLabel,
  searchPlaceholder,
  searchValue,
  overlayMasked = false,
  contentFill = false,
  children,
  className,
}: AppShellProps) {
  const newProjectReturn = React.useRef<{node:HTMLAnchorElement;path:string;index:number}|null>(null);
  const previousPath = React.useRef(pathname);
  React.useEffect(()=>{
    if(previousPath.current === "/projects/new" && pathname === newProjectReturn.current?.path){
      const saved=newProjectReturn.current;
      const target=saved.node.isConnected?saved.node:Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/projects/new"]'))[saved.index];
      target?.focus();newProjectReturn.current=null;
    }
    previousPath.current=pathname;
  },[pathname]);
  return (
    <SettingsReturnProvider><div
      onClickCapture={event=>{
        const target=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href="/projects/new"]'):null;
        if(target && event.button===0) newProjectReturn.current={node:target,path:pathname,index:Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/projects/new"]')).indexOf(target)};
      }}
      data-slot="app-shell"
      data-testid="app-shell"
      data-masked={overlayMasked ? "true" : "false"}
      className={cn(
        // 固定整窗高度 + 隐藏外层溢出 → 只让内部 PageScrollArea 滚动(框内滚动,
        // 而非整页滚动)。Sidebar / TopHeader 因此被钉死。
        "relative flex h-screen w-full overflow-hidden bg-canvas text-foreground",
        className,
      )}
    >
      <Sidebar
        pathname={pathname}
        user={user}
        contextualCardVariant={contextualCardVariant}
        contextSection={sidebarContext}
      />
      <div
        data-slot="app-main-frame"
        // h-full + min-h-0 → 主框占满固定高度并允许子级(PageScrollArea)以 flex-1
        // 撑出可滚区域;TopHeader 自然高度被钉在顶部。
        className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
      >
        <TopHeader
          mode={headerMode}
          pathname={pathname}
          notifications={notifications}
          pageTitle={pageTitle}
          pageDescription={pageDescription}
          project={project}
          projectStages={projectStages}
          primaryActionLabel={primaryActionLabel}
          searchPlaceholder={searchPlaceholder}
          searchValue={searchValue}
          overlayMasked={overlayMasked}
        />
        <PageScrollArea
          data-fill={contentFill ? "true" : "false"}
          className={cn(contentFill && [
            // 仅限制外层 viewport，页面各栏的内部滚动保持原行为。
            "[&>[data-slot=scroll-area-viewport]]:!overflow-hidden",
            "[&>[data-slot=scroll-area-viewport]>div]:h-full",
            "[&>[data-slot=scroll-area-viewport]>div]:min-h-0",
            "[&>[data-slot=scroll-area-scrollbar]]:hidden",
          ])}
        >
          <div
            data-slot="app-page-content"
            data-fill={contentFill ? "true" : "false"}
            className={cn(
              "w-full min-w-0 px-page-gutter",
              contentFill
                ? "flex h-full min-h-0 flex-col overflow-hidden py-6"
                : headerMode === "global" ? "py-8" : "py-section-gap",
            )}
          >
            {children}
          </div>
        </PageScrollArea>
      </div>
    </div></SettingsReturnProvider>
  );
}

export {
  Sidebar,
  TopHeader,
  PageScrollArea,
  type SidebarContextSection,
  type SidebarContextualCardVariant,
  type SidebarUser,
  type TopHeaderMode,
  type TopHeaderProjectIdentity,
};
