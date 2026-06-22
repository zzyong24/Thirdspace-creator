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
  createUpload: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ uploadId: "upload-1", storageKey: "k", uploadUrl: "u", expiresAt: "t" }),
  ),
  completeUpload: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "asset-new", status: "active" }),
  ),
  getAsset: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "a", currentFileId: "f" }),
  ),
  addAssetFile: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "file-new", versionNumber: 2 }),
  ),
  trashAsset: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "a", status: "deleted" }),
  ),
  createMaterialLink: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "link-1", projectId: "proj-1", entityType: "asset" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createUpload: (i: unknown) => mockClient.createUpload(i),
    completeUpload: (i: unknown) => mockClient.completeUpload(i),
    getAsset: (i: unknown) => mockClient.getAsset(i),
    addAssetFile: (i: unknown) => mockClient.addAssetFile(i),
    trashAsset: (i: unknown) => mockClient.trashAsset(i),
    createMaterialLink: (i: unknown) => mockClient.createMaterialLink(i),
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
  const vm = buildAssetsViewModel();
  const gallery = {
    assets: vm.assets,
    totalCount: vm.assets.length,
    currentPage: 1,
    pageSize: 24,
    totalPages: 1,
    activeType: null,
    query: "",
    projects: [
      { id: "proj-1", title: "项目一" },
      { id: "proj-2", title: "项目二" },
    ],
  };
  return render(
    <AssetsInteractiveRegion viewModel={vm} gallery={gallery} />,
  );
}

async function renderUploadButton() {
  const { AssetUploadButton } = await import("./asset-upload-button");
  return render(<AssetUploadButton />);
}

describe("Assets needs-backend wiring", () => {
  it("E2 ＋上传素材 selecting a real file runs the two-phase upload with its real name/type/size then refresh", async () => {
    const { container } = await renderUploadButton();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="assets-upload-button"]',
    );
    expect(btn).not.toBeNull();
    const input = container.querySelector<HTMLInputElement>(
      '[data-slot="assets-upload-input"]',
    );
    expect(input).not.toBeNull();

    // A real File: name/type/size are read off the File object.
    const file = new File(["hello-bytes"], "clip.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(mockClient.completeUpload).toHaveBeenCalledTimes(1));
    expect(mockClient.createUpload).toHaveBeenCalledTimes(1);
    // createUpload carries the file's REAL type + size, mapped to assetType.
    expect(mockClient.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          assetType: "image",
          mimeType: "image/png",
          fileSize: file.size,
        },
      }),
    );
    // completeUpload carries the file's REAL name.
    expect(mockClient.completeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { uploadId: "upload-1" },
        body: { name: "clip.png" },
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

  it("D1 附到项目 creates a material link (用料链) for the selected asset + project then refresh", async () => {
    const { container } = await renderIsland();
    const select = container.querySelector<HTMLSelectElement>(
      '[data-slot="asset-attach-project-select"]',
    );
    const attachBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-attach-button"]',
    );
    expect(select).not.toBeNull();
    expect(attachBtn).not.toBeNull();

    // Pick the second project, then attach.
    fireEvent.change(select!, { target: { value: "proj-2" } });
    fireEvent.click(attachBtn!);

    await waitFor(() =>
      expect(mockClient.createMaterialLink).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.createMaterialLink).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          projectId: "proj-2",
          entityType: "asset",
          entityId: expect.any(String),
          role: "clip",
          stage: "production",
        },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
    // A success affordance appears.
    expect(
      container.querySelector('[data-slot="asset-attach-success"]'),
    ).not.toBeNull();
  });
});
