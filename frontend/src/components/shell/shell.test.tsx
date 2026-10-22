/**
 * Contract tests for the shared AppShell.
 *
 * These tests lock the AppShell invariants:
 *  - exactly one Sidebar and one TopHeader per page,
 *  - the primary nav lists the approved entries with real destinations,
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
import * as React from "react";

import "@/styles/tokens.css";
import "@/styles/creatoros-system.css";

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
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
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
  useLinkStatus: () => ({pending:false}),
  default: ({
    children,
    href,
    prefetch,
    onNavigate: _onNavigate,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
    onNavigate?: unknown;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

type AppShellProps = React.ComponentProps<typeof import("./app-shell").AppShell>;

const approvedNavigation = [
  ["首页", "/"],
  ["创作者总览", "/overview"],
  ["定位中心", "/positioning"],
  ["内容雷达", "/intelligence"],
  ["选题", "/topics"],
  ["项目", "/projects"],
  ["知识库", "/knowledge"],
  ["素材中心", "/assets"],
  ["创作画布", "/canvases"],
  ["发布中心", "/publishing"],
  ["运营分析", "/daily-report"],
  ["自动化", "/automations"],
  ["设置", "/settings"],
] as const;

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

  it("新项目弹层关闭回原页，焦点返回点击入口", async () => {
    const {AppShell}=await import("./app-shell");
    const view=render(<AppShell pathname="/"><div>首页正文</div></AppShell>);
    const trigger=view.container.querySelector<HTMLAnchorElement>('header a[href="/projects/new"]')!;
    trigger.focus();fireEvent.click(trigger);
    view.rerender(<AppShell pathname="/projects/new"><button>对话框关闭</button></AppShell>);
    screen.getByRole("button",{name:"对话框关闭"}).focus();
    view.rerender(<AppShell pathname="/"><div>首页正文</div></AppShell>);
    await waitFor(()=>expect(document.activeElement).toBe(view.container.querySelector('header a[href="/projects/new"]')));
  });

  it("[T-718] 激活前使用包级品牌名和品牌图标，Growth 品牌可在激活后覆盖名称", async () => {
    const { AppShell } = await import("./app-shell");
    const { SidebarBrandNameProvider } = await import("./sidebar");
    const icon = "data:image/x-icon;base64,AAECAw==";
    const view = render(
      <SidebarBrandNameProvider
        brandName={null}
        packageBrandName="智溯AI"
        packageBrandIconDataUrl={icon}
      >
        <AppShell pathname="/">
          <div>内容</div>
        </AppShell>
      </SidebarBrandNameProvider>,
    );

    const brand = view.container.querySelector('[data-slot="sidebar-brand"]');
    expect(brand).toHaveTextContent("智溯AI");
    expect(brand?.querySelector("img")).toHaveAttribute("src", icon);

    view.rerender(
      <SidebarBrandNameProvider
        brandName="Growth 已验签品牌"
        packageBrandName="智溯AI"
        packageBrandIconDataUrl={icon}
      >
        <AppShell pathname="/">
          <div>内容</div>
        </AppShell>
      </SidebarBrandNameProvider>,
    );
    expect(
      view.container.querySelector('[data-slot="sidebar-brand"]'),
    ).toHaveTextContent("Growth 已验签品牌");
  });

  it("[T-518] keeps a real issue-feedback entry available in expanded and collapsed sidebar", async () => {
    await renderShell();
    const feedback = screen.getByRole("button", { name: "帮助与反馈" });
    expect(feedback).toBeVisible();
    expect(feedback).toHaveTextContent("帮助与反馈");

    fireEvent.click(
      screen.getByRole("button", { name: "收起侧栏" }),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "帮助与反馈" })).toBeVisible();
      expect(screen.getByRole("button", { name: "帮助与反馈" })).toHaveTextContent(
        /^$/,
      );
    });
  });

  it("按现有顺序呈现全部导航名称与真实目的地，包含创作画布", async () => {
    await renderShell();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const items = within(nav).getAllByRole("link");
    // SPEC §3.4: 定位中心 is the upstream constraint source — pinned 2nd. 选题 sits right
    // under it (定位→选题→项目 upstream order: 定位约束选题, 选题落地为项目).
    expect(items.map((item) => [item.textContent?.trim(), item.getAttribute("href")]))
      .toEqual(approvedNavigation);
  });

  it("[T-987] 展开与收拢导航不预取未点击页面，仍保留真实链接", async () => {
    await renderShell();
    const assertLinks = () => {
      const links = within(screen.getByRole("navigation", { name: "主要导航" })).getAllByRole("link");
      expect(links).toHaveLength(13);
      for (const [label, href] of approvedNavigation) {
        expect(within(screen.getByRole("navigation", { name: "主要导航" }))
          .getByRole("link", { name: label })).toHaveAttribute("href", href);
      }
      for (const link of links) {
        expect(link).toHaveAttribute("data-prefetch", "false");
        expect(link.getAttribute("href")).toMatch(/^\//);
      }
    };
    assertLinks();
    fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
    assertLinks();
  });

  it("[T-912] 点击页面入口保持稳定文案，不制造“打开中”假等待态", async () => {
    await renderShell({ pathname: "/" });
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const positioning = within(nav).getByRole("link", { name: "定位中心" });

    fireEvent.click(positioning);
    expect(positioning).toHaveTextContent(/^定位中心$/);
    expect(positioning).not.toHaveAttribute("data-pending");
    expect(nav).not.toHaveAttribute("aria-busy");
  });

  it("derives the active nav item from the pathname", async () => {
    await renderShell({ pathname: "/knowledge" });
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/knowledge");
    expect(active.textContent?.trim()).toBe("知识库");
  });

  it("运营分析直接打开周期报表并正确高亮", async () => {
    await renderShell({ pathname: "/daily-report" });
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    expect(within(nav).getByRole("link", { current: "page" })).toHaveAttribute("href", "/daily-report");
    expect(within(nav).getByRole("link", { name: "运营分析" })).toHaveAttribute("aria-current", "page");
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

  it("keeps global actions in normal flow so page tools are never covered", async () => {
    const { container } = await renderShell({
      pathname: "/",
      headerMode: "global",
    });
    const header = container.querySelector('[data-slot="app-top-header"]');

    expect(header).toHaveAttribute("data-layout", "flow");
    expect(header).not.toHaveClass("absolute");
  });

  it.each([
    ["/overview", "创作者总览"],
    ["/positioning", "定位中心"],
    ["/intelligence", "内容雷达"],
    ["/projects", "项目"],
    ["/topics", "选题中心"],
    ["/knowledge", "知识库"],
    ["/assets", "素材中心"],
    ["/publishing", "发布中心"],
    ["/daily-report", "运营分析"],
  ])("%s 保留正文唯一主标题，工具栏不再重复页面名称", async (pathname, title) => {
    const { AppShell } = await import("./app-shell");
    const { container } = render(<AppShell pathname={pathname} headerMode="global" pageTitle={title}>
      <main><h1>{title}</h1></main>
    </AppShell>);
    const headingSlot = container.querySelector('[data-slot="header-page-heading"]');
    expect(headingSlot).toBeEmptyDOMElement();
    expect(headingSlot).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("heading", {level:1})).toHaveLength(1);
    expect(screen.getByRole("heading", {level:1,name:title})).toBeVisible();
    expect(container.querySelector('[data-slot="app-top-header"]')).toBeInTheDocument();
    expect(screen.getByRole("navigation", {name:"主要导航"})).toBeInTheDocument();
  });

  it("renders the page content inside the page scroll area", async () => {
    const { container } = await renderShell();
    const scroll = container.querySelector('[data-slot="page-scroll-area"]');
    expect(scroll).not.toBeNull();
    const content = screen.getByTestId("page-content");
    expect(scroll?.contains(content)).toBe(true);
  });

  it("填满模式保留唯一滚动容器，禁止外层滚动而保留页面内部滚动", async () => {
    const { container } = await renderShell({ contentFill: true });
    // T1069稳定宿主：只切滚动CSS，不能通过换树卸载未保存的工程。
    const scrolls = container.querySelectorAll('[data-slot="page-scroll-area"]');
    expect(scrolls).toHaveLength(1);
    const scroll = scrolls[0]!;
    expect(scroll).toHaveAttribute("data-fill", "true");
    expect(scroll).toHaveClass(
      "[&>[data-slot=scroll-area-viewport]]:!overflow-hidden",
      "[&>[data-slot=scroll-area-viewport]>div]:h-full",
      "[&>[data-slot=scroll-area-viewport]>div]:min-h-0",
      "[&>[data-slot=scroll-area-scrollbar]]:hidden",
    );
    expect(scroll.querySelector(':scope > [data-slot="scroll-area-viewport"]')).not.toBeNull();
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

  it.each([false, true])("从填满=%s双向切换时保留容器与未保存子状态", async (initial) => {
    const { AppShell } = await import("./app-shell");
    const mounted = vi.fn(), unmounted = vi.fn();
    function Draft() {
      const [value, setValue] = React.useState("原稿");
      React.useEffect(() => { mounted(); return unmounted; }, []);
      return <input aria-label="未保存工程名" value={value} onChange={event => setValue(event.target.value)} />;
    }
    const view = (fill: boolean) => <AppShell pathname="/projects/example" contentFill={fill}><Draft /></AppShell>;
    const tree = render(view(initial));
    const draft = screen.getByRole("textbox", { name: "未保存工程名" });
    const scroll = tree.container.querySelector('[data-slot="page-scroll-area"]');
    const viewport = scroll?.querySelector(':scope > [data-slot="scroll-area-viewport"]');
    expect(scroll).not.toBeNull(); expect(viewport).not.toBeNull();
    fireEvent.change(draft, { target: { value: "未保存剪辑" } });
    for (const fill of [!initial, initial]) {
      tree.rerender(view(fill));
      expect(tree.container.querySelectorAll('[data-slot="page-scroll-area"]')).toHaveLength(1);
      expect(tree.container.querySelector('[data-slot="page-scroll-area"]')).toBe(scroll);
      expect(scroll?.querySelector(':scope > [data-slot="scroll-area-viewport"]')).toBe(viewport);
      expect(scroll).toHaveAttribute("data-fill", String(fill));
      expect(screen.getByRole("textbox", { name: "未保存工程名" })).toBe(draft);
      expect(draft).toHaveValue("未保存剪辑");
      expect(mounted).toHaveBeenCalledTimes(1); expect(unmounted).not.toHaveBeenCalled();
    }
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

  it.each(["/", "/intelligence", "/topics"])("主导航在 %s 不参与内容区伸缩，展开与折叠宽度独立", async (pathname) => {
    await renderShell({ pathname, contentFill: true });
    const sidebar = screen.getByTestId("app-sidebar");
    const expanded = getComputedStyle(sidebar);
    expect(expanded.width).toBe("var(--creatoros-sidebar-width)");
    expect(expanded.flexGrow).toBe("0");
    expect(expanded.flexShrink).toBe("0");
    expect(expanded.minWidth).toBe("0px");
    fireEvent.click(sidebar.querySelector('[data-slot="sidebar-collapse-toggle"]')!);
    expect(getComputedStyle(sidebar).width).toBe("64px");
  });

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

  it("助手页脚在展开与收拢态均保留全局 Copilot 入口和全部导航", async () => {
    const { container } = await renderShell();
    const sidebar = screen.getByRole("complementary", { name: /主侧栏/ });
    const nav = within(sidebar).getByRole("navigation", { name: "主要导航" });
    const expectedLinks = within(nav).getAllByRole("link").map(link => ({
      name: link.textContent?.trim(), href: link.getAttribute("href"),
    }));
    for (const group of ["创作", "资料", "运营", "工作区"]) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }
    for (const name of ["发布中心", "运营分析", "自动化", "设置"]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    for (const collapsed of [false, true]) {
      if (collapsed) fireEvent.click(within(sidebar).getByTestId("sidebar-collapse-toggle"));
      const footer = within(sidebar).getByRole("region", { name: "AI 助手" });
      expect(nav).not.toContainElement(footer);
      expect(container.querySelector('[data-slot="sidebar-identity-footer"]')).toContainElement(footer);
      const action = within(footer).getByRole("link", { name: "打开 AI 助手" });
      expect(action).toHaveAttribute("href", "?copilot=open&scope=global");
      expect(action).toHaveClass("min-h-11", "focus-visible:ring-2");
      action.focus();
      expect(action).toHaveFocus();
      // 原生链接打开行为由 href 驱动，测试不请求真实 Copilot 或模型。
      expect(within(nav).getAllByRole("link")).toHaveLength(expectedLinks.length);
      for (const { name, href } of expectedLinks) {
        expect(within(nav).getByRole("link", { name: name! })).toHaveAttribute("href", href);
      }
      if (collapsed) expect(action).toHaveAttribute("aria-label", "打开 AI 助手");
    }
  });

  it("sidebar user profile shows avatar + name + email + plan label", async () => {
    const { container } = await renderShell();
    const profile = container.querySelector('[data-slot="sidebar-user-profile"]');
    expect(profile).not.toBeNull();
    expect(profile?.textContent ?? "").toMatch(/个人版/);
  });

  it("低高度窗口把导航变为可滚动区，并把账号与用户身份固定留在视口内", async () => {
    const { container } = await renderShell();
    const sidebar = container.querySelector('[data-slot="app-sidebar"]');
    const scrollRegion = container.querySelector(
      '[data-slot="sidebar-scroll-region"]',
    );
    const identityFooter = container.querySelector(
      '[data-slot="sidebar-identity-footer"]',
    );
    const contextualCard = container.querySelector(
      '[data-slot="sidebar-contextual-card"]',
    );

    expect(sidebar).toHaveClass("h-dvh", "min-h-0", "overflow-hidden");
    expect(scrollRegion).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(identityFooter).toHaveClass("shrink-0");
    expect(contextualCard).not.toHaveClass("[@media(max-height:760px)]:hidden");
  });

  it("页面只让 Radix viewport 负责纵向滚动，外层 Root 不再形成第二滚动容器", async () => {
    const { container } = await renderShell();
    const root = container.querySelector('[data-slot="page-scroll-area"]');
    const viewport = container.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );

    expect(root).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
    expect(root).not.toHaveClass("overflow-y-auto");
    expect(viewport).not.toBeNull();
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
  it("手机菜单展开隔离主内容，Esc 后焦点回到重新渲染的开关", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({matches:query === "(max-width: 1024px)" || query === "(max-width: 640px)",media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:()=>true,onchange:null}) as MediaQueryList);
    try {
      const view=await renderShell();
      fireEvent.click(screen.getByRole("button",{name:"展开侧栏"}));
      const toggle=screen.getByRole("button",{name:"收起侧栏"});
      expect(toggle).toHaveFocus();
      expect(screen.getByRole("dialog",{name:"主侧栏"})).toHaveAttribute("aria-modal","true");
      expect(view.container.querySelector('[data-slot="app-main-frame"]')).toHaveAttribute("inert");
      fireEvent.keyDown(toggle,{key:"Escape"});
      await waitFor(()=>expect(screen.getByRole("button",{name:"展开侧栏"})).toHaveFocus());
      expect(view.container.querySelector('[data-slot="app-main-frame"]')).not.toHaveAttribute("inert");
    } finally {cleanup();window.matchMedia=original;}
  });
  it("窄窗口自动收起，恢复宽窗口时保留桌面展开偏好", async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const original = window.matchMedia;
    window.localStorage.setItem("creatoros:sidebar:collapsed", "0");
    window.matchMedia = vi.fn((query: string) => ({matches:query === "(max-width: 1024px)",media:query,addEventListener:(_type:string,fn: typeof listener)=>{if(query === "(max-width: 1024px)")listener=fn;},removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:()=>true,onchange:null}) as MediaQueryList);
    try {
      await renderShell();
      const sidebar=screen.getByRole("complementary",{name:/主侧栏/});
      await waitFor(()=>expect(sidebar).toHaveAttribute("data-collapsed","true"));
      expect(window.localStorage.getItem("creatoros:sidebar:collapsed")).toBe("0");
      const {act}=await import("@testing-library/react");
      act(()=>listener?.({matches:false} as MediaQueryListEvent));
      await waitFor(()=>expect(sidebar).toHaveAttribute("data-collapsed","false"));
    } finally { cleanup(); window.matchMedia=original; }
  });
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
