import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { WorkbenchPreviewFrame } from "./workbench-preview-frame";

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  (window as unknown as Record<string, unknown>).__CREATOROS_HANDSHAKE_TOKEN__ = "launch-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  delete (window as unknown as Record<string, unknown>).__CREATOROS_HANDSHAKE_TOKEN__;
});

const props = { taskId: "task-1", artifactId: "wa-1", version: 2, accountId: "account-1" };
const response = (mime: string, body: BodyInit) => new Response(body, { headers: { "x-workbench-mime": mime } });

describe("工作台隔离预览组件", () => {
  it("带握手头读取 HTML，再装入无脚本、opaque origin 的 iframe", async () => {
    const fetch = vi.fn().mockResolvedValue(response("text/html", "<h1>离线图表</h1><script>evil()</script>"));
    vi.stubGlobal("fetch", fetch);
    render(<WorkbenchPreviewFrame {...props} />);
    const frame = await screen.findByTitle("任务产物预览") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    expect(frame.getAttribute("srcdoc")).toContain("script-src 'none'");
    expect(frame.getAttribute("srcdoc")).toContain("connect-src 'none'");
    expect(frame.getAttribute("srcdoc")).toContain("<h1>离线图表</h1>");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/workbench-preview/task-1/wa-1/2",
      expect.objectContaining({ headers: {
        "x-creatoros-handshake": "launch-token", "x-account-id": "account-1",
      }, credentials: "same-origin" }),
    );
  });

  it("Markdown 作为转义后的静态文本显示", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("text/markdown", "# 标题 <script>evil()</script>")));
    render(<WorkbenchPreviewFrame {...props} />);
    const frame = await screen.findByTitle("任务产物预览");
    expect(frame.getAttribute("srcdoc")).toContain("&lt;script&gt;evil()&lt;/script&gt;");
    expect(frame.getAttribute("sandbox")).toBe("");
  });

  it("切换账号立即隐藏旧预览，旧请求完成不能回写", async () => {
    let resolveOld!: (value: Response) => void;
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      const headers = options.headers as Record<string, string>;
      if (headers["x-account-id"] === "account-1") return new Promise<Response>(resolve => { resolveOld = resolve; });
      return Promise.resolve(response("text/html", "<p>新账号</p>"));
    });
    vi.stubGlobal("fetch", fetch);
    const view = render(<WorkbenchPreviewFrame {...props} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    view.rerender(<WorkbenchPreviewFrame {...props} accountId="account-2" />);
    const frame = await screen.findByTitle("任务产物预览");
    expect(frame.getAttribute("srcdoc")).toContain("新账号");
    await act(async () => { resolveOld(response("text/html", "<p>旧账号</p>")); });
    expect(frame.getAttribute("srcdoc")).toContain("新账号");
    expect(frame.getAttribute("srcdoc")).not.toContain("旧账号");
  });

  it("PNG 只作为本地图片 Blob 显示，并在卸载时释放", async () => {
    URL.createObjectURL = vi.fn(() => "blob:preview-png");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("image/png", new Uint8Array([137, 80, 78, 71]))));
    const view = render(<WorkbenchPreviewFrame {...props} />);
    const image = await screen.findByAltText("任务产物预览");
    expect(image.getAttribute("src")).toBe("blob:preview-png");
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-png");
  });

  it("PDF 放进无权限 iframe，卸载时撤销 Blob URL", async () => {
    URL.createObjectURL = vi.fn(() => "blob:preview-pdf");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("application/pdf", "%PDF-1.7")));
    const view = render(<WorkbenchPreviewFrame {...props} />);
    const frame = await screen.findByTitle("任务产物预览");
    expect(frame.getAttribute("src")).toBe("blob:preview-pdf");
    expect(frame.getAttribute("sandbox")).toBe("");
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-pdf");
  });
});
