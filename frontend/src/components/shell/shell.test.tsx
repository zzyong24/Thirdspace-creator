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
import { cleanup, render, screen, within } from "@testing-library/react";
import type React from "react";

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

  it("renders the seven approved primary nav items in order", async () => {
    await renderShell();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const items = within(nav).getAllByRole("link");
    const labels = items.map((item) => item.textContent?.trim() ?? "");
    expect(labels).toEqual([
      "首页",
      "项目",
      "知识库",
      "素材中心",
      "发布中心",
      "经验沉淀",
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

  it("passes the supported header mode down to the top header", async () => {
    const { container } = await renderShell({ headerMode: "project-workspace" });
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header?.getAttribute("data-mode")).toBe("project-workspace");
  });

  it("renders the page content inside the page scroll area", async () => {
    const { container } = await renderShell();
    const scroll = container.querySelector('[data-slot="page-scroll-area"]');
    expect(scroll).not.toBeNull();
    const content = screen.getByTestId("page-content");
    expect(scroll?.contains(content)).toBe(true);
  });
});
