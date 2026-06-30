/**
 * Interaction tests for the Publishing Workspace needs-backend / wired-local→
 * backend controls (module 10 Step 5). Each wired control fires its mapped
 * contract op over the typed client (mocked here) and then router.refresh():
 *   - 确认发布 (needs-backend) → for each selected platform: createPublication
 *     (when none) then transitionPublication { status: "published" } (+ refresh)
 *   - Title-input commit (wired-local→backend) → createPublicationRevision
 *     { title, description } (+ refresh)
 *   - 手动加平台 (SPEC §8) → createPublication { platform, accountReference } (+ refresh)
 *   - 标签 添加/删除 (SPEC §8) → createPublicationRevision { ..., platformTags } (+ refresh)
 *
 * Decorative controls (Description/Cover/Category/Series, extra checkboxes, 批量
 * 时间 pills, 内容日历, 发布前检查, preview platform tabs, 发布清单 links) issue NO
 * network call.
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

  // SPEC §8「平台」行:手动加平台。列出尚未建 publication 的平台,点一个 → createPublication。
  it("手动加平台 calls createPublication for an absent platform, then refresh", async () => {
    const base = buildPublishingViewModel(PROJECT_ID);
    // 收窄到只有 1 个平台卡,保证其余平台「未添加」可手动加。
    const onePlatform = base.platforms[0]!;
    const vm = { ...base, platforms: [onePlatform] };
    const { PublishingInteractiveRegion } = await import(
      "./publishing-interactive-region"
    );
    const { container } = render(
      <PublishingInteractiveRegion viewModel={vm} wiring={WIRING_EMPTY} />,
    );
    const addButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-slot="add-platform-button"]',
      ),
    );
    // 6 个平台全集 - 已有 1 个 = 5 个可加。
    expect(addButtons.length).toBe(5);
    fireEvent.click(addButtons[0]!);
    await waitFor(() =>
      expect(mockClient.createPublication).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { outputId: OUTPUT_ID },
        body: expect.objectContaining({
          platform: expect.any(String),
          accountReference: expect.any(String),
        }),
      }),
    );
    // 加平台不应误发 transition(只建,不直接发布)。
    expect(mockClient.transitionPublication).not.toHaveBeenCalled();
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("手动加平台 隐藏 when unwired (no outputId → no writable backend)", async () => {
    const { PublishingInteractiveRegion } = await import(
      "./publishing-interactive-region"
    );
    const { container } = render(
      <PublishingInteractiveRegion
        viewModel={buildPublishingViewModel(PROJECT_ID)}
      />,
    );
    expect(
      container.querySelector('[data-slot="add-platform-control"]'),
    ).toBeNull();
  });

  // SPEC §8「多平台 标签」行:标签 × 删除 / 添加 → append 新 revision 带 platformTags。
  it("删除标签 appends a revision with the remaining platformTags, then refresh", async () => {
    const vm = buildPublishingViewModel(PROJECT_ID);
    const first = vm.platforms[0]!;
    const wiring = {
      outputId: OUTPUT_ID,
      publications: { [first.platform]: "pub-existing" },
    };
    const { PublishingInteractiveRegion } = await import(
      "./publishing-interactive-region"
    );
    const { container } = render(
      <PublishingInteractiveRegion viewModel={vm} wiring={wiring} />,
    );
    const removeButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-slot="tag-remove"]',
      ),
    );
    expect(removeButtons.length).toBe(vm.form.tags.length);
    // 删第一个标签 → 提交剩余标签集。
    fireEvent.click(removeButtons[0]!);
    await waitFor(() =>
      expect(mockClient.createPublicationRevision).toHaveBeenCalledTimes(1),
    );
    const call = mockClient.createPublicationRevision.mock.calls[0]![0] as {
      params: { publicationId: string };
      body: { platformTags: string[] };
    };
    expect(call.params).toEqual({ publicationId: "pub-existing" });
    expect(call.body.platformTags).toEqual([...vm.form.tags.slice(1)]);
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("添加标签 appends a revision with the new tag included", async () => {
    const vm = buildPublishingViewModel(PROJECT_ID);
    const first = vm.platforms[0]!;
    const wiring = {
      outputId: OUTPUT_ID,
      publications: { [first.platform]: "pub-existing" },
    };
    const { PublishingInteractiveRegion } = await import(
      "./publishing-interactive-region"
    );
    const { container } = render(
      <PublishingInteractiveRegion viewModel={vm} wiring={wiring} />,
    );
    const input = container.querySelector<HTMLInputElement>(
      '[data-slot="tag-add-input"]',
    );
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "新标签" } });
    fireEvent.keyDown(input!, { key: "Enter" });
    await waitFor(() =>
      expect(mockClient.createPublicationRevision).toHaveBeenCalledTimes(1),
    );
    const call = mockClient.createPublicationRevision.mock.calls[0]![0] as {
      body: { platformTags: string[] };
    };
    expect(call.body.platformTags).toEqual([...vm.form.tags, "新标签"]);
  });
});
