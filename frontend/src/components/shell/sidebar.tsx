/**
 * Sidebar is the pinned left rail shared by every CreatorOS page.
 *
 * Structure (D-002, D-003, D-004, D-005):
 *  - Brand
 *  - PrimaryNav (seven approved items in fixed order)
 *  - ContextSection (current project / quick access, when present)
 *  - AssistantPromoCard with two content variants: `assistant` (default)
 *    and `storage` (used by the Assets Center per D-003)
 *  - UserProfileMenu
 *
 * The component is rendered as a Server Component. Active state is derived
 * from the `pathname` prop, not from a router hook, so it is testable
 * without a Next.js runtime.
 */

import * as React from "react";
import Link from "next/link";
import { Sparkles, type LucideIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { creatorIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { canonicalDataset } from "@/fixtures/canonical";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type SidebarContextualCardVariant = "assistant" | "storage";

export interface SidebarContextSection {
  readonly heading: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly href: string;
    readonly indicator?: "unread" | "active" | "default";
  }>;
}

export interface SidebarUser {
  readonly displayName: string;
  readonly email: string;
  readonly planLabel: string;
  readonly initials: string;
}

export interface SidebarProps {
  readonly pathname: string;
  readonly contextualCardVariant?: SidebarContextualCardVariant;
  readonly contextSection?: SidebarContextSection;
  readonly user?: SidebarUser;
  readonly className?: string;
}

interface NavEntry {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly match: (pathname: string) => boolean;
}

const PRIMARY_NAV: ReadonlyArray<NavEntry> = [
  { id: "dashboard", label: "首页", href: "/", icon: creatorIcons.dashboard, match: matchExact("/") },
  // 定位中心 — the upstream constraint source (七步①②, SPEC §3.4): 排在「项目」前.
  { id: "positioning", label: "定位中心", href: "/positioning", icon: creatorIcons.positioning, match: matchExact("/positioning") },
  { id: "projects", label: "项目", href: "/projects", icon: creatorIcons.projects, match: matchPrefix("/projects") },
  { id: "knowledge", label: "知识库", href: "/knowledge", icon: creatorIcons.knowledge, match: matchExact("/knowledge") },
  { id: "assets", label: "素材中心", href: "/assets", icon: creatorIcons.assets, match: matchExact("/assets") },
  { id: "publishing", label: "发布中心", href: "/publishing", icon: creatorIcons.publishing, match: matchExact("/publishing") },
  // 变现/漏斗中心 — 七步⑦, SPEC §4.7.
  { id: "monetization", label: "变现中心", href: "/monetization", icon: creatorIcons.monetization, match: matchExact("/monetization") },
  { id: "experience", label: "经验沉淀", href: "/experience", icon: creatorIcons.experience, match: matchExact("/experience") },
  { id: "settings", label: "设置", href: "/settings", icon: creatorIcons.settings, match: matchExact("/settings") },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchExact(target: string) {
  return (pathname: string) => pathname === target;
}

function matchPrefix(prefix: string) {
  return (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function findActiveNav(pathname: string): string {
  return PRIMARY_NAV.find((entry) => entry.match(pathname))?.id ?? "dashboard";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]?.slice(0, 1) ?? "?";
  return `${parts[0]?.charAt(0) ?? ""}${parts[parts.length - 1]?.charAt(0) ?? ""}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function Sidebar({
  pathname,
  contextualCardVariant = "assistant",
  contextSection,
  user,
  className,
}: SidebarProps) {
  const activeNavId = findActiveNav(pathname);
  const resolvedUser = resolveUser(user);
  return (
    <aside
      data-slot="app-sidebar"
      data-testid="app-sidebar"
      aria-label="主侧栏"
      className={cn(
        "flex h-screen w-sidebar shrink-0 flex-col gap-4 border-r border-border bg-surface px-4 pb-8 pt-6",
        className,
      )}
    >
      <SidebarBrand />
      <PrimaryNav activeId={activeNavId} />
      {contextSection ? <ContextSection section={contextSection} /> : null}
      <div className="mt-auto flex flex-col gap-card-gap">
        <SidebarContextualCard
          variant={contextualCardVariant}
          userDisplayName={resolvedUser.displayName}
        />
        <UserProfileMenu
          displayName={resolvedUser.displayName}
          email={resolvedUser.email}
          planLabel={resolvedUser.planLabel}
          initials={resolvedUser.initials}
        />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

function SidebarBrand() {
  // The brand is a visual anchor, not a focusable link — the home route
  // is reachable through the primary nav. Keeping the brand out of the
  // focus order ensures the first Tab lands inside the TopHeader.
  return (
    <div
      data-slot="sidebar-brand"
      aria-hidden="true"
      className="mb-7 flex items-center gap-2 px-2 py-1 text-[15px] font-semibold text-foreground"
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-brand text-primary-foreground">
        <Sparkles className="size-4" />
      </span>
      <span>CreatorOS</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primary nav
// ---------------------------------------------------------------------------

function PrimaryNav({ activeId }: { activeId: string }) {
  return (
    <nav
      data-slot="sidebar-primary-nav"
      aria-label="主要导航"
      className="flex flex-col gap-1"
    >
      {PRIMARY_NAV.map((entry) => {
        const Icon = entry.icon;
        const isActive = entry.id === activeId;
        return (
          <Link
            key={entry.id}
            href={entry.href}
            data-slot="sidebar-nav-item"
            data-active={isActive ? "true" : "false"}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive && "bg-brand-soft font-medium text-brand",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{entry.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Context section
// ---------------------------------------------------------------------------

function ContextSection({ section }: { section: SidebarContextSection }) {
  return (
    <section
      data-slot="sidebar-context-section"
      aria-label={section.heading}
      className="flex flex-col gap-1"
    >
      <h2 className="px-2.5 text-xs font-medium uppercase tracking-wide text-text-subtle">
        {section.heading}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {section.items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              data-slot="sidebar-context-item"
              data-indicator={item.indicator ?? "default"}
              className={cn(
                "flex h-8 items-center justify-between rounded-control px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.indicator === "active" && "bg-muted font-medium text-foreground",
              )}
            >
              <span className="truncate">{item.label}</span>
              {item.indicator === "unread" ? (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand"
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Contextual promo card
// ---------------------------------------------------------------------------

interface SidebarContextualCardProps {
  readonly variant: SidebarContextualCardVariant;
  readonly userDisplayName: string;
}

function SidebarContextualCard({ variant, userDisplayName }: SidebarContextualCardProps) {
  if (variant === "storage") {
    return (
      <div
        data-slot="sidebar-contextual-card"
        data-variant="storage"
        className="flex flex-col gap-1 rounded-card border border-border bg-surface-subtle p-3 text-xs text-muted-foreground"
      >
        <div className="flex items-center justify-between text-foreground">
          <span className="font-medium">素材库存储</span>
          <Badge variant="outline" className="text-[10px]">
            12.4 / 50 GB
          </Badge>
        </div>
        <div
          role="progressbar"
          aria-valuenow={25}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="素材库存储使用率"
          className="h-1.5 w-full overflow-hidden rounded-full bg-border"
        >
          <div className="h-full w-1/4 bg-brand" />
        </div>
        <p>个人本地素材库 · 自动同步已开启</p>
      </div>
    );
  }
  return (
    <div
      data-slot="sidebar-contextual-card"
      data-variant="assistant"
      className="flex min-h-36 flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-xs"
    >
      <div className="flex items-center gap-2 text-foreground">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-brand"
        >
          <Sparkles className="size-3.5" />
        </span>
        <span className="font-medium">AI 助手</span>
      </div>
      <p className="text-muted-foreground">
        {`${userDisplayName}，今天想先做点什么？`}
      </p>
      <Link
        href="/?copilot=open"
        className="text-brand underline-offset-4 hover:underline"
      >
        打开 AI 助手
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User profile menu
// ---------------------------------------------------------------------------

function UserProfileMenu({
  displayName,
  email,
  planLabel,
  initials,
}: {
  displayName: string;
  email: string;
  planLabel: string;
  initials: string;
}) {
  return (
    <div
      data-slot="sidebar-user-profile"
      className="flex items-center gap-2 rounded-card border border-border bg-surface p-2.5"
    >
      <Avatar size="sm">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {displayName}
        </span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        {planLabel}
      </Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function resolveUser(overrides: SidebarProps["user"]) {
  if (overrides) return overrides;
  const user = canonicalDataset.user;
  return {
    displayName: user.displayName,
    email: user.email,
    planLabel: "个人版",
    initials: initialsFromName(user.displayName),
  };
}
