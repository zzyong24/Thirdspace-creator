/**
 * `UploadDropzone` 组件测(L5 录制页区②:上传即绑定)。锁:
 *  - 渲染拖拽区(可点/可拖)。
 *  - canBind=false → 区禁用 + 显式说明,不 dispatch。
 *  - drop/选文件(canBind=true)→ createUpload → PUT(http)→ completeUpload → createMaterialLink
 *    (绑定当前项目,role clip/stage production)→ router.refresh;成功提示带「绑定到当前项目」。
 *  - mock:// presigned URL → 跳过 PUT(只 http(s) 才传字节)。
 *
 * Determinism:contract client + next router 全 mock;文件字节走 mock 的 fetch。
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createUpload: vi.fn((_i: unknown) =>
    Promise.resolve({
      uploadId: "upload-1",
      storageKey: "k",
      uploadUrl: "https://minio.example/put",
      expiresAt: "t",
    }),
  ),
  completeUpload: vi.fn((_i: unknown) =>
    Promise.resolve({ id: "asset-new", status: "active" }),
  ),
  createMaterialLink: vi.fn((_i: unknown) =>
    Promise.resolve({ id: "link-1", projectId: "proj-1", entityType: "asset" }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createUpload: (i: unknown) => mockClient.createUpload(i),
    completeUpload: (i: unknown) => mockClient.completeUpload(i),
    createMaterialLink: (i: unknown) => mockClient.createMaterialLink(i),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  Object.values(mockClient).forEach((m) => m.mockClear());
  mockRouter.refresh.mockClear();
  // 真字节 PUT 走 fetch(与 D1 一致);mock 返回 ok。
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)),
  );
});

async function renderDropzone(props?: { canBind?: boolean }) {
  const { UploadDropzone } = await import("./upload-dropzone");
  return render(
    <UploadDropzone projectId="proj-1" canBind={props?.canBind ?? true} />,
  );
}

function pngFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "shot.png", {
    type: "image/png",
  });
}

describe("UploadDropzone", () => {
  it("renders the dropzone area (点击/拖拽入口)", async () => {
    const { container } = await renderDropzone();
    expect(
      container.querySelector('[data-slot="upload-dropzone-area"]'),
    ).not.toBeNull();
  });

  it("canBind=false → 区禁用 + 显式说明,不 dispatch 上传", async () => {
    const { container } = await renderDropzone({ canBind: false });
    const area = container.querySelector('[data-slot="upload-dropzone-area"]')!;
    expect(area.getAttribute("data-disabled")).toBe("true");
    expect(
      container.querySelector('[data-slot="upload-dropzone-disabled-note"]'),
    ).not.toBeNull();
    // drop 一个文件也不应触发 createUpload(禁用)。
    await act(async () => {
      fireEvent.drop(area, { dataTransfer: { files: [pngFile()] } });
    });
    expect(mockClient.createUpload).not.toHaveBeenCalled();
  });

  it("选文件(canBind)→ createUpload→PUT→completeUpload→createMaterialLink(绑定)→refresh", async () => {
    const { container, findByText } = await renderDropzone();
    const input = container.querySelector(
      '[data-slot="upload-dropzone-input"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [pngFile()] } });
    });

    await waitFor(() => expect(mockClient.completeUpload).toHaveBeenCalled());

    // createUpload 带正确 assetType(image)/mimeType。
    expect(mockClient.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          assetType: "image",
          mimeType: "image/png",
        }),
      }),
    );
    // http(s) presigned URL → 真 PUT 字节。
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls
        .length,
    ).toBeGreaterThan(0);
    // 上传即绑定:createMaterialLink 把新 asset 挂进当前项目用料链(role clip/stage production)。
    expect(mockClient.createMaterialLink).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          projectId: "proj-1",
          entityType: "asset",
          entityId: "asset-new",
          role: "clip",
          stage: "production",
        },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
    expect(await findByText(/绑定到当前项目/)).not.toBeNull();
  });

  it("mock:// presigned URL → 跳过字节 PUT,仍建 asset + 绑定", async () => {
    mockClient.createUpload.mockResolvedValueOnce({
      uploadId: "upload-2",
      storageKey: "k",
      uploadUrl: "mock://asset/2",
      expiresAt: "t",
    });
    const { container } = await renderDropzone();
    const input = container.querySelector(
      '[data-slot="upload-dropzone-input"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [pngFile()] } });
    });
    await waitFor(() => expect(mockClient.completeUpload).toHaveBeenCalled());
    // mock:// → 不 PUT 字节。
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls
        .length,
    ).toBe(0);
    expect(mockClient.createMaterialLink).toHaveBeenCalled();
  });
});
