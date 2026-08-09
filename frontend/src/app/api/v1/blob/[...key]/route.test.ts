import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRequestContext: vi.fn(),
  getStorageRootForRequest: vi.fn(),
  verifyBlobToken: vi.fn(),
  safeJoin: vi.fn(),
  blobStorageRootId: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@creatoros/backend/modules/assets", () => ({
  PathTraversalError: class PathTraversalError extends Error {},
  safeJoin: mocks.safeJoin,
  verifyBlobToken: mocks.verifyBlobToken,
  blobStorageRootId: mocks.blobStorageRootId,
}));

vi.mock("@/server/persistence-client", () => ({
  getStorageRootForRequest: mocks.getStorageRootForRequest,
}));

vi.mock("@/lib/request-context.server", () => ({
  resolveRequestContext: mocks.resolveRequestContext,
}));

vi.mock("@/lib/loopback-guard.server", () => ({
  isTrustedLocalRequest: vi.fn(() => true),
  loopbackForbidden: vi.fn(() => new Response(null, { status: 403 })),
}));

vi.mock("@/server/blob-upload", () => ({
  streamBlobToFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  stat: mocks.stat,
  readFile: mocks.readFile,
  open: vi.fn(),
}));

import { GET } from "./route";

const routeCtx = {
  params: Promise.resolve({ key: ["image", "cover.png"] }),
};

describe("GET /api/v1/blob/[...key] 单机免登录回归 (T-735)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRequestContext.mockResolvedValue({
      userId: "local-user",
      accountId: null,
      traceId: "trace-t735",
    });
    mocks.getStorageRootForRequest.mockResolvedValue("/tmp/creatoros-media");
    mocks.blobStorageRootId.mockReturnValue("root-id");
    mocks.verifyBlobToken.mockReturnValue({ ok: true });
    mocks.safeJoin.mockReturnValue("/tmp/creatoros-media/image/cover.png");
    mocks.stat.mockResolvedValue({ size: 3 });
    mocks.readFile.mockResolvedValue(Buffer.from("img"));
  });

  it("没有登录 session 时解析本机主用户并按用户与存储根校验签名", async () => {
    const response = await GET(
      new Request(
        "http://127.0.0.1:60531/api/v1/blob/image/cover.png?exp=9999999999999&token=signed",
        { headers: { cookie: "creatoros_loopback_boot=boot" } },
      ),
      routeCtx,
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveRequestContext).toHaveBeenCalledWith(null);
    expect(mocks.getStorageRootForRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "local-user" }),
    );
    expect(mocks.verifyBlobToken).toHaveBeenCalledWith(
      "GET",
      "image/cover.png",
      9_999_999_999_999,
      "signed",
      { userId: "local-user", storageRootId: "root-id" },
    );
  });

  it("本机身份无法解析时仍失败关闭", async () => {
    mocks.resolveRequestContext.mockRejectedValueOnce(new Error("no local user"));

    const response = await GET(
      new Request(
        "http://127.0.0.1:60531/api/v1/blob/image/cover.png?exp=9999999999999&token=signed",
      ),
      routeCtx,
    );

    expect(response.status).toBe(403);
    expect(mocks.verifyBlobToken).not.toHaveBeenCalled();
  });
});
