/**
 * [RT-H01] Loopback 防护单测 —— 证明 isLoopbackRequest 放行本机应用自身请求、拒跨站/DNS-rebinding。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isLoopbackRequest } from "./loopback-guard.server";

function mkReq(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { method: "POST", headers });
}

describe("isLoopbackRequest —— 放行本机应用请求", () => {
  it("装机版:Host+Origin 皆 127.0.0.1:<port> → 放行", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://127.0.0.1:51234/api/v1/dispatch", {
          host: "127.0.0.1:51234",
          origin: "http://127.0.0.1:51234",
        }),
      ),
    ).toBe(true);
  });

  it("dev / vitest:localhost 无端口、无 Origin → 放行", () => {
    expect(
      isLoopbackRequest(mkReq("http://localhost/api/v1/dispatch")),
    ).toBe(true);
  });

  it("同源 POST 但无 Origin 头(webview 省略)+ loopback Host → 放行", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://127.0.0.1:6000/api/chat", { host: "127.0.0.1:6000" }),
      ),
    ).toBe(true);
  });

  it("IPv6 loopback [::1] → 放行", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://[::1]:5000/api/chat", {
          host: "[::1]:5000",
          origin: "http://[::1]:5000",
        }),
      ),
    ).toBe(true);
  });
});

describe("isLoopbackRequest —— 拒跨站 / DNS rebinding / 异常源", () => {
  it("跨站 CSRF:Origin=https://evil.com(Host loopback)→ 拒", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://127.0.0.1:6000/api/v1/dispatch", {
          host: "127.0.0.1:6000",
          origin: "https://evil.com",
        }),
      ),
    ).toBe(false);
  });

  it("DNS rebinding:Host=evil.com(重绑到 127.0.0.1)→ 拒", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://evil.com/api/v1/dispatch", {
          host: "evil.com",
          origin: "http://evil.com",
        }),
      ),
    ).toBe(false);
  });

  it("opaque 源:Origin=null → 拒", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://127.0.0.1:6000/api/chat", {
          host: "127.0.0.1:6000",
          origin: "null",
        }),
      ),
    ).toBe(false);
  });

  it("LAN 访问:Host=192.168.1.10(非 loopback)→ 拒", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://192.168.1.10:6000/api/v1/dispatch", {
          host: "192.168.1.10:6000",
          origin: "http://192.168.1.10:6000",
        }),
      ),
    ).toBe(false);
  });

  it("看似 loopback 前缀的钓鱼域(127.0.0.1.evil.com)→ 拒", () => {
    expect(
      isLoopbackRequest(
        mkReq("http://127.0.0.1.evil.com/api/chat", {
          host: "127.0.0.1.evil.com",
          origin: "http://127.0.0.1.evil.com",
        }),
      ),
    ).toBe(false);
  });
});
