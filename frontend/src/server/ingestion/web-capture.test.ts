import { describe, it, expect, vi } from "vitest";
import {
  captureUrl,
  detectLoginWall,
  WebCaptureError,
  isBlockedHttpCaptureError,
  type CaptureCapableContext,
  type CaptureCapablePage,
} from "./web-capture";

// web-capture 单测(T-084b,SPEC §2.1)—— openContext 端口注入,不起真 Chromium。
// 覆盖三类诚实报错:导航打不开(goto reject)/ HTTP 4xx-5xx / 登录墙·验证码启发式;
// 以及成功路径(返回 PNG 字节 + finalUrl + title)。

// [T-326·RT-H04] 默认 SSRF 守卫会 DNS 解析域名 —— mock 掉 node:dns/promises 让既有用例的
// example.com 等域名都「解析到公网 IP」,单测不打真 DNS、不受网络环境影响。
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

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

  it("[T-390] HTTP 错误携带结构化 status(供多路回退判定,不解析 message)", async () => {
    const { ctx } = makeFakeContext({ status: 403 });
    const err = await captureUrl("https://blocked.example.com", {}, {
      openContext: async () => ctx,
    }).catch((e) => e as unknown);
    expect(err).toBeInstanceOf(WebCaptureError);
    expect((err as WebCaptureError).status).toBe(403);
    // 判定纯函数:403/5xx 算「被拒」,404 不触发登录态重试(下架≠反爬)。
    expect(isBlockedHttpCaptureError(err)).toBe(true);
    expect(
      isBlockedHttpCaptureError(new WebCaptureError("x", { status: 500 })),
    ).toBe(true);
    expect(
      isBlockedHttpCaptureError(new WebCaptureError("x", { status: 404 })),
    ).toBe(false);
    expect(isBlockedHttpCaptureError(new WebCaptureError("打不开"))).toBe(false);
    expect(isBlockedHttpCaptureError(new Error("HTTP 403"))).toBe(false);
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
  it("[T-221] ChatGPT 分享页登出态登录门(Log in to get answers)→ true", () => {
    // 用户实测:未登录读 chatgpt share 读出「Log in to get answers」当正文;命中 → web.read 走 needLogin。
    expect(
      detectLoginWall(
        "https://chatgpt.com/share/abc",
        "<html><body><button>Log in to get answers</button></body></html>",
      ),
    ).toBe(true);
    expect(
      detectLoginWall(
        "https://chatgpt.com/share/abc",
        "<div>Log in to get smarter responses, upload files…</div>",
      ),
    ).toBe(true);
  });
  it("正常公开页 → false(不误判)", () => {
    expect(
      detectLoginWall("https://blog.example.com/post", "<h1>正文内容</h1>"),
    ).toBe(false);
    // 普通页含 "log in" 但非 ChatGPT 门特有短语 → 不误伤。
    expect(
      detectLoginWall("https://blog.example.com/post", "<a>Log in</a> 页脚"),
    ).toBe(false);
  });
  it("[T-311] 关键词仅出现在内联 <script>/JSON(如 GitHub octocaptcha 开关)→ false(不误报未登录)", () => {
    // 用户实测:登录了 GitHub 仍报未登录。真因=GitHub 登录后首页内联 JS 含 feature-flag
    //   "octocaptcha_origin_optimization",裸 "captcha" 撞整段 HTML 误命中。剥 script 后可见正文无 captcha。
    const gh = `<html><head><meta name="user-login" content="zzyong24"><script type="application/json">{"features":["octocaptcha_origin_optimization","swp_forms_disable_octocaptcha"]}</script></head><body><h1>Home</h1><nav>Dashboard</nav></body></html>`;
    expect(detectLoginWall("https://github.com/", gh)).toBe(false);
    // 反向保证:真验证码页的可见文案照样命中。
    expect(
      detectLoginWall("https://x.com/a", "<body>请完成验证码后继续</body>"),
    ).toBe(true);
  });
  it("[T-488] 隐藏登录弹窗里的“扫码登录”不应覆盖已登录页的可见正文", () => {
    const html = `
      <html><body>
        <main><h1>真实视频标题</h1><p>这是已登录后可见的作品正文。</p></main>
        <div aria-hidden="true"><button>扫码登录</button></div>
        <section hidden>请先登录</section>
        <aside style="display: none">登录后查看</aside>
      </body></html>
    `;
    expect(
      detectLoginWall(
        "https://www.douyin.com/video/7300000000000000000",
        html,
      ),
    ).toBe(false);
  });
});

