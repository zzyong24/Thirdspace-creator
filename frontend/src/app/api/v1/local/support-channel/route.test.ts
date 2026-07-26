import { localSupportChannelResponse } from "@creatoros/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getChannelLink = vi.hoisted(() => vi.fn());
vi.mock("@/server/activation/channel-links.server", () => ({ getChannelLink }));

import { GET } from "./route";

describe("GET /api/v1/local/support-channel (TEST-FDBR-001)", () => {
  beforeEach(() => getChannelLink.mockReset());

  it("returns only the sanitized support URL", async () => {
    getChannelLink.mockResolvedValue("https://support.example.com/form");
    const response = await GET();
    // toEqual 锁死整个响应体:除 supportUrl 外不含描述、其他渠道或任何多余字段。
    expect(await response.json()).toEqual({
      supportUrl: "https://support.example.com/form",
    });
    expect(getChannelLink).toHaveBeenCalledWith("support");
  });

  it("returns null when the channel is missing or unreadable", async () => {
    // getChannelLink 已把缓存缺失/损坏/版本不匹配收敛为 null。
    getChannelLink.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ supportUrl: null });
  });

  it("returns 200 null when the channel reader throws (读取异常不外泄)", async () => {
    getChannelLink.mockImplementationOnce(async () => {
      throw new Error("cache backend exploded");
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ supportUrl: null });
  });

  it("returns 200 null instead of leaking a non-HTTPS URL (schema 不匹配按 unavailable 处理)", async () => {
    getChannelLink.mockResolvedValue("http://insecure.example.com/form");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ supportUrl: null });
  });
});

describe("localSupportChannelResponse contract schema (TEST-FDBR-001)", () => {
  it("accepts an HTTPS URL and the null unavailable state", () => {
    expect(
      localSupportChannelResponse.parse({
        supportUrl: "https://support.example.com/form",
      }),
    ).toEqual({ supportUrl: "https://support.example.com/form" });
    expect(localSupportChannelResponse.parse({ supportUrl: null })).toEqual({
      supportUrl: null,
    });
  });

  it("rejects non-HTTPS URLs, non-URL strings and missing fields", () => {
    expect(() =>
      localSupportChannelResponse.parse({
        supportUrl: "http://insecure.example.com/form",
      }),
    ).toThrow();
    expect(() =>
      localSupportChannelResponse.parse({ supportUrl: "not a url" }),
    ).toThrow();
    expect(() => localSupportChannelResponse.parse({})).toThrow();
  });

  it("rejects extra keys so the response can never smuggle feedback content", () => {
    expect(() =>
      localSupportChannelResponse.parse({
        supportUrl: null,
        description: "user feedback body",
      }),
    ).toThrow();
  });
});
