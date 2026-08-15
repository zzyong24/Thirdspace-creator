import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    const button = await screen.findByRole("button", { name: "本次启动开启" });
    fireEvent.click(button);

    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("cli_access_enable"));
    expect(screen.getByText("本次启动已开启")).toBeInTheDocument();
    expect(screen.getByText(/完整读写调用/)).toBeInTheDocument();
  });

  it("已开启时可立即撤销", async () => {
    invoke
      .mockResolvedValueOnce({ supported: true, ready: true, enabled: true, productId: "creatoros", expiresAt: 1_800_000_000_000 })
      .mockResolvedValueOnce({ supported: true, ready: true, enabled: false, productId: "creatoros", expiresAt: null });

    render(<CliAccessCard />);
    const button = await screen.findByRole("button", { name: "立即撤销" });
    fireEvent.click(button);

    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("cli_access_revoke"));
    expect(screen.getByText("未开启")).toBeInTheDocument();
  });

  it("浏览器版不渲染假开关", async () => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    render(<CliAccessCard />);

    expect(await screen.findByText(/浏览器版不提供本机 CLI 授权/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "本次启动开启" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});
