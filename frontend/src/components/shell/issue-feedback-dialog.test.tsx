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

    const trigger = screen.getByRole("button", { name: "问题反馈" });
    await user.click(trigger);
    expect(
      screen.getByRole("button", { name: "打开反馈渠道" }),
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
    fireEvent.click(screen.getByRole("button", { name: "问题反馈" }));
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

    await user.click(screen.getByRole("button", { name: "问题反馈" }));
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

  it("[T-546] Growth 未配置时仍使用飞书降级渠道，且引导压缩日志后手动上传", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(runtimeResponse(null))),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const user = userEvent.setup();
    render(<IssueFeedbackDialog pathname="/projects/123456789" collapsed={false} />);
    await user.click(screen.getByRole("button", { name: "问题反馈" }));
    expect(await screen.findByText(/压缩为 zip/)).toBeInTheDocument();
    expect(screen.getByText(/手动上传/)).toBeInTheDocument();
    const channel = screen.getByRole("button", { name: "打开反馈渠道" });
    expect(channel).toBeEnabled();
    expect(screen.getByRole("button", { name: "发送问题反馈" })).toBeDisabled();
    await user.click(channel);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain(
      "https://my.feishu.cn/share/base/form/",
    );
    await user.type(screen.getByLabelText("问题描述"), "太短");
    await user.click(screen.getByRole("button", { name: "复制反馈内容" }));
    expect(screen.getByRole("alert")).toHaveTextContent("至少 10 个字符");
  });

  it("blocks descriptions over 4000 Unicode characters", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(runtimeResponse(null))),
    );
    render(<IssueFeedbackDialog pathname="/" collapsed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "问题反馈" }));
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
    await user.click(screen.getByRole("button", { name: "问题反馈" }));
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
    await user.click(screen.getByRole("button", { name: "问题反馈" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "打开反馈渠道" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "打开反馈渠道" }));
    expect(await screen.findByText(/已请求打开反馈渠道/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "打开日志文件夹" }));
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
    await user.click(screen.getByRole("button", { name: "问题反馈" }));
    const channelButton = await screen.findByRole("button", {
      name: "打开反馈渠道",
    });
    await waitFor(() => expect(channelButton).toBeEnabled());
    await user.click(channelButton);
    expect(await screen.findByText(/未能打开反馈渠道/)).toBeInTheDocument();
    expect(channelButton).toBeEnabled();

    const logsButton = screen.getByRole("button", {
      name: "打开日志文件夹",
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
    await user.click(screen.getByRole("button", { name: "问题反馈" }));
    const channelButton = await screen.findByRole("button", {
      name: "打开反馈渠道",
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
    const trigger = screen.getByRole("button", { name: "问题反馈" });
    fireEvent.click(trigger);
    expect(await screen.findByLabelText("问题描述")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("[T-546] 自动发送明确禁用，不调用 product-feedback 假装已经提交", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          runtimeResponse("https://growth.example.com/official-bug-form"),
        ),
      ),
    );
    const user = userEvent.setup();
    render(<IssueFeedbackDialog pathname="/" collapsed={false} />);
    await user.click(screen.getByRole("button", { name: "问题反馈" }));
    const submit = screen.getByRole("button", { name: "发送问题反馈" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/v1/local/product-feedback"),
      ),
    ).toBe(false);
  });
});
