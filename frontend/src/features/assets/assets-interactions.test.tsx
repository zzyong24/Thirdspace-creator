/**
 * Interaction tests for the Assets Center needs-backend controls (module 07
 * E2–E6). Each wired control fires its mapped contract op over the typed client
 * (mocked here) and then router.refresh() where the gallery must re-read:
 *   - E2 ＋上传素材  → createUpload then completeUpload (+ refresh)
 *   - E3 下载        → getAsset
 *   - E4 复制链接    → 常驻 disabled 规划中(无请求)
 *   - E5 收藏        → REAL toggleFavorite (+ refresh); does NOT call the old
 *                      addAssetFile { storageKey: favorites/... } hack
 *   - E6 更多(回收站) → trashAsset (+ refresh)
 *
 * Determinism: the client is mocked; no Date.now/Math.random/network. The island
 * is rendered with a fixed fixture viewModel so a known asset is selected.
 */

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAssetsViewModel } from "@/fixtures/selectors";
import type { CreationClient } from "@/lib/creation-workspace-scope";
import { CURRENT_ACCOUNT_KEY, CURRENT_GROUP_KEY } from "@/lib/http-transport";

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
  // [T-248 批B] 回收站还原:deleted → active。
  restoreAsset: vi.fn((_input: unknown): Promise<unknown> =>
    Promise.resolve({ id: "a", status: "active" }),
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
    restoreAsset: (i: unknown) => mockClient.restoreAsset(i),
    toggleFavorite: (i: unknown) => mockClient.toggleFavorite(i),
    createMaterialLink: (i: unknown) => mockClient.createMaterialLink(i),
  },
}));

const uploadGroup = "upload-test-group";
const uploadFixture: Awaited<ReturnType<CreationClient["createUpload"]>> = {
  uploadId: "upload-1", assetId: "asset-new", storageKey: "k",
  uploadUrl: "/api/v1/blob/k?exp=1&token=t",
  expiresAt: "2026-10-10T12:00:00.000Z",
};
const uploadedAsset: Awaited<ReturnType<CreationClient["completeUpload"]>> = {
  id: "asset-new", userId: "upload-test-user", currentFileId: "file-new",
  assetType: "image", name: "clip.png", description: "", status: "active",
  isFavorite: false, mimeType: "image/png", fileSize: 11,
  width: null, height: null, durationMs: null, extractStatus: null,
  materialSummary: null, extractedText: null, sourceUrl: null, deletedAt: null,
  createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z",
};

// SEMANTIC_BOUNDARY_ALLOW: 测试HTTP夹具只按公开操作ID返回合法回执，不做创作选择。
function mockUploadHttp(put?: () => Promise<Response>) {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === uploadFixture.uploadUrl) return put ? put() : new Response(null, { status: 200 });
    if (input !== "/api/v1/dispatch") throw new Error(`unexpected upload request: ${String(input)}`);
    const request = JSON.parse(String(init?.body));
    let data: unknown;
    if (request.id === "assets.uploads.create") {
      await mockClient.createUpload(request.input);
      data = uploadFixture;
    } else if (request.id === "assets.uploads.complete") {
      await mockClient.completeUpload(request.input);
      data = uploadedAsset;
    } else throw new Error(`unexpected upload operation: ${String(request.id)}`);
    return Response.json({ data, meta: { requestId: "upload-test-request" } });
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

let originalScope: [string | null, string | null];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  [CURRENT_GROUP_KEY, CURRENT_ACCOUNT_KEY].forEach((key, index) => {
    const value = originalScope[index];
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  });
});
beforeEach(() => {
  originalScope = [window.localStorage.getItem(CURRENT_GROUP_KEY), window.localStorage.getItem(CURRENT_ACCOUNT_KEY)];
  for (const fn of Object.values(mockClient)) fn.mockClear();
  mockRouter.refresh.mockClear();
});

