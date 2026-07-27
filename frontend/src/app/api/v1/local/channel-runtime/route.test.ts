import { localChannelRuntimeResponse } from "@creatoros/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readChannelRuntime = vi.hoisted(() => vi.fn());
vi.mock("@/server/activation/channel-runtime.server", () => ({
  readChannelRuntime,
}));

import { GET } from "./route";

const unavailable = {
  runtimeState: "unavailable",
  brandName: null,
  purchaseUrl: null,
  renewalUrl: null,
  channelSupportUrl: null,
  bugFeedbackUrl: null,
  downloadUrl: null,
} as const;
const localRequest = () =>
  new Request("http://127.0.0.1/api/v1/local/channel-runtime");

describe("GET /api/v1/local/channel-runtime（TEST-TSB-007）", () => {
  beforeEach(() => readChannelRuntime.mockReset());

  it("只返回已净化 UI 投影并禁止缓存", async () => {
    readChannelRuntime.mockResolvedValue({
      ...unavailable,
      runtimeState: "ready",
      bugFeedbackUrl: "https://growth.example/feedback?q=1#form",
    });
    const response = await GET(localRequest());
    const body = await response.json();
    expect(body).toEqual({
      ...unavailable,
      runtimeState: "ready",
      bugFeedbackUrl: "https://growth.example/feedback?q=1#form",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(localChannelRuntimeResponse.parse(body)).toEqual(body);
  });

  it("读端异常返回 read_error closed body，不泄漏异常", async () => {
    readChannelRuntime.mockImplementationOnce(async () => {
      throw new Error("ciphertext /Users/private/.license");
    });
    const response = await GET(localRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...unavailable,
      runtimeState: "read_error",
    });
  });

  it("route 自身纵深拒绝非 loopback 请求", async () => {
    const response = await GET(
      new Request("https://evil.example/api/v1/local/channel-runtime"),
    );
    expect(response.status).toBe(403);
    expect(readChannelRuntime).not.toHaveBeenCalled();
  });
});
