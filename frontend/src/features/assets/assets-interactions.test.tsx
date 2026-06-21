/**
 * Interaction tests for the Assets Center needs-backend controls (module 07
 * E2–E6). Each wired control fires its mapped contract op over the typed client
 * (mocked here) and then router.refresh() where the gallery must re-read:
 *   - E2 ＋上传素材  → createUpload then completeUpload (+ refresh)
 *   - E3 下载        → getAsset
 *   - E4 复制链接    → getAsset
 *   - E5 收藏        → addAssetFile (+ refresh)
 *   - E6 更多(回收站) → trashAsset (+ refresh)
 *
 * Determinism: the client is mocked; no Date.now/Math.random/network. The island
 * is rendered with a fixed fixture viewModel so a known asset is selected.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAssetsViewModel } from "@/fixtures/selectors";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createUpload: vi.fn((): Promise<unknown> =>
    Promise.resolve({ uploadId: "upload-1", storageKey: "k", uploadUrl: "u", expiresAt: "t" }),
  ),
  completeUpload: vi.fn((): Promise<unknown> =>
    Promise.resolve({ id: "asset-new", status: "active" }),
  ),
  getAsset: vi.fn((): Promise<unknown> =>
    Promise.resolve({ id: "a", currentFileId: "f" }),
  ),
  addAssetFile: vi.fn((): Promise<unknown> =>
    Promise.resolve({ id: "file-new", versionNumber: 2 }),
  ),
  trashAsset: vi.fn((): Promise<unknown> =>
    Promise.resolve({ id: "a", status: "deleted" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createUpload: (i: unknown) => mockClient.createUpload(i),
    completeUpload: (i: unknown) => mockClient.completeUpload(i),
    getAsset: (i: unknown) => mockClient.getAsset(i),
    addAssetFile: (i: unknown) => mockClient.addAssetFile(i),
    trashAsset: (i: unknown) => mockClient.trashAsset(i),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  for (const fn of Object.values(mockClient)) fn.mockClear();
  mockRouter.refresh.mockClear();
});

async function renderIsland() {
  const { AssetsInteractiveRegion } = await import(
    "./assets-interactive-region"
  );
  return render(<AssetsInteractiveRegion viewModel={buildAssetsViewModel()} />);
}

async function renderUploadButton() {
  const { AssetUploadButton } = await import("./asset-upload-button");
  return render(<AssetUploadButton />);
}

describe("Assets needs-backend wiring", () => {
  it("E2 ＋上传素材 runs the two-phase upload then refresh", async () => {
    const { container } = await renderUploadButton();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="assets-upload-button"]',
    );
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    await waitFor(() => expect(mockClient.completeUpload).toHaveBeenCalledTimes(1));
    expect(mockClient.createUpload).toHaveBeenCalledTimes(1);
    expect(mockClient.completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { uploadId: "upload-1" },
        body: { name: expect.any(String) },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("E3 下载 calls assets.get for the selected asset", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-download"]',
    );
    fireEvent.click(btn!);
    await waitFor(() => expect(mockClient.getAsset).toHaveBeenCalledTimes(1));
  });

  it("E4 复制链接 calls assets.get for the selected asset", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-copy"]',
    );
    fireEvent.click(btn!);
    await waitFor(() => expect(mockClient.getAsset).toHaveBeenCalledTimes(1));
  });

  it("E5 收藏 calls assets.files.create then refresh", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-favorite"]',
    );
    fireEvent.click(btn!);
    await waitFor(() => expect(mockClient.addAssetFile).toHaveBeenCalledTimes(1));
    expect(mockClient.addAssetFile).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { assetId: expect.any(String) },
        body: { storageKey: expect.any(String) },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("E6 更多(移入回收站) calls assets.trash then refresh", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-rename"]',
    );
    fireEvent.click(btn!);
    await waitFor(() => expect(mockClient.trashAsset).toHaveBeenCalledTimes(1));
    expect(mockClient.trashAsset).toHaveBeenCalledWith(
      expect.objectContaining({ params: { assetId: expect.any(String) } }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });
});
