/**
 * [T-415 P0-B] 全局 default-deny 代理单测 —— 把 T-413 复测实测的「谁被守/谁裸奔」固化为回归锚。
 *
 * 命门回放:此前 knowledge/* 等路由裸奔,裸 `node server.js` 打 /api/knowledge/distill 直接进业务。
 *   这里断言:桌面态缺/错握手 → 敏感面(/api + server action)一律 403;allowlist 与非桌面态不受影响。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const TOKEN = "handshake-token-xyz";
const BASE = "http://127.0.0.1:5000";

function makeReq(
  path: string,
  opts: {
    method?: string;
    handshake?: string;
    nextAction?: string;
    origin?: string | null;
  } = {},
): NextRequest {
  const { method = "GET", handshake, nextAction, origin = BASE } = opts;
  const headers = new Headers({ host: "127.0.0.1:5000" });
  if (origin) headers.set("origin", origin);
  if (handshake) headers.set("x-creatoros-handshake", handshake);
  if (nextAction) headers.set("next-action", nextAction);
  return new NextRequest(`${BASE}${path}`, { method, headers });
}

const denied = (r: NextRequest) => proxy(r).status === 403;

describe("proxy default-deny (T-415)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.CREATOROS_HANDSHAKE_REQUIRED;
    delete process.env.CREATOROS_SIDECAR_HANDSHAKE_TOKEN;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  describe("桌面打包态(REQUIRED 烘焙=1,Rust 注入 token)", () => {
    beforeEach(() => {
      process.env.CREATOROS_HANDSHAKE_REQUIRED = "1";
      process.env.CREATOROS_SIDECAR_HANDSHAKE_TOKEN = TOKEN;
    });

    it("缺握手头 → knowledge/* 被 403(修复裸奔命门)", () => {
      expect(denied(makeReq("/api/knowledge/distill", { method: "POST" }))).toBe(true);
      expect(denied(makeReq("/api/knowledge/search", { method: "POST" }))).toBe(true);
      expect(denied(makeReq("/api/knowledge/comment-sift", { method: "POST" }))).toBe(true);
    });

    it("缺握手头 → 原本就被守的 chat/dispatch 仍 403", () => {
      expect(denied(makeReq("/api/chat", { method: "POST" }))).toBe(true);
      expect(denied(makeReq("/api/v1/dispatch", { method: "POST" }))).toBe(true);
    });

    it("错握手头 → 403", () => {
      expect(denied(makeReq("/api/knowledge/distill", { method: "POST", handshake: "wrong" }))).toBe(true);
    });

    it("正确握手头 → 放行(真机路径不被误伤)", () => {
      expect(denied(makeReq("/api/knowledge/distill", { method: "POST", handshake: TOKEN }))).toBe(false);
      expect(denied(makeReq("/api/chat", { method: "POST", handshake: TOKEN }))).toBe(false);
    });

    it("跨站 Origin 即便带对 token 也 403(loopback 双校验)", () => {
      expect(
        denied(makeReq("/api/knowledge/distill", { method: "POST", handshake: TOKEN, origin: "https://evil.com" })),
      ).toBe(true);
    });

    it("server action(POST + Next-Action)缺握手 → 403;带握手 → 放行", () => {
      expect(denied(makeReq("/projects/new", { method: "POST", nextAction: "abc123" }))).toBe(true);
      expect(denied(makeReq("/projects/new", { method: "POST", nextAction: "abc123", handshake: TOKEN }))).toBe(false);
    });

    it("allowlist(blob/activate/auth)缺握手也放行", () => {
      expect(denied(makeReq("/api/v1/blob/xyz.png"))).toBe(false);
      expect(denied(makeReq("/api/v1/activate", { method: "POST" }))).toBe(false);
      expect(denied(makeReq("/api/v1/auth/login", { method: "POST" }))).toBe(false);
    });

    it("普通页面导航(GET,无 Next-Action)放行,不被 default-deny 误伤(防白屏)", () => {
      expect(denied(makeReq("/projects/new"))).toBe(false);
      expect(denied(makeReq("/"))).toBe(false);
    });
  });

  describe("web/dev 态(未烘焙、无 token)→ 强制整体不启用", () => {
    it("缺握手头也放行所有 /api(行为与改动前一致)", () => {
      expect(denied(makeReq("/api/knowledge/distill", { method: "POST" }))).toBe(false);
      expect(denied(makeReq("/api/chat", { method: "POST" }))).toBe(false);
    });
  });
});
