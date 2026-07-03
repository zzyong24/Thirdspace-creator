/**
 * Contract tests for the Assets Center page (Task 20).
 *
 * Locks the structural invariants from page-specs §12 + decision-log D-003:
 *  - The TopHeader renders in `global` mode with the page title "素材中心".
 *  - The shared Sidebar marks "素材中心" as the active nav item.
 *  - The page exposes an `AssetToolbar` at the top.
 *  - The AssetWorkspace contains an INTERNAL AssetTypeSidebar (NOT the
 *    global Sidebar). The internal sidebar uses a distinct `data-slot`
 *    ("asset-type-sidebar") so it cannot be confused with the global
 *    Sidebar ("app-sidebar").
 *  - The AssetGallery renders a THREE-column grid of AssetCard rows
 *    (three cards per row, distinct thumbnails per media type).
 *  - Selecting an asset updates the fixed right-side `AssetDetailPanel`
 *    (panel is NOT a dialog/modal — page-specs §12 "禁止改变").
 *  - MediaPreview renders DETERMINISTIC, TYPE-DISTINCT thumbnails per
 *    asset type (video / image / audio / document). Each type has its
 *    own `data-asset-type` slot.
 *  - The StorageUsageCard appears on the same page (lower-left region).
 *  - The page lives inside exactly ONE AppShell. There is exactly one
 *    global Sidebar and one TopHeader (no second Sidebar/TopHeader is
 *    rendered — page-internal AssetTypeSidebar is permitted but must
 *    not be confused with the global Sidebar).
 *  - On `/assets`, the global Sidebar uses the approved `storage`
 *    contextual-card variant (D-003).
 *
 * The page is a Server Component. The test renders it inside the
 * shared AppShell the same way `(creator)/layout.tsx` does so the
 * header-mode / sidebar-active / single-shell assertions run against
 * the same DOM shape a real route render would produce.
 */

import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// Stub `next/navigation` so the client islands (AssetUploadButton +
// AssetsInteractiveRegion, module 07 E2–E6) can call `useRouter()` without an
// App Router provider mounted in the unit test.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Stub `next/link` so we can assert href values without the Next.js
// runtime mounting a router.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type AssetsPageProps = React.ComponentProps<
  typeof import("./assets-page").AssetsPage
>;

// The (creator)/layout already mounts the shared AppShell. For the
// unit test we replicate that wrapper so the "Assets active in
// sidebar" check runs against the same DOM shape a real page render
// would produce.
async function renderAssets(overrides: Partial<AssetsPageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { AssetsPage } = await import("./assets-page");
  const { buildAssetsViewModel } = await import("@/fixtures/selectors");
  // AssetsPage is an async Server Component after the module-07 E1 read switch.
  // Render it through the `viewModel?` override seam so the unit test stays sync
  // + fixture-driven (no pglite read) — the DOM it produces is identical to a
  // real route render fed by the seeded `assets.list` op (F4).
  const viewModel = overrides.viewModel ?? buildAssetsViewModel();
  const element = await AssetsPage({ ...overrides, viewModel });
  return render(
    <AppShell
      pathname="/assets"
      headerMode="global"
      pageTitle="素材中心"
      contextualCardVariant="storage"
    >
      {element}
    </AppShell>,
  );
}

