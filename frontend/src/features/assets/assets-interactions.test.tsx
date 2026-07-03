/**
 * Interaction tests for the Assets Center needs-backend controls (module 07
 * E2–E6). Each wired control fires its mapped contract op over the typed client
 * (mocked here) and then router.refresh() where the gallery must re-read:
 *   - E2 ＋上传素材  → createUpload then completeUpload (+ refresh)
 *   - E3 下载        → getAsset
 *   - E4 复制链接    → getAsset
 *   - E5 收藏        → REAL toggleFavorite (+ refresh); does NOT call the old
 *                      addAssetFile { storageKey: favorites/... } hack
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
  getDownloadUrl: vi.fn(
    (_input: unknown): Promise<unknown> =>
      Promise.resolve({ url: "/api/v1/blob/k?token=t", fileName: "clip.png" }),
  ),
  createUpload: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({
      uploadId: "upload-1",
      storageKey: "k",
      // [T-049 B5] local-fs 真形态是相对路径 URL —— 旧实现的 ^https?:// 判断会跳过
      // 它的字节 PUT(整链静默失败),测试用真形态守住「相对路径也 PUT」。
      uploadUrl: "/api/v1/blob/k?exp=1&token=t",
      expiresAt: "t",
    }),
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
  toggleFavorite: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "a", isFavorite: true }),
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
    getDownloadUrl: (i: unknown) => mockClient.getDownloadUrl(i),
    addAssetFile: (i: unknown) => mockClient.addAssetFile(i),
    trashAsset: (i: unknown) => mockClient.trashAsset(i),
    toggleFavorite: (i: unknown) => mockClient.toggleFavorite(i),
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
    // [T-049 B5] 相对路径 uploadUrl 必须发生字节 PUT(旧实现跳过它 → ENOENT 静默失败)。
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal("fetch", fetchSpy);
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(mockClient.completeUpload).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/blob/k?exp=1&token=t",
      expect.objectContaining({ method: "PUT" }),
    );
    vi.unstubAllGlobals();
    expect(mockClient.createUpload).toHaveBeenCalledTimes(1);
    // createUpload carries the file's REAL type + size, mapped to assetType.
    expect(mockClient.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          assetType: "image",
          mimeType: "image/png",
          fileSize: file.size,
          // [T-055d SPEC §7.1] 原名保真进 createUpload(local-fs 落盘名)。
          fileName: "clip.png",
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

  it("[T-055d] E3 下载做真:assets.downloadUrl 换签名 URL → <a download> 触发保存", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-download"]',
    );
    fireEvent.click(btn!);
    // [T-060③c] AssetLivePreview 挂载时也换签名 URL 做真预览 → 不限次数,只断言发生过。
    await waitFor(() => expect(mockClient.getDownloadUrl).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="asset-action-status"]')?.textContent,
      ).toContain("已开始下载"),
    );
  });

  it("E4 复制链接 calls assets.get for the selected asset", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-copy"]',
    );
    fireEvent.click(btn!);
    await waitFor(() => expect(mockClient.getAsset).toHaveBeenCalledTimes(1));
  });

  it("E5 收藏 calls assets.favorite.toggle then refresh (not the addAssetFile hack)", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-favorite"]',
    );
    fireEvent.click(btn!);
    await waitFor(() =>
      expect(mockClient.toggleFavorite).toHaveBeenCalledTimes(1),
    );
    // Reflects the new 收藏 state and refreshes the gallery.
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="asset-action-status"]')?.textContent,
      ).toContain("已加入收藏"),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
    // The misleading assets.files.create { storageKey: favorites/... } hack is gone.
    expect(mockClient.addAssetFile).not.toHaveBeenCalled();
  });

  it("[T-055d/T-056⑥/T-097] 移入回收站:Dialog 确认后 assets.trash + refresh(非原生 confirm)", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-trash"]',
    );
    expect(btn?.textContent).toContain("移入回收站");
    fireEvent.click(btn!);
    // [T-097] 点击只弹系统级 Dialog,不直接删。Radix Dialog 走 portal,查 document。
    expect(mockClient.trashAsset).not.toHaveBeenCalled();
    const confirmBtn = document.querySelector<HTMLButtonElement>(
      '[data-slot="asset-trash-confirm-button"]',
    );
    expect(confirmBtn).not.toBeNull();
    fireEvent.click(confirmBtn!);
    await waitFor(() => expect(mockClient.trashAsset).toHaveBeenCalledTimes(1));
    expect(mockClient.trashAsset).toHaveBeenCalledWith(
      expect.objectContaining({ params: { assetId: expect.any(String) } }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("[T-097] 移入回收站:Dialog 取消 → 关框且不调 assets.trash", async () => {
    const { container } = await renderIsland();
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-trash"]',
    );
    fireEvent.click(btn!);
    const cancelBtn = document.querySelector<HTMLButtonElement>(
      '[data-slot="asset-trash-cancel"]',
    );
    expect(cancelBtn).not.toBeNull();
    fireEvent.click(cancelBtn!);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="asset-trash-confirm-button"]'),
      ).toBeNull(),
    );
    expect(mockClient.trashAsset).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("[T-060③a] 附到项目已退役:素材只两条来路(素材中心直传 / 项目内上传)", async () => {
    const { container } = await renderIsland();
    expect(
      container.querySelector('[data-slot="asset-attach-project-select"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="asset-attach-button"]'),
    ).toBeNull();
  });
});
