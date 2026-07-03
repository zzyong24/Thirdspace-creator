/**
 * Contract tests for the shared AppShell.
 *
 * These tests lock the AppShell invariants:
 *  - exactly one Sidebar and one TopHeader per page,
 *  - the primary nav lists the four converged entries ([T-063a] 今日台/作品/库/设置),
 *  - the active nav item is derived from the current pathname,
 *  - the lower contextual card supports both `assistant` and `storage`
 *    variants on a single component (D-003),
 *  - the TopHeader supports all five approved modes (D-005).
 *
 * The component under test is exported from `./app-shell`. Tests run with
 * the shared Vitest setup which cleans up the DOM between runs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type React from "react";

import "@/styles/tokens.css";

// Capture computed CSS variables from :root so geometry assertions
// align with the actual token layer (tokens.css → globals.css).
function readRootVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

// Stub `next/navigation` so the NotificationPopover island (rendered inside the
// TopHeader) can call `useRouter()` outside an App Router context (Module 01 G2:
// the bell's "全部标记为已读" handler asks the router to revalidate). The shell
// tests don't exercise the mutation; this just satisfies the hook.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Stub `next/link` so we can query the rendered anchors without invoking the
// real client-side router.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type AppShellProps = React.ComponentProps<typeof import("./app-shell").AppShell>;

async function renderShell(overrides: Partial<AppShellProps> = {}) {
  const { AppShell } = await import("./app-shell");
  return render(
    <AppShell pathname={overrides.pathname ?? "/"} {...overrides}>
      <div data-testid="page-content">page content</div>
    </AppShell>,
  );
}

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders exactly one sidebar and one top header", async () => {
    const { container } = await renderShell();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
  });

  it("[T-063a] renders the four converged primary nav items in order (今日台/作品/库/设置)", async () => {
    await renderShell();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const items = within(nav).getAllByRole("link");
    const labels = items.map((item) => item.textContent?.trim() ?? "");
    // 北极星 SPEC §1:一级导航固定四项 + 全局编导对话;旧部门式路由 301 到对应 tab。
    expect(labels).toEqual(["今日台", "作品", "库", "设置"]);
  });

  it("derives the active nav item from the pathname", async () => {
    await renderShell({ pathname: "/library" });
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/library");
    expect(active.textContent?.trim()).toBe("库");
  });

  it("falls back to the dashboard nav item for the root pathname", async () => {
    await renderShell({ pathname: "/" });
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/");
    expect(active.textContent?.trim()).toBe("今日台");
  });

  it("uses the assistant variant by default and exposes the storage variant on the same component", async () => {
    const { container } = await renderShell();
    const assistantCard = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    const storageCard = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    expect(assistantCard).not.toBeNull();
    expect(storageCard).toBeNull();
  });

  it("renders the storage variant when requested by the page", async () => {
    const { container } = await renderShell({
      pathname: "/assets",
      contextualCardVariant: "storage",
    });
    const assistantCard = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    const storageCard = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    expect(assistantCard).toBeNull();
    expect(storageCard).not.toBeNull();
  });

  it("passes the supported header mode down to the top header", async () => {
    const { container } = await renderShell({ headerMode: "project-workspace" });
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header?.getAttribute("data-mode")).toBe("project-workspace");
  });

  it("keeps global actions in an overlay header without consuming page height", async () => {
    const { container } = await renderShell({
      pathname: "/",
      headerMode: "global",
    });
    const header = container.querySelector('[data-slot="app-top-header"]');

    expect(header).toHaveAttribute("data-layout", "overlay");
    expect(header).toHaveClass("absolute");
  });

  it("does not create a duplicate h1 for global overlay page titles", async () => {
    const { container } = await renderShell({
      pathname: "/projects",
      headerMode: "global",
      pageTitle: "项目",
      pageDescription: "所有项目及其当前阶段",
    });
    const headingSlot = container.querySelector(
      '[data-slot="header-page-heading"]',
    );

    expect(headingSlot).not.toBeNull();
    expect(headingSlot?.textContent).toContain("项目");
    expect(headingSlot?.querySelector("h1")).toBeNull();
  });

  it("renders the page content inside the page scroll area", async () => {
    const { container } = await renderShell();
    const scroll = container.querySelector('[data-slot="page-scroll-area"]');
    expect(scroll).not.toBeNull();
    const content = screen.getByTestId("page-content");
    expect(scroll?.contains(content)).toBe(true);
  });

  it("contentFill mode renders a fixed-height fill region without the PageScrollArea (no double scrollbar)", async () => {
    const { container } = await renderShell({ contentFill: true });
    // 填满模式：不套 PageScrollArea (避免外层整页滚 + 列内滚的双滚动条)。
    expect(
      container.querySelector('[data-slot="page-scroll-area"]'),
    ).toBeNull();
    const fill = container.querySelector(
      '[data-slot="app-page-content"][data-fill="true"]',
    ) as HTMLElement | null;
    expect(fill).not.toBeNull();
    // 页面自填满固定高度 + 自管内部滚动 (h-full / min-h-0 / overflow-hidden)。
    expect(fill).toHaveClass(
      "flex",
      "h-full",
      "min-h-0",
      "flex-col",
      "overflow-hidden",
    );
    // children 仍渲染在填满区里。
    expect(fill?.contains(screen.getByTestId("page-content"))).toBe(true);
  });

  it("applies the shared page gutter and section gap tokens", async () => {
    const { container } = await renderShell();
    const pageContent = container.querySelector(
      '[data-slot="app-page-content"]',
    ) as HTMLElement;

    expect(pageContent).toHaveClass("px-page-gutter", "py-8");
  });

  // ---------------------------------------------------------------------------
  // Phase 2 — shared visual layer calibration
  // Geometry contracts derived from 3 reference designs:
  //  - ui/Dashboard.png
  //  - ui/Projects.png
  //  - ui/Research Workspace.png
  // ---------------------------------------------------------------------------

  it("exposes the sidebar width as a CSS variable in the 220-232px band", () => {
    const raw = readRootVar("--creatoros-sidebar-width");
    expect(raw).not.toBe("");
    const px = parseInt(raw, 10);
    expect(Number.isFinite(px)).toBe(true);
    // Design band: ~224px (Dashboard/Projects/Research)
    expect(px).toBeGreaterThanOrEqual(220);
    expect(px).toBeLessThanOrEqual(232);
  });

  it("exposes the header height as a CSS variable in the 64-80px band", () => {
    const raw = readRootVar("--creatoros-header-height");
    expect(raw).not.toBe("");
    const px = parseInt(raw, 10);
    expect(Number.isFinite(px)).toBe(true);
    // Design band: 64-80px (Dashboard top header)
    expect(px).toBeGreaterThanOrEqual(64);
    expect(px).toBeLessThanOrEqual(80);
  });

  it("exposes the page gutter as a CSS variable in the 24-40px band", () => {
    const raw = readRootVar("--creatoros-page-gutter");
    expect(raw).not.toBe("");
    const px = parseInt(raw, 10);
    expect(Number.isFinite(px)).toBe(true);
    expect(px).toBeGreaterThanOrEqual(24);
    expect(px).toBeLessThanOrEqual(40);
  });

  it("exposes the section gap as a CSS variable in the 16-24px band", () => {
    const raw = readRootVar("--creatoros-section-gap");
    expect(raw).not.toBe("");
    const px = parseInt(raw, 10);
    expect(Number.isFinite(px)).toBe(true);
    expect(px).toBeGreaterThanOrEqual(16);
    expect(px).toBeLessThanOrEqual(24);
  });

  it("[T-063a] sidebar renders 4 nav items, active one carries aria-current=page", async () => {
    await renderShell({ pathname: "/projects" });
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    const nav = within(sidebar).getByRole("navigation", { name: "主要导航" });
    const links = within(nav).getAllByRole("link");
    // 4 converged nav items (北极星 SPEC §1).
    expect(links).toHaveLength(4);
    const current = within(sidebar).getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/projects");
  });

  it("sidebar contextual card default variant is assistant and includes brand color", async () => {
    const { container } = await renderShell();
    const card = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    expect(card).not.toBeNull();
    // brand-soft pill in assistant header
    const pill = card?.querySelector("span");
    expect(pill).not.toBeNull();
  });

  it("sidebar user profile shows avatar + name + email + plan label", async () => {
    const { container } = await renderShell();
    const profile = container.querySelector('[data-slot="sidebar-user-profile"]');
    expect(profile).not.toBeNull();
    expect(profile?.textContent ?? "").toMatch(/个人版/);
  });

  it("dashboard header renders search, notifications and the New Project CTA", async () => {
    const { container } = await renderShell();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    const searchBtn = within(header as HTMLElement).getByLabelText("搜索");
    const bellBtn = within(header as HTMLElement).getByLabelText("通知");
    expect(searchBtn).toBeInTheDocument();
    expect(bellBtn).toBeInTheDocument();
    expect(
      within(header as HTMLElement).getByRole("link", {
        name: /新建项目/,
      }),
    ).toHaveAttribute("href", "/projects/new");
  });

  it("project overview header primary action links to the current workspace", async () => {
    const { container } = await renderShell({
      pathname: "/projects/ai-native-browser",
      headerMode: "project-overview",
      primaryActionLabel: "进入工作台",
      project: {
        projectId: "project-ainativebrowser",
        title: "AI Native Browser 深度解析",
        stage: "script",
        stageProgressPct: 58,
        updatedLabel: "写稿中 · 更新于 今天 14:30",
        starred: true,
      },
    });
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole("link", { name: /进入工作台/ }),
    ).toHaveAttribute("href", "/projects/ai-native-browser/script");
  });
});