describe("AssetsPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in global mode with the assets page title", async () => {
    const { container } = await renderAssets();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("global");
    const heading = container.querySelector(
      '[data-slot="header-page-heading"]',
    );
    expect(heading).not.toBeNull();
    expect(heading!.textContent ?? "").toContain("素材中心");
  });

  it("marks the Assets nav item as the active page in the sidebar", async () => {
    await renderAssets();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/assets");
    expect(active.textContent?.trim()).toBe("素材中心");
  });

  it("renders an AssetToolbar at the top of the page", async () => {
    const { container } = await renderAssets();
    const toolbar = container.querySelector(
      '[data-slot="asset-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
  });

  it("renders the internal AssetTypeSidebar with a distinct data-slot from the global Sidebar", async () => {
    const { container } = await renderAssets();
    const globalSidebar = container.querySelector(
      '[data-slot="app-sidebar"]',
    );
    expect(globalSidebar).not.toBeNull();
    // Internal AssetTypeSidebar uses a different data-slot so it can
    // never be confused with the global Sidebar (page-specs §12).
    const internalSidebar = container.querySelector(
      '[data-slot="asset-type-sidebar"]',
    ) as HTMLElement;
    expect(internalSidebar).not.toBeNull();
    // The internal sidebar must NOT carry the same data-slot as the
    // global Sidebar. The page renders BOTH sidebars but they are
    // visually and semantically distinct.
    expect(internalSidebar.getAttribute("data-slot")).toBe("asset-type-sidebar");
    expect(internalSidebar.getAttribute("data-slot")).not.toBe(
      globalSidebar!.getAttribute("data-slot"),
    );
    // The internal sidebar exposes type-filter entries.
    const entries = internalSidebar.querySelectorAll(
      '[data-asset-type]',
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the AssetGallery in a three-column grid", async () => {
    const { container } = await renderAssets();
    const grid = container.querySelector(
      '[data-slot="asset-card-grid"]',
    ) as HTMLElement;
    expect(grid).not.toBeNull();
    // The grid declares three CSS columns (page-specs §12 invariant:
    // "中央保持三列素材卡网格"). We assert via the class marker so we
    // do not depend on Tailwind's runtime compilation.
    expect(grid.className).toMatch(/grid-cols-3|grid-cols-\[repeat\(3/);
    // And it actually renders multiple cards.
    const cards = grid.querySelectorAll('[data-slot="asset-card"]');
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it("renders the fixed right-side AssetDetailPanel (not a dialog)", async () => {
    const { container } = await renderAssets();
    const panel = container.querySelector(
      '[data-slot="asset-detail-panel"]',
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    // The detail panel must NOT be rendered as a dialog/modal — the
    // spec explicitly forbids converting it to one ("不把详情面板改成
    // 弹窗").
    expect(
      panel.closest('[role="dialog"]'),
    ).toBeNull();
    // The detail panel is always mounted (page-specs §12: "右侧详情
    // 面板固定展示当前选中素材").
    expect(panel.textContent ?? "").not.toBe("");
  });

  it("updates the AssetDetailPanel when a different asset is selected", async () => {
    const { container } = await renderAssets();
    const panel = container.querySelector(
      '[data-slot="asset-detail-panel"]',
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    const initialAssetId = panel.getAttribute("data-asset-id");
    expect(initialAssetId).not.toBeNull();

    // Pick a different card by selecting one with a different asset id.
    const cards = container.querySelectorAll(
      '[data-slot="asset-card"]',
    ) as NodeListOf<HTMLElement>;
    const targetCard = Array.from(cards).find(
      (card) => card.getAttribute("data-asset-id") !== initialAssetId,
    );
    expect(targetCard).toBeDefined();
    // The asset cards are wrapped in <button>s so they activate via
    // a click. Server-rendered pages render real <button> elements so
    // fireEvent.click works the same way.
    const button = targetCard!.querySelector(
      'button',
    ) as HTMLButtonElement;
    fireEvent.click(button);

    const updatedAssetId = panel.getAttribute("data-asset-id");
    expect(updatedAssetId).not.toBeNull();
    expect(updatedAssetId).not.toBe(initialAssetId);
  });

  it("renders distinct deterministic MediaPreview thumbnails per asset type", async () => {
    const { container } = await renderAssets();
    const cards = container.querySelectorAll(
      '[data-slot="asset-card"]',
    ) as NodeListOf<HTMLElement>;
    expect(cards.length).toBeGreaterThanOrEqual(4);

    // Gather each preview's `data-asset-type` slot and its
    // `data-asset-thumbnail-token` slot. The token must be deterministic
    // (same value across renders) and distinct per asset type.
    const previewSlots = container.querySelectorAll(
      '[data-slot="media-preview"]',
    );
    expect(previewSlots.length).toBeGreaterThanOrEqual(4);
    const tokensByType = new Map<string, string>();
    for (const node of previewSlots) {
      const el = node as HTMLElement;
      const type = el.getAttribute("data-asset-type") ?? "";
      const token = el.getAttribute("data-asset-thumbnail-token") ?? "";
      expect(type).not.toBe("");
      expect(token).not.toBe("");
      tokensByType.set(type, token);
    }
    // We must see all four canonical media types.
    for (const type of ["video", "image", "audio", "document"]) {
      expect(tokensByType.has(type)).toBe(true);
    }
    // Tokens across different types must be distinct (no two media
    // types share a thumbnail token).
    const tokens = Array.from(tokensByType.values());
    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(tokens.length);

    // Deterministic: rendering twice yields the same tokens.
    cleanup();
    const second = await renderAssets();
    const secondTokens = Array.from(
      second.container
        .querySelectorAll('[data-slot="media-preview"]'),
    ).map(
      (node) =>
        (node as HTMLElement).getAttribute("data-asset-thumbnail-token") ??
        "",
    );
    const secondTokensByType = new Map<string, string>();
    for (const node of second.container.querySelectorAll(
      '[data-slot="media-preview"]',
    )) {
      const el = node as HTMLElement;
      secondTokensByType.set(
        el.getAttribute("data-asset-type") ?? "",
        el.getAttribute("data-asset-thumbnail-token") ?? "",
      );
    }
    for (const [type, token] of tokensByType.entries()) {
      expect(secondTokensByType.get(type)).toBe(token);
    }
    // Defensive — secondTokens must be non-empty.
    expect(secondTokens.some((t) => t.length > 0)).toBe(true);
  });

  it("never renders NaN SVG geometry for hexadecimal preview tokens", async () => {
    const { container } = await renderAssets();
    const geometryNodes = container.querySelectorAll(
      "svg [width], svg [height], svg [x], svg [y]",
    );

    expect(geometryNodes.length).toBeGreaterThan(0);
    for (const node of geometryNodes) {
      for (const name of ["width", "height", "x", "y"]) {
        const value = node.getAttribute(name);
        if (value !== null) {
          expect(value, `${node.tagName.toLowerCase()}[${name}]`).not.toBe(
            "NaN",
          );
        }
      }
    }
  });

  it("renders the StorageUsageCard with deterministic usage data", async () => {
    const { container } = await renderAssets();
    const card = container.querySelector(
      '[data-slot="storage-usage-card"]',
    ) as HTMLElement;
    expect(card).not.toBeNull();
    // It carries a stable progressbar role.
    const bar = card.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
  });

  it("keeps the page inside the single AppShell — exactly one global Sidebar and one TopHeader", async () => {
    const { container } = await renderAssets();
    const shells = container.querySelectorAll('[data-slot="app-shell"]');
    expect(shells).toHaveLength(1);
    // The global Sidebar is rendered exactly once.
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    expect(sidebars).toHaveLength(1);
    // The global TopHeader is rendered exactly once.
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(headers).toHaveLength(1);
    // The page-internal AssetTypeSidebar is also present (page-specs
    // §12 requires it) but it lives inside the page content region,
    // not inside the global Sidebar.
    const internal = container.querySelector(
      '[data-slot="asset-type-sidebar"]',
    );
    expect(internal).not.toBeNull();
    expect(
      internal!.closest('[data-slot="app-sidebar"]'),
    ).toBeNull();
  });

  it("uses the approved storage contextual-card variant on the global Sidebar (D-003)", async () => {
    const { container } = await renderAssets();
    const card = container.querySelector(
      '[data-slot="sidebar-contextual-card"]',
    );
    expect(card).not.toBeNull();
    expect(card!.getAttribute("data-variant")).toBe("storage");
  });

  // ── Plan D1: real filters / counts / pagination ─────────────────────────

  it("shows REAL type-filter counts in the sidebar (not fabricated numbers)", async () => {
    const { buildAssetsViewModel } = await import("@/fixtures/selectors");
    const vm = buildAssetsViewModel();
    const { container } = await renderAssets();
    // The "全部素材" row's count equals the real active-asset total.
    const allRow = container.querySelector(
      '[data-slot="asset-type-row"][data-asset-type="all"]',
    ) as HTMLElement;
    expect(allRow).not.toBeNull();
    expect(allRow.getAttribute("data-type-count")).toBe(
      String(vm.assets.length),
    );
    // Each per-type row carries the real count for that type.
    const videoCount = vm.assets.filter((a) => a.type === "video").length;
    const videoRow = container.querySelector(
      '[data-slot="asset-type-row"][data-asset-type="video"]',
    ) as HTMLElement;
    expect(videoRow.getAttribute("data-type-count")).toBe(String(videoCount));
    // Type rows are real filter links carrying the `?type=` query.
    expect(videoRow.getAttribute("href")).toBe("/assets?type=video");
  });

  it("`?type=` filters the gallery to that asset type", async () => {
    const { buildAssetsViewModel } = await import("@/fixtures/selectors");
    const vm = buildAssetsViewModel();
    const { container } = await renderAssets({ viewModel: vm, type: "video" });
    const cards = container.querySelectorAll('[data-slot="asset-card"]');
    const videoCount = vm.assets.filter((a) => a.type === "video").length;
    expect(cards.length).toBe(videoCount);
    expect(videoCount).toBeGreaterThan(0);
  });

  it("`?q=` filters the gallery by a name/description/tag substring", async () => {
    const { buildAssetsViewModel } = await import("@/fixtures/selectors");
    const vm = buildAssetsViewModel();
    const target = vm.assets[0]!;
    // Use a distinctive slice of the first asset's name as the needle.
    const needle = target.name.slice(0, Math.min(3, target.name.length));
    const expected = vm.assets.filter((a) =>
      [a.name, a.description, ...a.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle.toLowerCase()),
    ).length;
    const { container } = await renderAssets({ viewModel: vm, q: needle });
    const cards = container.querySelectorAll('[data-slot="asset-card"]');
    expect(cards.length).toBe(expected);
  });

  it("removed the fabricated decorative controls (filter chips / batch menu / view toggle)", async () => {
    const { container } = await renderAssets();
    // The 5 fake filter chips + 清除筛选 are gone.
    expect(
      container.querySelector('[data-slot="assets-filter-type"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="assets-filter-source"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="assets-filter-clear"]'),
    ).toBeNull();
    // The 批量操作 menu, view toggle, and sort select are gone.
    expect(
      container.querySelector('[data-slot="assets-batch-button"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="gallery-view-toggle"]'),
    ).toBeNull();
    expect(container.querySelector('[data-slot="gallery-sort"]')).toBeNull();
    expect(
      container.querySelector('[data-slot="gallery-select-all"]'),
    ).toBeNull();
  });

  it("renders the REAL gallery total count (not a fabricated number)", async () => {
    const { buildAssetsViewModel } = await import("@/fixtures/selectors");
    const vm = buildAssetsViewModel();
    const { container } = await renderAssets();
    const total = container.querySelector(
      '[data-slot="gallery-total-count"]',
    ) as HTMLElement;
    expect(total).not.toBeNull();
    expect(total.textContent).toBe(vm.assets.length.toLocaleString("en-US"));
  });
});
