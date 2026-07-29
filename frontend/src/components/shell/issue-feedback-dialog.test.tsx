import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IssueFeedbackDialog } from "./issue-feedback-dialog";

vi.mock("@/lib/desktop-updater", () => ({
  getAppVersion: vi.fn(async () => "0.1.0"),
}));

function runtimeResponse(bugFeedbackUrl: string | null) {
  return {
    runtimeState: bugFeedbackUrl ? "ready" : "unavailable",
    brandName: null,
    purchaseUrl: null,
    renewalUrl: null,
    channelSupportUrl: null,
    bugFeedbackUrl,
    downloadUrl: null,
  };
}

describe("IssueFeedbackDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("[T-546] 正式侧边栏使用布局下传的已验签渠道缓存，重复打开不再读取 channel-runtime", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(
      <IssueFeedbackDialog
        pathname="/"
        collapsed={false}
        bugFeedbackUrl="https://growth.example.com/official-bug-form"
      />,
    );

    const trigger = screen.getByRole("button", { name: "帮助与反馈" });
    await user.click(trigger);
    expect(
      screen.getByRole("button", { name: "打开官方反馈页" }),
    ).toBeEnabled();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("[T-568] 不再把 navigator.platform 的 MacIntel 当作芯片型号", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    render(
      <IssueFeedbackDialog
        pathname="/"
        collapsed={false}
        bugFeedbackUrl={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "帮助与反馈" }));
    const preview = screen.getByLabelText(
      "反馈内容预览",
    ) as HTMLTextAreaElement;
    await waitFor(() => expect(preview.value).toContain("系统：Web 浏览器"));
    expect(preview.value).not.toContain("MacIntel");
  });

  it("copies exactly the visible preview without sending feedback", async () => {
    const writeText = vi.fn(async () => undefined);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            runtimeResponse("https://growth.example.com/official-bug-form"),
          ),
        ),
      );
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<IssueFeedbackDialog pathname="/intelligence?secret=x" collapsed={false} />);

    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    const description = screen.getByLabelText("问题描述");
    await user.type(description, "同步收藏夹后一直提示读取失败");
    await user.click(screen.getByRole("button", { name: "复制反馈内容" }));

    const preview = screen.getByLabelText("反馈内容预览");
    expect(writeText).toHaveBeenCalledWith((preview as HTMLTextAreaElement).value);
    expect(await screen.findByText(/反馈内容已复制/)).toBeInTheDocument();
    expect(screen.queryByText(/已发送|已提交|开发者本人/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? "GET").toBe("GET");
  });

  it("[T-575] Growth 未配置时仍使用官方反馈页降级，且明确不会自动上传日志", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(runtimeResponse(null))),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const user = userEvent.setup();
    render(<IssueFeedbackDialog pathname="/projects/123456789" collapsed={false} />);
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    expect(await screen.findByText(/不会发送日志/)).toBeInTheDocument();
    expect(screen.getByText(/此版本暂不能在应用内发送/)).toBeInTheDocument();
    const channel = screen.getByRole("button", { name: "打开官方反馈页" });
    expect(channel).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "发送问题反馈" }),
    ).not.toBeInTheDocument();
    await user.click(channel);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain(
      "https://my.feishu.cn/share/base/form/",
    );
    await user.type(screen.getByLabelText("问题描述"), "太短");
    await user.click(screen.getByRole("button", { name: "复制反馈内容" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks descriptions over 4000 Unicode characters", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(runtimeResponse(null))),
    );
    render(<IssueFeedbackDialog pathname="/" collapsed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "帮助与反馈" }));
    fireEvent.change(screen.getByLabelText("问题描述"), {
      target: { value: "字".repeat(4001) },
    });
    fireEvent.click(screen.getByRole("button", { name: "复制反馈内容" }));
    expect(screen.getByRole("alert")).toHaveTextContent("不能超过 4000 个字符");
  });

  it("keeps the preview selectable when Clipboard API rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(runtimeResponse(null))),
    );
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    render(<IssueFeedbackDialog pathname="/" collapsed={false} />);
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    await user.type(
      screen.getByLabelText("问题描述"),
      "点击同步收藏夹后一直提示读取失败",
    );
    await user.click(screen.getByRole("button", { name: "复制反馈内容" }));
    expect(await screen.findByText(/复制失败/)).toBeInTheDocument();
    expect(screen.getByLabelText("反馈内容预览")).toHaveAttribute("readonly");
  });

  it("shows truthful success/failure for channel and logs", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            runtimeResponse("https://growth.example.com/official-bug-form"),
          ),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, desktop: false })),
      );
    const user = userEvent.setup();
    render(<IssueFeedbackDialog pathname="/" collapsed={false} />);
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "打开官方反馈页" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "打开官方反馈页" }));
    expect(await screen.findByText(/已请求打开官方反馈页/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看本机日志" }));
    expect(await screen.findByText(/未能打开日志文件夹/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ url: "https://growth.example.com/official-bug-form" }),
    );
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBeUndefined();
  });

  it("recovers buttons after channel failure and log success", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            runtimeResponse("https://growth.example.com/official-bug-form"),
          ),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, desktop: false })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const user = userEvent.setup();
    render(<IssueFeedbackDialog pathname="/" collapsed={false} />);
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    const channelButton = await screen.findByRole("button", {
      name: "打开官方反馈页",
    });
    await waitFor(() => expect(channelButton).toBeEnabled());
    await user.click(channelButton);
    expect(await screen.findByText(/未能打开官方反馈页/)).toBeInTheDocument();
    expect(channelButton).toBeEnabled();

    const logsButton = screen.getByRole("button", {
      name: "查看本机日志",
    });
    await user.click(logsButton);
    expect(await screen.findByText("日志文件夹已打开")).toBeInTheDocument();
    expect(logsButton).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("locks the channel button while the external open request is pending", async () => {
    let resolveOpen: ((response: Response) => void) | undefined;
    const pendingOpen = new Promise<Response>((resolve) => {
      resolveOpen = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            runtimeResponse("https://growth.example.com/official-bug-form"),
          ),
        ),
      )
      .mockImplementationOnce(() => pendingOpen);
    const user = userEvent.setup();
    render(<IssueFeedbackDialog pathname="/" collapsed={false} />);
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    const channelButton = await screen.findByRole("button", {
      name: "打开官方反馈页",
    });
    await waitFor(() => expect(channelButton).toBeEnabled());
    await user.click(channelButton);
    expect(channelButton).toBeDisabled();
    fireEvent.click(channelButton);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveOpen?.(new Response(JSON.stringify({ ok: true })));
    await waitFor(() => expect(channelButton).toBeEnabled());
  });

  it("returns focus to the trigger after Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(runtimeResponse(null))),
    );
    render(<IssueFeedbackDialog pathname="/" collapsed />);
    const trigger = screen.getByRole("button", { name: "帮助与反馈" });
    fireEvent.click(trigger);
    expect(await screen.findByLabelText("问题描述")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("[T-575] 只有真实 202 publicRef 才显示提交成功", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            runtimeResponse("https://growth.example.com/official-bug-form"),
          ),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            publicRef: "FDB-01J7K0T2AB",
            status: "new",
            channelBinding: "verified",
          }),
          { status: 202 },
        ),
      );
    const user = userEvent.setup();
    render(
      <IssueFeedbackDialog
        pathname="/"
        collapsed={false}
        submissionEnabled
      />,
    );
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    await user.type(
      screen.getByLabelText("问题摘要"),
      "导出按钮没有反应",
    );
    await user.type(
      screen.getByLabelText("问题描述"),
      "点击导出后没有文件，也没有错误提示。",
    );
    const submit = screen.getByRole("button", { name: "发送问题反馈" });
    expect(submit).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /我已检查并确认发送上方内容/,
      }),
    );
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(await screen.findByText(/反馈已收到，编号 FDB-01J7K0T2AB/)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/v1/local/product-feedback"),
      ),
    ).toBe(true);
  });

  it("[T-575] 提交失败保留草稿并继续提供复制和官方反馈页", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            runtimeResponse("https://growth.example.com/official-bug-form"),
          ),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            code: "FEEDBACK_AUTHORITY_UNAVAILABLE",
            message: "反馈服务暂时不可用，请稍后重试",
            retryable: true,
          }),
          { status: 503 },
        ),
      );
    const user = userEvent.setup();
    render(
      <IssueFeedbackDialog
        pathname="/"
        collapsed={false}
        submissionEnabled
      />,
    );
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    await user.type(screen.getByLabelText("问题摘要"), "同步按钮没有反应");
    const description = screen.getByLabelText("问题描述");
    await user.type(description, "点击同步按钮后一直没有任何状态变化。");
    await user.click(
      screen.getByRole("checkbox", {
        name: /我已检查并确认发送上方内容/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "发送问题反馈" }));

    expect(await screen.findByText(/反馈服务暂时不可用/)).toBeInTheDocument();
    expect(description).toHaveValue("点击同步按钮后一直没有任何状态变化。");
    expect(screen.getByRole("button", { name: "复制反馈内容" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "打开官方反馈页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重新发送" })).toBeEnabled();
    expect(screen.queryByText(/反馈已收到/)).not.toBeInTheDocument();
  });

  it("[T-575] 失败后关闭再打开仍用同一请求标识重试，只有编辑文字才换新标识", async () => {
    const failedResponse = () =>
      new Response(
        JSON.stringify({
          ok: false,
          code: "FEEDBACK_AUTHORITY_UNAVAILABLE",
          message: "反馈服务暂时不可用，请稍后重试",
          retryable: true,
        }),
        { status: 503 },
      );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failedResponse())
      .mockResolvedValueOnce(failedResponse());
    const user = userEvent.setup();
    render(
      <IssueFeedbackDialog
        pathname="/"
        collapsed={false}
        bugFeedbackUrl="https://growth.example.com/official-bug-form"
        submissionEnabled
      />,
    );

    const trigger = screen.getByRole("button", { name: "帮助与反馈" });
    await user.click(trigger);
    await user.type(screen.getByLabelText("问题摘要"), "同步按钮没有反应");
    await user.type(
      screen.getByLabelText("问题描述"),
      "点击同步按钮后一直没有任何状态变化。",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /我已检查并确认发送上方内容/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "发送问题反馈" }));
    expect(await screen.findByText(/反馈服务暂时不可用/)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(screen.getByLabelText("问题描述")).toHaveValue(
      "点击同步按钮后一直没有任何状态变化。",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /我已检查并确认发送上方内容/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "发送问题反馈" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstKey = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
      .get("Idempotency-Key");
    const secondKey = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
      .get("Idempotency-Key");
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondKey).toBe(firstKey);
  });

  it("[T-575] 编辑草稿会撤销本次确认，未重新确认时零提交", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            runtimeResponse("https://growth.example.com/official-bug-form"),
          ),
        ),
      );
    const user = userEvent.setup();
    render(
      <IssueFeedbackDialog
        pathname="/"
        collapsed={false}
        submissionEnabled
      />,
    );
    await user.click(screen.getByRole("button", { name: "帮助与反馈" }));
    await user.type(screen.getByLabelText("问题摘要"), "同步按钮没有反应");
    await user.type(
      screen.getByLabelText("问题描述"),
      "点击同步按钮后一直没有任何状态变化。",
    );
    const consent = screen.getByRole("checkbox", {
      name: /我已检查并确认发送上方内容/,
    });
    await user.click(consent);
    expect(consent).toBeChecked();

    await user.type(screen.getByLabelText("问题描述"), " 我补充了一段说明。");

    expect(consent).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "发送问题反馈" }),
    ).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/v1/local/product-feedback"),
      ),
    ).toBe(false);
  });
});
