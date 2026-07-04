import { describe, it, expect, vi } from "vitest";
import {
  captureUrl,
  detectLoginWall,
  WebCaptureError,
  type CaptureCapableContext,
  type CaptureCapablePage,
} from "./web-capture";

// web-capture 单测(T-084b,SPEC §2.1)—— openContext 端口注入,不起真 Chromium。
// 覆盖三类诚实报错:导航打不开(goto reject)/ HTTP 4xx-5xx / 登录墙·验证码启发式;
// 以及成功路径(返回 PNG 字节 + finalUrl + title)。

// 造一个 fake page/context:各能力可按用例覆写,记录 close/screenshot 调用。
function makeFakeContext(over: {
  gotoReject?: Error;
  status?: number;
  finalUrl?: string;
  html?: string;
  title?: string;
  screenshotBytes?: Uint8Array;
}): { ctx: CaptureCapableContext; calls: { closed: number; shot: number } } {
  const calls = { closed: 0, shot: 0 };
  const page: CaptureCapablePage = {
    goto: async () => {
      if (over.gotoReject) throw over.gotoReject;
      return {
        status: () => over.status ?? 200,
        url: () => over.finalUrl ?? "https://example.com/final",
      };
    },
    url: () => over.finalUrl ?? "https://example.com/final",
    title: async () => over.title ?? "示例页标题",
    content: async () => over.html ?? "<html><body>公开内容</body></html>",
    screenshot: async () => {
      calls.shot += 1;
      return over.screenshotBytes ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG 魔数头
    },
  };
  const ctx: CaptureCapableContext = {
    newPage: async () => page,
    close: async () => {
      calls.closed += 1;
    },
  };
  return { ctx, calls };
}

describe("captureUrl — 成功路径", () => {
  it("公开页 → 返回 PNG 字节 + finalUrl + title,且 close 一次", async () => {
    const { ctx, calls } = makeFakeContext({
      status: 200,
      finalUrl: "https://example.com/post",
      title: "一篇公开文章",
    });
    const res = await captureUrl(
      "https://example.com/post",
      { fullPage: true },
      { openContext: async () => ctx },
    );
    expect(res.contentType).toBe("image/png");
    expect(res.bytes.byteLength).toBeGreaterThan(0);
    expect(res.finalUrl).toBe("https://example.com/post");
    expect(res.title).toBe("一篇公开文章");
    expect(calls.shot).toBe(1);
    expect(calls.closed).toBe(1); // 自起的无头浏览器必关(finally)
  });
});

describe("captureUrl — 三类诚实报错", () => {
  it("非 http/https URL → WebCaptureError「只支持 http/https」(不开浏览器)", async () => {
    const openContext = vi.fn(async () => makeFakeContext({}).ctx);
    await expect(
      captureUrl("ftp://x/y", {}, { openContext }),
    ).rejects.toThrow(WebCaptureError);
    expect(openContext).not.toHaveBeenCalled();
  });

  it("导航失败(超时/DNS)→ WebCaptureError「页面打不开」+ close 一次", async () => {
    const { ctx, calls } = makeFakeContext({
      gotoReject: new Error("Timeout 20000ms exceeded"),
    });
    await expect(
      captureUrl("https://down.example.com", {}, { openContext: async () => ctx }),
    ).rejects.toThrow(/页面打不开/);
    expect(calls.closed).toBe(1);
  });

  it("HTTP 4xx/5xx → WebCaptureError 带状态码", async () => {
    const { ctx } = makeFakeContext({ status: 404 });
    await expect(
      captureUrl("https://example.com/gone", {}, { openContext: async () => ctx }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("登录墙 / 验证码启发式命中 → WebCaptureError「需要登录/有反爬验证」(不产垃圾图)", async () => {
    const { ctx, calls } = makeFakeContext({
      status: 200,
      finalUrl: "https://site.example.com/article",
      html: "<html><body>请先登录后查看全文</body></html>",
    });
    await expect(
      captureUrl("https://site.example.com/article", {}, { openContext: async () => ctx }),
    ).rejects.toThrow(/需要登录|反爬验证/);
    expect(calls.shot).toBe(0); // 命中启发式在截图前抛,不产图
    expect(calls.closed).toBe(1);
  });

  it("重定向到 /login → 登录墙报错(URL 启发式)", async () => {
    const { ctx } = makeFakeContext({
      status: 200,
      finalUrl: "https://app.example.com/login?next=/post",
      html: "<html><body>ok</body></html>",
    });
    await expect(
      captureUrl("https://app.example.com/post", {}, { openContext: async () => ctx }),
    ).rejects.toThrow(/需要登录|反爬验证/);
  });

  it("空截图字节 → WebCaptureError「页面渲染为空」", async () => {
    const { ctx } = makeFakeContext({
      status: 200,
      screenshotBytes: new Uint8Array(0),
    });
    await expect(
      captureUrl("https://blank.example.com", {}, { openContext: async () => ctx }),
    ).rejects.toThrow(/渲染为空/);
  });
});

describe("detectLoginWall — 启发式纯函数", () => {
  it("URL 命中登录路径 → true", () => {
    expect(detectLoginWall("https://x.com/signin", "<html></html>")).toBe(true);
    expect(detectLoginWall("https://accounts.google.com/o/oauth", "")).toBe(true);
  });
  it("正文命中验证码/登录墙特征 → true", () => {
    expect(detectLoginWall("https://x.com/a", "扫码登录才能看")).toBe(true);
    expect(detectLoginWall("https://x.com/a", "Please verify you are human")).toBe(true);
  });
  it("正常公开页 → false(不误判)", () => {
    expect(
      detectLoginWall("https://blog.example.com/post", "<h1>正文内容</h1>"),
    ).toBe(false);
  });
});
