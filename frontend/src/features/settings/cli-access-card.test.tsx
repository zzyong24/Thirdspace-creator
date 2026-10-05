import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CliAccessCard } from "./cli-access-card";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("CliAccessCard (T-843)", () => {
  beforeEach(() => {
    invoke.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  it("读取桌面原生真态并开启本次启动授权", async () => {
    invoke
      .mockResolvedValueOnce({ supported: true, ready: true, enabled: false, productId: "creatoros", expiresAt: null })
      .mockResolvedValueOnce({ supported: true, ready: true, enabled: true, productId: "creatoros", expiresAt: 1_800_000_000_000 });

    render(<CliAccessCard />);
    const button = await screen.findByRole("button", { name: "开启并记住" });
    fireEvent.click(button);

    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("cli_access_enable"));
    expect(screen.getByText("已开启 · 启动时自动开启")).toBeInTheDocument();
    expect(screen.getByText(/完整读写调用/)).toBeInTheDocument();
  });

  it("已开启时可关闭并记住", async () => {
    invoke
      .mockResolvedValueOnce({ supported: true, ready: true, enabled: true, productId: "creatoros", expiresAt: 1_800_000_000_000 })
      .mockResolvedValueOnce({ supported: true, ready: true, enabled: false, productId: "creatoros", expiresAt: null });

    render(<CliAccessCard />);
    const button = await screen.findByRole("button", { name: "关闭并记住" });
    fireEvent.click(button);

    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("cli_access_revoke"));
    expect(screen.getByText("未开启")).toBeInTheDocument();
  });

  it("关闭偏好保存失败仍回读实际已撤销状态", async () => {
    invoke.mockResolvedValueOnce({supported:true,ready:true,enabled:true})
      .mockRejectedValueOnce(new Error("保存设置失败"))
      .mockResolvedValueOnce({supported:true,ready:true,enabled:false});
    render(<CliAccessCard />);
    fireEvent.click(await screen.findByRole("button",{name:"关闭并记住"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存设置失败");
    expect(screen.getByText("未开启")).toBeInTheDocument();
  });

  it("浏览器版不渲染假开关", async () => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    render(<CliAccessCard />);

    expect(await screen.findByText(/浏览器版不提供本机 CLI 授权/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "开启并记住" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});


describe("T-1060 WorkBuddy MCP connection handoff", () => {
  const launch = {
    command: "/fixture/Node runtime/node",
    args: ["/fixture/CLI bundle/creatoros.cjs", "mcp", "serve", "--connection-file", "/fixture/channel/connection.json"],
    env: { CREATOROS_BASE_URL: "" },
  };
  const clipboard = vi.fn();
  beforeEach(() => {
    invoke.mockReset(); clipboard.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
    invoke.mockResolvedValue({ supported: true, ready: true, installed: true, enabled: true, mcpLaunch: launch });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("copies native exact argv and separates copy success from host trust", async () => {
    clipboard.mockResolvedValue(undefined);
    render(<CliAccessCard />);
    fireEvent.click(await screen.findByRole("button", { name: "复制 MCP 配置" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledTimes(1));
    expect(JSON.parse(clipboard.mock.calls[0]![0])).toEqual({ mcpServers: { creatoros: { type: "stdio", ...launch } } });
    expect(await screen.findByText("已复制配置，请在 WorkBuddy 中添加并确认首次信任。")).toBeInTheDocument();
    expect(screen.getByText(/首次信任和工具调用需在 WorkBuddy 中确认/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("cli_access_status");
  });

  it("download creates a real JSON file and releases its object URL", async () => {
    const create = vi.fn().mockReturnValue("blob:workbuddy-config");
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<CliAccessCard />);
    fireEvent.click(await screen.findByRole("button", { name: "下载连接配置" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const link = click.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe("creatoros-workbuddy.mcp.json");
    expect(create.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(revoke).toHaveBeenCalledWith("blob:workbuddy-config");
    expect(screen.getByText("已生成连接配置，请在 WorkBuddy 中添加并确认首次信任。")).toBeInTheDocument();
  });

  it("clipboard failure reports failure and never claims configuration or trust success", async () => {
    clipboard.mockRejectedValue(new Error("系统剪贴板不可用"));
    render(<CliAccessCard />);
    fireEvent.click(await screen.findByRole("button", { name: "复制 MCP 配置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("系统剪贴板不可用");
    expect(screen.queryByText(/已复制配置/)).not.toBeInTheDocument();
  });

  it.each([
    { supported: true, ready: true, enabled: false, mcpLaunch: launch },
    { supported: true, ready: false, enabled: true, mcpLaunch: launch },
    { supported: true, ready: true, enabled: true },
  ])("does not invent runnable configuration when native status is incomplete or disabled", async (status) => {
    invoke.mockResolvedValue(status);
    render(<CliAccessCard />);
    await screen.findByText("WorkBuddy 外部工具接入");
    expect(screen.queryByRole("button", { name: "复制 MCP 配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载连接配置" })).not.toBeInTheDocument();
    expect(clipboard).not.toHaveBeenCalled();
  });
});


describe("T-1060 WorkBuddy configuration concurrency", () => {
  it("one in-flight clipboard request cannot produce duplicate work or late success after revocation", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    invoke.mockReset();
    invoke.mockResolvedValueOnce({ supported: true, ready: true, installed: true, enabled: true,
      mcpLaunch: { command: "/fixture/node", args: ["/fixture/creatoros.cjs", "mcp", "serve"], env: { CREATOROS_BASE_URL: "" } } })
      .mockResolvedValueOnce({ supported: true, ready: true, enabled: false });
    render(<CliAccessCard />);
    const copy = await screen.findByRole("button", { name: "复制 MCP 配置" });
    fireEvent.click(copy); fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "关闭并记住" }));
    await screen.findByText("未开启");
    resolve();
    await waitFor(() => expect(screen.queryByText(/已复制配置/)).not.toBeInTheDocument());
  });
});
