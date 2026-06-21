/**
 * Interaction tests for the Publishing Workspace needs-backend / wired-local→
 * backend controls (module 10 Step 5). Each wired control fires its mapped
 * contract op over the typed client (mocked here) and then router.refresh():
 *   - 确认发布 (needs-backend) → for each selected platform: createPublication
 *     (when none) then transitionPublication { status: "published" } (+ refresh)
 *   - Title-input commit (wired-local→backend) → createPublicationRevision
 *     { title, description } (+ refresh)
 *
 * Decorative controls (Description/Cover/Category/Series, tag-chip ×, extra
 * checkboxes, 批量时间 pills, 内容日历, 发布前检查, preview platform tabs, 发布清单
 * links) issue NO network call.
 *
 * Determinism: the client is mocked; no Date.now/Math.random/network. The island
 * is rendered with a fixed wiring descriptor so the op params are known.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPublishingViewModel } from "@/fixtures/selectors";

const PROJECT_ID = "project-ainativebrowser";
const OUTPUT_ID = "output-ainativebrowser-main";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createPublication: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "pub-new", status: "draft" }),
  ),
  transitionPublication: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "pub-new", status: "published" }),
  ),
  createPublicationRevision: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "rev-new", revisionNumber: 2 }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createPublication: (i: unknown) => mockClient.createPublication(i),
    transitionPublication: (i: unknown) => mockClient.transitionPublication(i),
    createPublicationRevision: (i: unknown) =>
      mockClient.createPublicationRevision(i),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  for (const fn of Object.values(mockClient)) fn.mockClear();
  mockRouter.refresh.mockClear();
});

// No pre-existing publications → 确认发布 must create then publish each platform.
const WIRING_EMPTY = { outputId: OUTPUT_ID, publications: {} } as const;

async function renderIsland(
  wiring: { outputId: string; publications: Record<string, string> },
) {
  const { PublishingInteractiveRegion } = await import(
    "./publishing-interactive-region"
  );
  return render(
    <PublishingInteractiveRegion
      viewModel={buildPublishingViewModel(PROJECT_ID)}
      wiring={wiring}
    />,
  );
}

describe("Publishing needs-backend wiring", () => {
  it("确认发布 creates then publishes each selected platform, then refresh", async () => {
    const { container } = await renderIsland(WIRING_EMPTY);
    const vm = buildPublishingViewModel(PROJECT_ID);
    const selectedCount = vm.platforms.length;
    expect(selectedCount).toBeGreaterThan(0);

    const button = container.querySelector<HTMLButtonElement>(
      '[data-slot="confirm-publish-button"]',
    );
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    await waitFor(() =>
      expect(mockClient.transitionPublication).toHaveBeenCalledTimes(
        selectedCount,
      ),
    );
    // No seeded publications → one createPublication per selected platform.
    expect(mockClient.createPublication).toHaveBeenCalledTimes(selectedCount);
    expect(mockClient.createPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { outputId: OUTPUT_ID },
        body: expect.objectContaining({
          platform: expect.any(String),
          accountReference: expect.any(String),
        }),
      }),
    );
    expect(mockClient.transitionPublication).toHaveBeenCalledWith(
      expect.objectContaining({ body: { status: "published" } }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("确认发布 reuses an existing publication (no create) when one exists for the platform", async () => {
    const vm = buildPublishingViewModel(PROJECT_ID);
    const first = vm.platforms[0]!;
    const wiring = {
      outputId: OUTPUT_ID,
      publications: { [first.platform]: "pub-existing" },
    };
    const { container } = await renderIsland(wiring);
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="confirm-publish-button"]',
      )!,
    );
    await waitFor(() =>
      expect(mockClient.transitionPublication).toHaveBeenCalled(),
    );
    // The existing platform reused its publication id (one fewer create).
    expect(mockClient.createPublication).toHaveBeenCalledTimes(
      vm.platforms.length - 1,
    );
    expect(mockClient.transitionPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { publicationId: "pub-existing" },
        body: { status: "published" },
      }),
    );
  });

  it("Title-input commit calls createPublicationRevision then refresh", async () => {
    const vm = buildPublishingViewModel(PROJECT_ID);
    const first = vm.platforms[0]!;
    const wiring = {
      outputId: OUTPUT_ID,
      publications: { [first.platform]: "pub-existing" },
    };
    const { container } = await renderIsland(wiring);
    const input = container.querySelector<HTMLInputElement>(
      '[data-slot="title-input"]',
    );
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "新的发布标题" } });
    fireEvent.blur(input!);
    await waitFor(() =>
      expect(mockClient.createPublicationRevision).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createPublicationRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { publicationId: "pub-existing" },
        body: { title: "新的发布标题", description: "" },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("decorative controls issue NO network call", async () => {
    const { container } = await renderIsland(WIRING_EMPTY);
    // preview platform tabs
    container
      .querySelector<HTMLButtonElement>('[data-slot="preview-platform-tab"]')
      ?.click();
    // 发布清单 / 提示 more link
    container
      .querySelector<HTMLAnchorElement>('[data-slot="publish-tips-more"]')
      ?.click();
    // 批量设置时间 pill region
    container
      .querySelector<HTMLElement>('[data-slot="batch-time-actions"]')
      ?.click();
    // 内容日历 cell
    container
      .querySelector<HTMLElement>('[data-slot="content-calendar-cell"]')
      ?.click();
    // 发布前检查 row
    container
      .querySelector<HTMLElement>('[data-slot="pre-publish-check-row"]')
      ?.click();
    expect(mockClient.createPublication).not.toHaveBeenCalled();
    expect(mockClient.transitionPublication).not.toHaveBeenCalled();
    expect(mockClient.createPublicationRevision).not.toHaveBeenCalled();
  });
});