// ── [T-239c S2] 长工具可中断:signal 提前退出(不空烧浏览器)────────────────────────
describe("[T-239c] captureUrl — AbortSignal 提前退出", () => {
  it("入口已中断的 signal → 立刻抛 AbortError,不开浏览器", async () => {
    const openContext = vi.fn(async () => makeFakeContext({}).ctx);
    const ac = new AbortController();
    ac.abort();
    await expect(
      captureUrl("https://example.com", { signal: ac.signal }, { openContext }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(openContext).not.toHaveBeenCalled();
  });

  it("导航挂起时中断 → 关 context 让 goto reject,改抛 AbortError(不误报「页面打不开」)", async () => {
    // goto 挂起直到 close 被调(模拟真 Playwright:关 context 时挂起导航 reject)。
    const calls = { closed: 0 };
    let rejectGoto: ((e: Error) => void) | null = null;
    const page: CaptureCapablePage = {
      goto: () =>
        new Promise((_resolve, reject) => {
          rejectGoto = reject;
        }),
      url: () => "https://example.com",
      title: async () => "",
      content: async () => "",
      screenshot: async () => new Uint8Array([1]),
    };
    const ctx: CaptureCapableContext = {
      newPage: async () => page,
      close: async () => {
        calls.closed += 1;
        rejectGoto?.(new Error("Target page, context or browser has been closed"));
      },
    };
    const ac = new AbortController();
    const pending = captureUrl(
      "https://example.com",
      { signal: ac.signal },
      { openContext: async () => ctx },
    );
    // 让 goto 先挂起,再中断(用户点「停止」)。
    await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    // abort 监听 + finally 都会 close(幂等,≥1 次即真关了浏览器)。
    expect(calls.closed).toBeGreaterThanOrEqual(1);
  });

  it("无 signal(旧调用面)→ 行为不变(成功路径回归)", async () => {
    const { ctx } = makeFakeContext({ title: "公开页" });
    const res = await captureUrl(
      "https://example.com",
      {},
      { openContext: async () => ctx },
    );
    expect(res.title).toBe("公开页");
  });
});

// ── [T-326·RT-H04] SSRF 守卫接入 captureUrl:私网/元数据前置拒(不开浏览器)+ 重定向逐跳复检 ──
describe("[T-326·RT-H04] captureUrl — SSRF 守卫", () => {
  it("私网/回环/元数据目标 → WebCaptureError(SSRF),且不开浏览器", async () => {
    for (const url of [
      "http://127.0.0.1:8080/admin",
      "http://10.0.0.5/",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://localhost:3000/",
    ]) {
      const openContext = vi.fn(async () => makeFakeContext({}).ctx);
      await expect(
        captureUrl(url, {}, { openContext }),
      ).rejects.toBeInstanceOf(WebCaptureError);
      expect(openContext).not.toHaveBeenCalled(); // 起浏览器之前就拒
    }
  });

  it("合法公网 URL(域名解析到公网 IP)→ 放行,成功截图(不误杀)", async () => {
    const { ctx } = makeFakeContext({ title: "公开文章" });
    const res = await captureUrl(
      "https://example.com/post",
      {},
      { openContext: async () => ctx },
    );
    expect(res.title).toBe("公开文章");
  });

  it("重定向到私网/元数据地址 → 逐跳复检拒绝,不返回截图", async () => {
    // 伪造 Playwright 重定向链:公网起跳 → 169.254.169.254 → 公网落地(finalUrl 公网,
    // 只查 finalUrl 会漏 —— 必须逐跳复检才拦得住)。
    const first = {
      url: () => "https://example.com/start",
      redirectedFrom: () => null,
    };
    const meta = {
      url: () => "http://169.254.169.254/latest/meta-data/",
      redirectedFrom: () => first,
    };
    const finalReq = {
      url: () => "https://example.com/landing",
      redirectedFrom: () => meta,
    };
    const calls = { shot: 0 };
    const page: CaptureCapablePage = {
      goto: async () => ({
        status: () => 200,
        url: () => "https://example.com/landing",
        request: () => finalReq,
      }),
      url: () => "https://example.com/landing",
      title: async () => "落地页",
      content: async () => "<html><body>正常内容</body></html>",
      screenshot: async () => {
        calls.shot += 1;
        return new Uint8Array([1]);
      },
    };
    const ctx: CaptureCapableContext = {
      newPage: async () => page,
      close: async () => {},
    };
    await expect(
      captureUrl("https://example.com/start", {}, { openContext: async () => ctx }),
    ).rejects.toThrow(/SSRF/);
    expect(calls.shot).toBe(0); // 内容(截图)绝不返回
  });

  it("重定向落到私网 finalUrl(fake resp 无 request 链)→ finalUrl 复检也拦得住", async () => {
    const { ctx, calls } = makeFakeContext({
      status: 200,
      finalUrl: "http://10.0.0.8/internal",
    });
    await expect(
      captureUrl("https://example.com/jump", {}, { openContext: async () => ctx }),
    ).rejects.toThrow(/SSRF/);
    expect(calls.shot).toBe(0);
  });
});
