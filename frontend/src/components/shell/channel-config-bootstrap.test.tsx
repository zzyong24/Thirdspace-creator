import { act, render, screen } from "@testing-library/react";
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
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("首次进入只后台同步并广播，不触发整页刷新或携带激活码/Key", async () => {
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
    expect(refresh).not.toHaveBeenCalled();
    expect(synced).toHaveBeenCalledTimes(1);
    window.removeEventListener("creatoros:client-config-synced", synced);
  });

  it("T-719 后台同步后的布局重新挂载不会再次同步或形成刷新风暴", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ outcome: "configured" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();

    first.unmount();
    render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("旧版本遗留的永久布尔标记不阻止新 bundle 同步", async () => {
    window.sessionStorage.setItem(
      "creatoros:client-config-bootstrap-completed",
      "1",
    );
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ outcome: "configured" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("过期时间戳会重新同步，短时新鲜时间戳只抑制刷新风暴", async () => {
    const key = "creatoros:client-config-bootstrap-completed";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ outcome: "configured" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    window.sessionStorage.setItem(key, String(Date.now() - 6 * 60 * 1_000));
    const stale = render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stale.unmount();
    window.sessionStorage.setItem(key, String(Date.now()));
    render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("T-712 渠道同步失败只留在设置页，不在业务页面常驻报错", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authority: "local",
          outcome: "activation_scope_missing",
          action: "授权缺少渠道信息，无法同步受管模型",
          retryable: false,
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChannelConfigBootstrap />);
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "重新校验激活权益并重试配置同步",
      }),
    ).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
