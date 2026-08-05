import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelConfigBootstrap } from "./channel-config-bootstrap";

const { refresh, invoke } = vi.hoisted(() => ({
  refresh: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("ChannelConfigBootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
    invoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("首次进入后台同步一次且请求体不携带任何激活码或 Key", async () => {
    const synced = vi.fn();
    window.addEventListener("creatoros:client-config-synced", synced);
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
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(synced).toHaveBeenCalledTimes(1);
    window.removeEventListener("creatoros:client-config-synced", synced);
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

  it("T-701 不吞掉缺渠道身份错误，并提供真实复校后重试动作", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authority: "local",
            outcome: "activation_scope_missing",
            action: "授权缺少渠道信息，无法同步受管模型",
            retryable: false,
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ outcome: "configured" }), {
          status: 200,
        }),
      );
    invoke.mockResolvedValue({ licensed: true, status: "active" });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());

    await vi.waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "授权缺少渠道信息，无法同步受管模型",
      );
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "重新校验激活权益并重试配置同步",
      }),
    );
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("license_check");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