async function renderIsland(options?: {
  // [T-248 批B] 回收站行注入 seam:vm.trashedAssets(缺省 undefined = 空回收站)。
  trashedAssets?: ReadonlyArray<unknown>;
}) {
  const { AssetsInteractiveRegion } = await import(
    "./assets-interactive-region"
  );
  const vm = {
    ...buildAssetsViewModel(),
    ...(options?.trashedAssets !== undefined
      ? { trashedAssets: options.trashedAssets }
      : {}),
  } as ReturnType<typeof buildAssetsViewModel>;
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

async function renderUploadButton(groupId: string | null = uploadGroup) {
  if (groupId === null) window.localStorage.removeItem(CURRENT_GROUP_KEY);
  else window.localStorage.setItem(CURRENT_GROUP_KEY, groupId);
  window.localStorage.removeItem(CURRENT_ACCOUNT_KEY);
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
    const fetchSpy = mockUploadHttp();
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(mockClient.completeUpload).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/blob/k?exp=1&token=t",
      expect.objectContaining({ method: "PUT", body: file, headers: { "content-type": "image/png" } }),
    );
    const dispatches = fetchSpy.mock.calls.filter(([path]) => path === "/api/v1/dispatch");
    expect(dispatches).toHaveLength(2);
    const signal = dispatches[0]![1]?.signal;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);
    for (const [, init] of dispatches) {
      expect(new Headers(init?.headers).get("x-group-id")).toBe(uploadGroup);
      expect(new Headers(init?.headers).has("x-account-id")).toBe(false);
      expect(init?.signal).toBe(signal);
    }
    expect(fetchSpy.mock.calls.find(([path]) => path === uploadFixture.uploadUrl)?.[1]?.signal).toBe(signal);
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

  it("E2 没有组与旧账号时不发上传请求", async () => {
    const { container } = await renderUploadButton(null);
    const fetchSpy = mockUploadHttp();
    await act(async () => {
      fireEvent.change(container.querySelector('[data-slot="assets-upload-input"]')!, {
        target: { files: [new File(["hello-bytes"], "clip.png", { type: "image/png" })] },
      });
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockClient.completeUpload).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it.each(["切组", "卸载"] as const)("E2 PUT等待时%s取消真实signal，晚到成功不完成或刷新", async (leave) => {
    const { container, unmount } = await renderUploadButton();
    let finishPut!: (response: Response) => void;
    const pendingPut = new Promise<Response>((resolve) => { finishPut = resolve; });
    const fetchSpy = mockUploadHttp(() => pendingPut);
    fireEvent.change(container.querySelector('[data-slot="assets-upload-input"]')!, {
      target: { files: [new File(["hello-bytes"], "clip.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(fetchSpy.mock.calls.filter(([path]) => path === uploadFixture.uploadUrl)).toHaveLength(1), { timeout: 120_000 });
    const signal = fetchSpy.mock.calls.find(([path]) => path === uploadFixture.uploadUrl)?.[1]?.signal;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);
    act(() => {
      if (leave === "卸载") unmount();
      else {
        window.localStorage.setItem(CURRENT_GROUP_KEY, "another-upload-group");
        window.dispatchEvent(new Event("creatoros:accounts-changed"));
      }
    });
    expect(signal?.aborted).toBe(true);
    await act(async () => { finishPut(new Response(null, { status: 200 })); await pendingPut; });
    expect(mockClient.createUpload).toHaveBeenCalledTimes(1);
    expect(mockClient.completeUpload).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("已上传素材");
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

  // [T-360②] 复制链接已整体下架(原 T-231③ 规划中占位):单机本地产品无对象存储/签名链接
  // 语义(用户拍板),本地文件定位走「Finder」。
  it("E4 复制链接已下架(按钮不再渲染)", async () => {
    const { container } = await renderIsland();
    expect(
      container.querySelector('[data-slot="asset-action-copy"]'),
    ).toBeNull();
  });

  it("[T-788] 素材定位使用跨平台文件管理器文案，并在 route 成功后给出完成反馈", async () => {
    const fetchSpy = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/api/v1/local/reveal")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, revealed: "asset" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = await renderIsland();
    const button = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-action-reveal"]',
    );

    expect(button).not.toBeNull();
    expect(button).toHaveAttribute("aria-label", "在文件管理器中显示");
    expect(button?.textContent).toContain("打开位置");
    expect(button?.textContent).not.toMatch(/Finder|访达/);

    fireEvent.click(button!);
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="asset-action-status"]')
          ?.textContent,
      ).toContain("已在文件管理器中显示"),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/local/reveal",
      expect.objectContaining({ method: "POST" }),
    );
    vi.unstubAllGlobals();
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

  // [T-248 批B] 回收站还原视图:进回收站视图 → 列出 trashed → 还原确认门 →
  // assets.restore + refresh;取消不动数据;空态诚实。
  const trashedFixture = [
    {
      id: "asset-trashed-1",
      name: "被回收的封面.png",
      description: "",
      type: "image",
      mimeType: "image/png",
      fileSizeBytes: 1024,
      width: 100,
      height: 100,
      durationMs: null,
      tags: [],
      thumbnailToken: "image:asset-trashed-1",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
  ] as const;

  it("[T-248 批B] 回收站视图列出 trashed,还原确认后 assets.restore + refresh", async () => {
    const { container } = await renderIsland({ trashedAssets: trashedFixture });
    // 进回收站视图。
    const trashViewBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="assets-view-trash"]',
    );
    expect(trashViewBtn).not.toBeNull();
    fireEvent.click(trashViewBtn!);
    // 列出已回收素材。
    const item = container.querySelector(
      '[data-slot="assets-trash-item"][data-asset-id="asset-trashed-1"]',
    );
    expect(item).not.toBeNull();
    expect(item!.textContent).toContain("被回收的封面.png");
    // 点「还原」只弹确认框,不直接调 op(全站禁原生 confirm,Dialog 走 portal)。
    const restoreBtn = container.querySelector<HTMLButtonElement>(
      '[data-slot="asset-restore-button"]',
    );
    fireEvent.click(restoreBtn!);
    expect(mockClient.restoreAsset).not.toHaveBeenCalled();
    const confirmBtn = document.querySelector<HTMLButtonElement>(
      '[data-slot="asset-restore-confirm-button"]',
    );
    expect(confirmBtn).not.toBeNull();
    fireEvent.click(confirmBtn!);
    await waitFor(() => expect(mockClient.restoreAsset).toHaveBeenCalledTimes(1));
    expect(mockClient.restoreAsset).toHaveBeenCalledWith(
      expect.objectContaining({ params: { assetId: "asset-trashed-1" } }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("[T-248 批B] 还原确认框取消 → 关框且不调 assets.restore、不 refresh", async () => {
    const { container } = await renderIsland({ trashedAssets: trashedFixture });
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="assets-view-trash"]',
      )!,
    );
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="asset-restore-button"]',
      )!,
    );
    const cancelBtn = document.querySelector<HTMLButtonElement>(
      '[data-slot="asset-restore-cancel"]',
    );
    expect(cancelBtn).not.toBeNull();
    fireEvent.click(cancelBtn!);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="asset-restore-confirm-button"]'),
      ).toBeNull(),
    );
    expect(mockClient.restoreAsset).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("[T-248 批B] 空回收站显示诚实空态「回收站是空的」", async () => {
    const { container } = await renderIsland();
    fireEvent.click(
      container.querySelector<HTMLButtonElement>(
        '[data-slot="assets-view-trash"]',
      )!,
    );
    const empty = container.querySelector('[data-slot="assets-trash-empty"]');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain("回收站是空的");
    expect(
      container.querySelector('[data-slot="assets-trash-item"]'),
    ).toBeNull();
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
