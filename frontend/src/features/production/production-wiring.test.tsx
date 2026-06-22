/**
 * Interaction tests for the Production Workspace needs-backend / wired-local→
 * backend controls (module 09 Step 5). Each wired control fires its mapped
 * contract op over the typed client (mocked here) and then router.refresh()
 * where the workspace must re-read:
 *   - 真人口播 / 知识演示 mode cards → putOutputProduction { productionMode } (+ refresh)
 *   - rec-overlay toggle           → putOutputProduction { recordingConfig } (+ refresh)
 *   - sub-ai-generate toggle        → putOutputProduction { subtitleConfig } (+ refresh)
 *   - 添加章节 / 添加新片段          → createProductionSegment (+ refresh)
 *   - 导出视频                       → createProductionExport then completeExport (+ refresh)
 *
 * Decorative controls (AI 数字人 mode, asset thumbnail, preview aspect 16:9,
 * 设备检测 / 预览字幕效果, settings value chips, 导入脚本) issue NO network call.
 *
 * Determinism: the client is mocked; no Date.now/Math.random/network. The island
 * is rendered with a fixed wiring descriptor so the op params are known.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildProductionViewModel } from "@/fixtures/selectors";

const PROJECT_ID = "project-ainativebrowser";
const WIRING = {
  outputId: "output-ainativebrowser-main",
  productionId: "prod-ainativebrowser-main",
} as const;

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  putOutputProduction: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: WIRING.productionId, status: "drafting" }),
  ),
  createProductionSegment: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "seg-new", position: 9 }),
  ),
  createProductionExport: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "export-1", status: "queued" }),
  ),
  completeExport: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "export-1", status: "ready" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    putOutputProduction: (i: unknown) => mockClient.putOutputProduction(i),
    createProductionSegment: (i: unknown) => mockClient.createProductionSegment(i),
    createProductionExport: (i: unknown) => mockClient.createProductionExport(i),
    completeExport: (i: unknown) => mockClient.completeExport(i),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  for (const fn of Object.values(mockClient)) fn.mockClear();
  mockRouter.refresh.mockClear();
});

async function renderIsland() {
  const { ProductionInteractiveRegion } = await import(
    "./production-interactive-region"
  );
  return render(
    <ProductionInteractiveRegion
      viewModel={buildProductionViewModel(PROJECT_ID)}
      wiring={WIRING}
    />,
  );
}

describe("Production needs-backend wiring", () => {
  it("知识演示 mode card calls putOutputProduction { productionMode } then refresh", async () => {
    const { container } = await renderIsland();
    const card = container.querySelector<HTMLButtonElement>(
      '[data-mode-id="mode-knowledge-demo"]',
    );
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    await waitFor(() =>
      expect(mockClient.putOutputProduction).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.putOutputProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { outputId: WIRING.outputId },
        body: { productionMode: "screen_capture" },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("真人口播 mode card calls putOutputProduction { remote_recording }", async () => {
    const { container } = await renderIsland();
    const card = container.querySelector<HTMLButtonElement>(
      '[data-mode-id="mode-direct-speaking"]',
    );
    fireEvent.click(card!);
    await waitFor(() =>
      expect(mockClient.putOutputProduction).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.putOutputProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { productionMode: "remote_recording" },
      }),
    );
  });

  it("AI 数字人 mode card is decorative — issues NO op", async () => {
    const { container } = await renderIsland();
    const card = container.querySelector<HTMLButtonElement>(
      '[data-mode-id="mode-ai-digital-human"]',
    );
    expect(card).not.toBeNull();
    expect(card!.disabled).toBe(true);
    fireEvent.click(card!);
    expect(mockClient.putOutputProduction).not.toHaveBeenCalled();
  });

  it("摄像头 overlay toggle calls putOutputProduction { recordingConfig } then refresh", async () => {
    const { container } = await renderIsland();
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-setting-id="rec-overlay"] [data-slot="settings-row-toggle"]',
    );
    expect(toggle).not.toBeNull();
    const before = toggle!.getAttribute("aria-checked");
    fireEvent.click(toggle!);
    await waitFor(() =>
      expect(mockClient.putOutputProduction).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.putOutputProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { outputId: WIRING.outputId },
        body: { recordingConfig: { overlay: before !== "true" } },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("AI 生成字幕 toggle calls putOutputProduction { subtitleConfig } then refresh", async () => {
    const { container } = await renderIsland();
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-setting-id="sub-ai-generate"] [data-slot="settings-row-toggle"]',
    );
    expect(toggle).not.toBeNull();
    const before = toggle!.getAttribute("aria-checked");
    fireEvent.click(toggle!);
    await waitFor(() =>
      expect(mockClient.putOutputProduction).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.putOutputProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { subtitleConfig: { aiGenerate: before !== "true" } },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("添加章节 calls createProductionSegment then refresh", async () => {
    const { container } = await renderIsland();
    const addButton = container.querySelector<HTMLButtonElement>(
      '[data-slot="timeline-add-segment"]',
    );
    expect(addButton).not.toBeNull();
    fireEvent.click(addButton!);
    await waitFor(() =>
      expect(mockClient.createProductionSegment).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createProductionSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { productionId: WIRING.productionId },
        body: expect.objectContaining({
          title: expect.any(String),
          position: expect.any(Number),
          startMs: expect.any(Number),
          endMs: expect.any(Number),
        }),
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("导出视频 calls createProductionExport then completeExport then refresh", async () => {
    const { container } = await renderIsland();
    const exportButton = container.querySelector<HTMLButtonElement>(
      '[data-slot="export-button"]',
    );
    expect(exportButton).not.toBeNull();
    fireEvent.click(exportButton!);
    await waitFor(() =>
      expect(mockClient.completeExport).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createProductionExport).toHaveBeenCalledTimes(1);
    expect(mockClient.createProductionExport).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { productionId: WIRING.productionId },
        body: { format: "mp4", resolution: "1080p", aspectRatio: "16:9" },
      }),
    );
    expect(mockClient.completeExport).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { exportId: "export-1" },
        body: { resultAssetId: expect.any(String) },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("decorative controls issue NO network call", async () => {
    const { container } = await renderIsland();
    // preview aspect 16:9
    container
      .querySelector<HTMLButtonElement>('[data-slot="preview-aspect-toggle"]')
      ?.click();
    // 导入脚本 link
    container
      .querySelector<HTMLAnchorElement>('[data-slot="script-import-action"]')
      ?.click();
    // asset thumbnail (first)
    container
      .querySelector<HTMLElement>('[data-slot="asset-thumbnail"]')
      ?.click();
    // a settings value chip (non-toggle)
    container
      .querySelector<HTMLElement>('[data-slot="settings-row-value"]')
      ?.click();
    expect(mockClient.putOutputProduction).not.toHaveBeenCalled();
    expect(mockClient.createProductionSegment).not.toHaveBeenCalled();
    expect(mockClient.createProductionExport).not.toHaveBeenCalled();
  });
});
