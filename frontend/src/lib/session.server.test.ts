/**
 * [T-332 S3·关 GAP-01] resolveSession 的当前号解析回归测。
 *
 * RSC 首屏此前是 user-only context(当前号只活在 localStorage + x-account-id header,
 * 服务端渲染读不到)→「首屏 user 级、水合后按号」永远闪烁(GAP-01)。S3 起:
 *  - http-transport 每次 RPC 把 localStorage 真值镜像进非 httpOnly cookie
 *    `creatoros_current_account`;
 *  - resolveSession 读该 cookie,经与 RPC 同一个校验器 verifyAccountSelection 验属主 +
 *    active 后落 ctx.accountId;
 *  - 坏 cookie(号已删/已归档/切户残留)按**未选号引导态**处理(不拒绝整页渲染——
 *    RSC 是读路径,引导由页面层给);DB 级异常照抛,不吞。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// next/headers 的 RSC request store 在 vitest 里不存在 → 直接 mock cookies()/headers()。
const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
  headers: async () => ({ get: () => null }),
}));

const resolveContextFromToken = vi.fn();
const resolveLocalContext = vi.fn();
const getCurrentUser = vi.fn();
const getAccount = vi.fn();
vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
    getCurrentUser,
  }),
  getPlatformAccountService: async () => ({
    getAccount,
  }),
}));

import { resolveSession } from "./session.server";
import { CURRENT_ACCOUNT_COOKIE } from "./http-transport";

const LOCAL = {
  userId: "user-zyongzhu",
  requestId: "r",
  source: "user" as const,
};
const USER = { id: "user-zyongzhu", displayName: "禹" };

// 组装 cookie store:无 session cookie(T-046 单机直通),可选 current-account cookie。
function stubCookies(currentAccountId: string | null) {
  cookieGet.mockImplementation((name: string) => {
    if (name === CURRENT_ACCOUNT_COOKIE && currentAccountId) {
      return { value: currentAccountId };
    }
    return undefined;
  });
}

beforeEach(() => {
  resolveContextFromToken.mockReset();
  resolveLocalContext.mockReset();
  getCurrentUser.mockReset();
  getAccount.mockReset();
  cookieGet.mockReset();
  resolveLocalContext.mockResolvedValue(LOCAL);
  getCurrentUser.mockResolvedValue(USER);
});

describe("resolveSession — 当前号入 RSC ctx(GAP-01 收口)", () => {
  it("cookie 带属主 active 号 → ctx.accountId 落号(RSC 首屏与 RPC 同号)", async () => {
    stubCookies("acct-1");
    getAccount.mockResolvedValue({
      id: "acct-1",
      userId: "user-zyongzhu",
      status: "active",
    });
    const session = await resolveSession();
    expect(session).not.toBeNull();
    expect(session!.ctx.accountId).toBe("acct-1");
    // 校验必须以真实 userId 域内查号(与 dispatch 同一防越权基石)。
    expect(getAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-zyongzhu" }),
      "acct-1",
    );
  });

  it("无 current-account cookie → 未选号(ctx 不带 accountId),不查号", async () => {
    stubCookies(null);
    const session = await resolveSession();
    expect(session!.ctx.accountId).toBeUndefined();
    expect(getAccount).not.toHaveBeenCalled();
  });

  it("[坏 cookie] 号已删/不属主(OwnershipError)→ 按未选号引导态,不拒绝整页渲染", async () => {
    stubCookies("acct-stale");
    const notFound = Object.assign(new Error("not found"), {
      name: "OwnershipError",
      code: "OwnershipError",
    });
    getAccount.mockRejectedValue(notFound);
    const session = await resolveSession();
    expect(session).not.toBeNull();
    expect(session!.ctx.accountId).toBeNull();
    expect(session!.user).toEqual(USER);
  });

  it("[坏 cookie] 号已归档 → 同按未选号引导态(数据保留,不可当当前号)", async () => {
    stubCookies("acct-archived");
    getAccount.mockResolvedValue({
      id: "acct-archived",
      userId: "user-zyongzhu",
      status: "archived",
    });
    const session = await resolveSession();
    expect(session!.ctx.accountId).toBeNull();
  });

  it("cookie 值 URL-decode 后再校验(encodeURIComponent 写入的对称读)", async () => {
    stubCookies(encodeURIComponent("acct/编号"));
    getAccount.mockResolvedValue({
      id: "acct/编号",
      userId: "user-zyongzhu",
      status: "active",
    });
    const session = await resolveSession();
    expect(getAccount).toHaveBeenCalledWith(expect.anything(), "acct/编号");
    expect(session!.ctx.accountId).toBe("acct/编号");
  });

  it("号校验遇非 ownership 错误(DB 断)→ 照抛,不吞成引导态", async () => {
    stubCookies("acct-1");
    getAccount.mockRejectedValue(new Error("db down"));
    await expect(resolveSession()).rejects.toThrow("db down");
  });
});
