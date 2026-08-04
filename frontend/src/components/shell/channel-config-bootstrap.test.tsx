import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelConfigBootstrap } from "./channel-config-bootstrap";

describe("ChannelConfigBootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("首次进入后台同步一次且请求体不携带任何激活码或 Key", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ outcome: "configured" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/local/client-config",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[1]).not.toHaveProperty("body");
  });

  it("仅对明确可重试失败做有限退避，成功后停止", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retryable: true }), { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ outcome: "configured" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
