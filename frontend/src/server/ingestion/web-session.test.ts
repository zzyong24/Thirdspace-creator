import { describe, it, expect, vi } from "vitest";

import {
  webDomainFromUrl,
  hasSessionCookie,
  loginWeb,
  checkWebSessionStatus,
  type WebSessionCapableContext,
  type WebSessionCapablePage,
} from "./web-session";

// [T-217a] Web Session Vault 纯逻辑 + 端口注入单测(不起真浏览器 —— openContext 注 fake ctx)。

describe("webDomainFromUrl", () => {
  it("取 hostname、小写、去前导 www.(chatgpt.com/share 归一)", () => {
    expect(webDomainFromUrl("https://www.chatgpt.com/share/abc")).toBe("chatgpt.com");
    expect(webDomainFromUrl("https://ChatGPT.com/share/x")).toBe("chatgpt.com");
    expect(webDomainFromUrl("http://zhuanlan.zhihu.com/p/123")).toBe("zhuanlan.zhihu.com");
  });
  it("非 http(s) / 非法 URL 抛错", () => {
    expect(() => webDomainFromUrl("ftp://x.com")).toThrow();
    expect(() => webDomainFromUrl("not a url")).toThrow();
  });
});

describe("hasSessionCookie(启发式,不硬编码单一 cookie 名)", () => {
  it("命中常见会话 cookie 名", () => {
    expect(hasSessionCookie([{ name: "sessionid" }])).toBe(true);
    expect(hasSessionCookie([{ name: "__Secure-next-auth.session-token" }])).toBe(true);
    expect(hasSessionCookie([{ name: "laravel_session" }])).toBe(true);
    expect(hasSessionCookie([{ name: "logged_in" }])).toBe(true);
  });
  it("无会话 cookie(仅埋点/CF cookie)→ false", () => {
    expect(hasSessionCookie([{ name: "__cf_bm" }, { name: "_ga" }])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });
});

// fake ctx 工厂:cookies() 按调用序返回不同结果(模拟登录中 cookie 逐渐出现)。
function makeCtx(cookieSequence: Array<Array<{ name: string }>>): {
  ctx: WebSessionCapableContext;
  closed: () => boolean;
} {
  let call = 0;
  let closed = false;
  const page: WebSessionCapablePage = {
    goto: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined), // 立即 resolve,单测不真等
  };
  const ctx: WebSessionCapableContext = {
    pages: () => [page],
    newPage: async () => page,
    cookies: async () => {
      const idx = Math.min(call, cookieSequence.length - 1);
      call += 1;
      return cookieSequence[idx];
    },
    close: async () => {
      closed = true;
    },
  };
  return { ctx, closed: () => closed };
}

describe("loginWeb(泛化 douyin-cdp 登录轮询)", () => {
  it("会话 cookie 出现即成功,并关闭自起浏览器", async () => {
    const { ctx, closed } = makeCtx([
      [{ name: "__cf_bm" }], // 第 1 次:未登录
      [{ name: "__cf_bm" }, { name: "__Secure-next-auth.session-token" }], // 第 2 次:登录态出现
    ]);
    const res = await loginWeb(
      { authDir: "/tmp/x", url: "https://chatgpt.com", domain: "chatgpt.com", timeoutSec: 5 },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(true);
    expect(closed()).toBe(true);
  });

  it("超时内 cookie 始终不出现 → loggedIn=false", async () => {
    const { ctx } = makeCtx([[{ name: "__cf_bm" }]]);
    const res = await loginWeb(
      { authDir: "/tmp/x", url: "https://x.com", domain: "x.com", timeoutSec: 3 },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(false);
  });
});

describe("checkWebSessionStatus(headless 被动探针,不弹窗)", () => {
  it("有会话 cookie → loggedIn=true", async () => {
    const { ctx } = makeCtx([[{ name: "sessionid" }]]);
    const res = await checkWebSessionStatus(
      { authDir: "/tmp/x", domain: "chatgpt.com" },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(true);
  });
  it("profile 存在但无有效会话(过期)→ loggedIn=false", async () => {
    const { ctx, closed } = makeCtx([[{ name: "__cf_bm" }]]);
    const res = await checkWebSessionStatus(
      { authDir: "/tmp/x", domain: "chatgpt.com" },
      { openContext: async () => ctx },
    );
    expect(res.loggedIn).toBe(false);
    expect(closed()).toBe(true);
  });
});
