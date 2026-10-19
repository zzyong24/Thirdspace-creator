import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivateForm } from "./activate-form";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/desktop-updater", () => ({ isDesktopRuntimeClient: () => false }));

function readable(element: HTMLElement) {
  expect(element.className).toContain("text-base");
  expect(element.className).not.toMatch(/(?:^|\s)text-sm(?:\s|$)/);
}

describe("激活表单可读反馈与原流程", () => {
  beforeEach(() => { vi.restoreAllMocks(); replace.mockReset(); refresh.mockReset(); });

  it("空提交立即显示可读错误，不发送激活请求", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<ActivateForm />);
    readable(screen.getByText("激活码", { selector: "label" }));
    const input = screen.getByRole("textbox", { name: "激活码" });
    readable(input);
    expect(input.className).toContain("md:text-base");
    readable(screen.getByRole("button", { name: "激活" }));
    fireEvent.submit(screen.getByTestId("activate-form"));
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("请输入激活码。"); readable(error);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(fetch).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  });

  it("等待即时可读且防重复；失败保输入，用户可明确再次提交", async () => {
    let finish!: (value: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(<ActivateForm />);
    fireEvent.change(screen.getByRole("textbox", { name: "激活码" }), { target: { value: "LOCAL-SYNTHETIC-ONLY" } });
    fireEvent.submit(screen.getByTestId("activate-form"));
    const waiting = screen.getByRole("button", { name: "激活中…" });
    expect(waiting).toBeDisabled(); readable(waiting);
    fireEvent.submit(screen.getByTestId("activate-form")); expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Response(JSON.stringify({ message: "连接暂不可用，请稍后重试。" }), { status: 503 })));
    const error = screen.getByRole("alert"); readable(error);
    expect(error).toHaveTextContent("连接暂不可用，请稍后重试。");
    expect(screen.getByRole("textbox", { name: "激活码" })).toHaveValue("LOCAL-SYNTHETIC-ONLY");
    expect(screen.getByRole("button", { name: "激活" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1); expect(replace).not.toHaveBeenCalled();
    await act(async () => fireEvent.submit(screen.getByTestId("activate-form")));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledWith("/"); expect(refresh).toHaveBeenCalledTimes(1);
  });
});
