import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExternalLinkOpener } from "./external-link-opener";

describe("ExternalLinkOpener 桌面可信外链降级（TEST-TSB-009）", () => {
  afterEach(() => {
    document.documentElement.dataset.desktop = "0";
    vi.restoreAllMocks();
  });

  it("页面代码不持有握手 token；403/失败不绕过 adapter 调 window.open", async () => {
    document.documentElement.dataset.desktop = "1";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false }), { status: 403 }),
      );
    const openMock = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <>
        <ExternalLinkOpener />
        <a href="https://growth.example.com/feedback?q=1#form">反馈</a>
      </>,
    );

    fireEvent.click(document.querySelector("a")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      "content-type": "application/json",
    });
    expect(openMock).not.toHaveBeenCalled();
  });

  it("仅 route 明确 desktop=false 时允许 web/dev window.open 兜底", async () => {
    document.documentElement.dataset.desktop = "1";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, desktop: false })),
    );
    const openMock = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <>
        <ExternalLinkOpener />
        <a href="https://support.example.com/help">售后</a>
      </>,
    );

    fireEvent.click(document.querySelector("a")!);
    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith(
        "https://support.example.com/help",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });
});
