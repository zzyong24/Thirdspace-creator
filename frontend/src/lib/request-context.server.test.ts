/**
 * resolveRequestContext 回归测(失效 cookie 回落健壮化)。
 *
 * 真凶复盘:清库(down -v 清 sessions 表)后浏览器残留旧 httpOnly session cookie → 每个
 * dispatch 请求带失效 token → resolveContextFromToken 抛 AuthenticationError。本应「回落本机
 * 主用户」,但判断用了纯 `err instanceof AuthenticationError` —— Next server bundle 把该类复制
 * 成多份实例(跨 chunk),instanceof 漏判 → 失效 token 裸抛 → 全站 dispatch 500(审核规则/所有
 * 读写)。修:回落判断改用结构化 code/name(跨 bundle 边界稳定)。本测锁死该行为。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const resolveContextFromToken = vi.fn();
const resolveLocalContext = vi.fn();
vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
  }),
}));

import { resolveRequestContext } from "./request-context.server";

const LOCAL = { userId: "user-zyongzhu", requestId: "r", source: "user" as const };

beforeEach(() => {
  resolveContextFromToken.mockReset();
  resolveLocalContext.mockReset();
  resolveLocalContext.mockResolvedValue(LOCAL);
});

describe("resolveRequestContext — 失效 cookie 回落本机主用户", () => {
  it("无 token → 直接本机主用户(不验 token)", async () => {
    const ctx = await resolveRequestContext(null);
    expect(ctx).toEqual(LOCAL);
    expect(resolveContextFromToken).not.toHaveBeenCalled();
  });

  it("有效 token → 用 token 解析的 ctx", async () => {
    const tokenCtx = { userId: "u-tok", requestId: "r2", source: "user" as const };
    resolveContextFromToken.mockResolvedValue(tokenCtx);
    expect(await resolveRequestContext("good-token")).toEqual(tokenCtx);
  });

  it("失效 token(真 AuthenticationError 实例)→ 回落本机主用户", async () => {
    const { AuthenticationError } = await import(
      "@creatoros/backend/modules/identity"
    );
    resolveContextFromToken.mockRejectedValue(new AuthenticationError());
    expect(await resolveRequestContext("stale")).toEqual(LOCAL);
  });

  it("[核心] 跨 bundle 复制的 AuthenticationError(instanceof 失效,仅 name/code 同)→ 仍回落,不裸抛 500", async () => {
    // 模拟 Next server bundle 把 AuthenticationError 复制成另一实例:结构上是它(name+code),
    // 但不是 import 的那个类 → `instanceof` 为 false。isAuthError 靠 code/name 识别 → 回落。
    const bundleCopied = Object.assign(new Error("Invalid credentials"), {
      name: "AuthenticationError",
      code: "AuthenticationError",
    });
    resolveContextFromToken.mockRejectedValue(bundleCopied);
    expect(await resolveRequestContext("stale-cross-bundle")).toEqual(LOCAL);
  });

  it("非鉴权错误(如 DB 连接断)→ 照抛,不吞成回落", async () => {
    resolveContextFromToken.mockRejectedValue(new Error("db connection lost"));
    await expect(resolveRequestContext("tok")).rejects.toThrow(
      "db connection lost",
    );
  });
});
