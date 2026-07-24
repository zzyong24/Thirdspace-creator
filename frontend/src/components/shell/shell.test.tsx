/**
 * Contract tests for the shared AppShell.
 *
 * These tests lock the AppShell invariants:
 *  - exactly one Sidebar and one TopHeader per page,
 *  - the primary nav lists all seven approved entries,
 *  - the active nav item is derived from the current pathname,
 *  - the lower contextual card supports both `assistant` and `storage`
 *    variants on a single component (D-003),
 *  - the TopHeader supports all five approved modes (D-005).
 *
 * The component under test is exported from `./app-shell`. Tests run with
 * the shared Vitest setup which cleans up the DOM between runs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";

import "@/styles/tokens.css";

// [T-115] The sidebar `storage` card (SidebarStorageCard) now client-fetches the
// REAL `settings.storage.get` on mount instead of showing hardcoded 12.4/50GB.
// jsdom has no HTTP backend, so mock the client transport: a mutable resolver
// lets a test drive the real-value path OR the failure (诚实降级) path.
const storageMock = vi.hoisted(() => ({
  getStorage: vi.fn(async () => ({
    backend: "local",
    rootPath: "~/CreatorOS/media",
    // 用户实录真值:已用 ~0.1 GB / 磁盘容量 ~494.4 GB。
    usedBytes: 107_374_182,
    totalBytes: 530_842_000_000,
    breakdown: [],
  })),
}));
vi.mock("@/lib/contract-client", () => ({ client: storageMock }));

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

  it("renders the approved primary nav items in order (定位中心 inserted as 2nd, 七步①②)", async () => {
    await renderShell();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const items = within(nav).getAllByRole("link");
    const labels = items.map((item) => item.textContent?.trim() ?? "");
    // SPEC §3.4: 定位中心 is the upstream constraint source — pinned 2nd. 选题 sits right
    // under it (定位→选题→项目 upstream order: 定位约束选题, 选题落地为项目).
    expect(labels).toEqual([
      "首页",
      "定位中心",
      "内容雷达",
      "选题",
      "项目",
      "知识库",
      "素材中心",
      "发布中心",
      "自动化",
      "设置",
    ]);
  });

  it("derives the active nav item from the pathname", async () => {
    await renderShell({ pathname: "/knowledge" });
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/knowledge");
    expect(active.textContent?.trim()).toBe("知识库");
  });

  it("falls back to the dashboard nav item for the root pathname", async () => {
    await renderShell({ pathname: "/" });
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/");
    expect(active.textContent?.trim()).toBe("首页");
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

  // [T-115] The storage card接真实源:挂载后拉 settings.storage.get,显真实
  // usedBytes / totalBytes(真实磁盘容量)。旧硬编码 12.4/50GB · 固定 25% · 自动同步
  // 全删,读失败诚实降级为「存储用量不可用」——绝不回退假值。
  it("[T-115] storage card shows REAL used/total (not the old 12.4/50GB fake) after mount", async () => {
    storageMock.getStorage.mockResolvedValueOnce({
      backend: "local",
      rootPath: "~/CreatorOS/media",
      usedBytes: 107_374_182, // ~0.1 GB
      totalBytes: 530_842_000_000, // ~494.4 GB 真实磁盘容量
      breakdown: [],
    });
    const { container } = await renderShell({
      pathname: "/assets",
      contextualCardVariant: "storage",
    });
    const card = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    ) as HTMLElement;
    // [T-360①] 自适应单位后 badge 显 "107.4 MB / 530.8 GB"(<1GB 显 MB,不再抹成 0.1 GB)。
    await waitFor(() => {
      expect(card.textContent).toContain("107.4 MB / 530.8 GB");
    });
    // 旧假串必须消失。
    expect(card.textContent).not.toContain("12.4 / 50 GB");
    expect(card.textContent).not.toContain("自动同步已开启");
    expect(card.getAttribute("data-storage-state")).toBe("ready");
    // 进度条 aria-valuenow 是真实百分比(≈0),不再是固定 25。
    const bar = card.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).not.toBe("25");
  });

  it("[T-115] storage card degrades honestly (存储用量不可用) when getStorage fails — no fake fallback", async () => {
    storageMock.getStorage.mockRejectedValueOnce(new Error("no backend"));
    const { container } = await renderShell({
      pathname: "/assets",
      contextualCardVariant: "storage",
    });
    const card = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    ) as HTMLElement;
    await waitFor(() => {
      expect(card.getAttribute("data-storage-state")).toBe("error");
    });
    expect(card.textContent).toContain("存储用量不可用");
    // 绝不回退假值。
    expect(card.textContent).not.toContain("12.4 / 50 GB");
    expect(card.textContent).not.toContain("50 GB");
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

  it("sidebar renders 7 nav items, active one carries aria-current=page", async () => {
    await renderShell({ pathname: "/projects" });
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    const links = within(sidebar).getAllByRole("link");
    // 7 nav items (no extra context section for the root).
    expect(links.length).toBeGreaterThanOrEqual(7);
    const current = within(sidebar).getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/projects");
  });

  // [FE-M03] 路由→导航项映射补全:`/calendar` 高亮「发布中心」(内容日历是发布中心子面);
  // `/accounts`、`/search` 无对应导航项 → 不再错误高亮「首页」,不选中任何项。
  it("[FE-M03] /calendar highlights 发布中心 (calendar is a sub-surface of publishing)", async () => {
    await renderShell({ pathname: "/calendar" });
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    const current = within(sidebar).getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/publishing");
    expect(current.textContent?.trim()).toBe("发布中心");
  });

  it("[FE-M03] /accounts highlights NO nav item (no wrong 首页 highlight)", async () => {
    await renderShell({ pathname: "/accounts" });
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    expect(
      within(sidebar).queryByRole("link", { current: "page" }),
    ).toBeNull();
  });

  it("[FE-M03] /search highlights NO nav item", async () => {
    await renderShell({ pathname: "/search" });
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    expect(
      within(sidebar).queryByRole("link", { current: "page" }),
    ).toBeNull();
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

// ---------------------------------------------------------------------------
// [T-129] Sidebar 折叠(展开 ↔ 收拢窄条,状态持久化 localStorage)
// ---------------------------------------------------------------------------

describe("Sidebar 折叠 (T-129)", () => {
  afterEach(() => {
    cleanup();
    try {
      window.localStorage.clear();
    } catch {
      /* noop */
    }
  });

  it("默认展开:data-collapsed=false + 折叠开关标签「收起侧栏」+ nav 文字可见", async () => {
    await renderShell();
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    expect(sidebar.getAttribute("data-collapsed")).toBe("false");
    const toggle = within(sidebar).getByTestId("sidebar-collapse-toggle");
    expect(toggle).toHaveAttribute("aria-label", "收起侧栏");
    // 展开态 nav 文字可见(accessible name 来自可见文字)。
    expect(
      within(sidebar).getByRole("link", { name: "知识库" }),
    ).toBeInTheDocument();
  });

  it("点折叠开关 → 收拢(data-collapsed=true,w-16 窄条,nav icon-only)+ 持久化 localStorage=1", async () => {
    await renderShell();
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    fireEvent.click(within(sidebar).getByTestId("sidebar-collapse-toggle"));
    await waitFor(() => {
      expect(sidebar.getAttribute("data-collapsed")).toBe("true");
    });
    // 开关切换为「展开侧栏」;窄条宽度 class;nav 仍可达(aria-label 兜底)但可见文字 span 隐藏。
    expect(
      within(sidebar).getByTestId("sidebar-collapse-toggle"),
    ).toHaveAttribute("aria-label", "展开侧栏");
    expect(sidebar.className).toContain("w-16");
    const knowledge = within(sidebar).getByRole("link", { name: "知识库" });
    expect(knowledge.querySelector("span")).toBeNull();
    expect(window.localStorage.getItem("creatoros:sidebar:collapsed")).toBe("1");
  });

  it("localStorage 记为收拢 → 挂载后读回,初次渲染即收拢窄条", async () => {
    window.localStorage.setItem("creatoros:sidebar:collapsed", "1");
    await renderShell();
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    await waitFor(() => {
      expect(sidebar.getAttribute("data-collapsed")).toBe("true");
    });
    expect(sidebar.className).toContain("w-16");
  });

  it("收拢后再点 → 展开回来 + localStorage 置 0", async () => {
    window.localStorage.setItem("creatoros:sidebar:collapsed", "1");
    await renderShell();
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    await waitFor(() =>
      expect(sidebar.getAttribute("data-collapsed")).toBe("true"),
    );
    fireEvent.click(within(sidebar).getByTestId("sidebar-collapse-toggle"));
    await waitFor(() =>
      expect(sidebar.getAttribute("data-collapsed")).toBe("false"),
    );
    expect(window.localStorage.getItem("creatoros:sidebar:collapsed")).toBe("0");
  });
});
