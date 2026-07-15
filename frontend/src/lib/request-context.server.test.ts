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
const getAccount = vi.fn();
vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
  }),
  getPlatformAccountService: async () => ({
    getAccount,
  }),
}));

import { resolveRequestContext } from "./request-context.server";

const LOCAL = { userId: "user-zyongzhu", requestId: "r", source: "user" as const };

beforeEach(() => {
  resolveContextFromToken.mockReset();
  resolveLocalContext.mockReset();
  getAccount.mockReset();
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

/**
 * [RT-H01·部分] 状态变更类路由的严格身份:present-but-invalid cookie 不静默降级主用户。
 * dispatch 写 op / chat / web-session 传 { rejectInvalidToken: true } —— 失效 token 上抛(→ 401);
 * 缺失 cookie 仍单机直通(不锁死 app)。读类不传此项,行为不变(上面的 describe 已锁)。
 */
describe("resolveRequestContext — rejectInvalidToken(写类明确身份或拒绝)", () => {
  it("失效 token + rejectInvalidToken → 抛(不降级主用户)", async () => {
    const { AuthenticationError } = await import(
      "@creatoros/backend/modules/identity"
    );
    resolveContextFromToken.mockRejectedValue(new AuthenticationError());
    await expect(
      resolveRequestContext("stale", null, { rejectInvalidToken: true }),
    ).rejects.toBeTruthy();
    expect(resolveLocalContext).not.toHaveBeenCalled();
  });

  it("跨 bundle 复制的 AuthenticationError + rejectInvalidToken → 仍抛(结构化识别)", async () => {
    const bundleCopied = Object.assign(new Error("Invalid credentials"), {
      name: "AuthenticationError",
      code: "AuthenticationError",
    });
    resolveContextFromToken.mockRejectedValue(bundleCopied);
    await expect(
      resolveRequestContext("stale-x", null, { rejectInvalidToken: true }),
    ).rejects.toBeTruthy();
  });

  it("缺失 cookie + rejectInvalidToken → 仍走本机主用户(缺 cookie 不锁死 app)", async () => {
    const ctx = await resolveRequestContext(null, null, {
      rejectInvalidToken: true,
    });
    expect(ctx).toEqual(LOCAL);
    expect(resolveContextFromToken).not.toHaveBeenCalled();
  });

  it("有效 token + rejectInvalidToken → 正常用 token ctx(不受影响)", async () => {
    const tokenCtx = { userId: "u-ok", requestId: "r", source: "user" as const };
    resolveContextFromToken.mockResolvedValue(tokenCtx);
    expect(
      await resolveRequestContext("good", null, { rejectInvalidToken: true }),
    ).toEqual(tokenCtx);
  });

  it("非鉴权错误 + rejectInvalidToken → 照抛原错(不吞)", async () => {
    resolveContextFromToken.mockRejectedValue(new Error("db down"));
    await expect(
      resolveRequestContext("tok", null, { rejectInvalidToken: true }),
    ).rejects.toThrow("db down");
  });
});

/**
 * [T-136 切片 a · gate BLOCKER-1] accountId 属主硬校验 + 退化。
 *
 * `resolveRequestContext(rawToken, accountId)` 读到前端传来的 x-account-id 后,**绝不信任**——
 * 必须查 platform_accounts 确认 `account.user_id === ctx.userId`(getAccount 已按 ctx.userId
 * 域内查,不属主 → 抛 OwnershipError/404)。属主不符 / 号不存在 → 降级 accountId=null,不返他人
 * 数据(否则伪造 header 指他人号 = 水平越权穿透 repo 门)。校验在任何按号过滤前。
 */
describe("resolveRequestContext — accountId 属主硬校验(BLOCKER-1)+ 退化", () => {
  it("不传 accountId → ctx 不带 accountId(未选号 / 全局,兼容旧调用)", async () => {
    const ctx = await resolveRequestContext(null);
    expect(ctx.accountId).toBeUndefined();
    expect(getAccount).not.toHaveBeenCalled();
  });

  it("传属于本 user 的 accountId(getAccount 成功)→ accountId 落进 ctx", async () => {
    getAccount.mockResolvedValue({ id: "acct-1", userId: "user-zyongzhu" });
    const ctx = await resolveRequestContext(null, "acct-1");
    expect(getAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-zyongzhu" }),
      "acct-1",
    );
    expect(ctx.accountId).toBe("acct-1");
  });

  it("[越权] accountId 指向非本 user 的号(getAccount 抛 OwnershipError)→ 降级 null,不返他人数据", async () => {
    const { OwnershipError } = await import(
      "@creatoros/backend/modules/identity"
    );
    getAccount.mockRejectedValue(new OwnershipError());
    const ctx = await resolveRequestContext(null, "acct-of-another-user");
    expect(ctx.accountId).toBeNull();
  });

  it("[退化] accountId 指向已删/不存在的号 → getAccount 抛 404 → 降级 null(不崩)", async () => {
    // 号被删后 localStorage 仍存旧 id → getAccount 找不到 → OwnershipError/404 → 降级 null。
    const notFound = Object.assign(new Error("not found"), {
      name: "OwnershipError",
      code: "OwnershipError",
    });
    getAccount.mockRejectedValue(notFound);
    const ctx = await resolveRequestContext(null, "acct-deleted");
    expect(ctx.accountId).toBeNull();
  });

  it("空串 accountId(header 存在但为空)→ 视作未选,不查号也不落 accountId", async () => {
    const ctx = await resolveRequestContext(null, "");
    expect(getAccount).not.toHaveBeenCalled();
    expect(ctx.accountId).toBeUndefined();
  });

  it("校验用的是 token 解析出的真实 userId(而非前端可控)——防越权基石", async () => {
    const tokenCtx = { userId: "u-real", requestId: "r2", source: "user" as const };
    resolveContextFromToken.mockResolvedValue(tokenCtx);
    getAccount.mockResolvedValue({ id: "acct-x", userId: "u-real" });
    await resolveRequestContext("good-token", "acct-x");
    // getAccount 收到的 ctx 必须带 token 真实 userId,platform-account service 据此域内查权。
    expect(getAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-real" }),
      "acct-x",
    );
  });
});
