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
const getGroup = vi.fn();
const forAccount = vi.fn();
vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
  }),
  getAccountGroupService: async () => ({get:getGroup,forAccount}),
  getPlatformAccountService: async () => ({
    getAccount,
  }),
}));

import {
  resolveRequestContext,
  verifyAccountSelection,
  isOwnershipError,
  readRequestAccountId,
  readRequestAccountSelection,
} from "./request-context.server";

const LOCAL = { userId: "user-zyongzhu", requestId: "r", source: "user" as const };

beforeEach(() => {
  resolveContextFromToken.mockReset();
  resolveLocalContext.mockReset();
  getAccount.mockReset();
  getGroup.mockReset();
  forAccount.mockReset();
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
 * [T-136 切片 a · gate BLOCKER-1 → T-332 S3·关 GAP-02] accountId 属主硬校验:拒绝不降级。
 *
 * `resolveRequestContext(rawToken, accountId)` 读到前端传来的 x-account-id 后,**绝不信任**——
 * 必须查 platform_accounts 确认 `account.user_id === ctx.userId`(getAccount 已按 ctx.userId
 * 域内查,不属主 → 抛 OwnershipError/404),且号必须 active。S3 起验不过 → **抛 OwnershipError
 * 拒绝请求**(dispatch/chat 转 404),不再静默降级 null:降级在 strict 世界里会把失效/伪造的号
 * 伪装成「未选号引导态」,不诚实(SPEC §4.3)。不存在与不属主同貌,不泄露存在性。
 */
describe("resolveRequestContext — accountId 属主硬校验(S3:拒绝不降级)", () => {
  it("不传 accountId → ctx 不带 accountId(未选号引导态,兼容旧调用)", async () => {
    const ctx = await resolveRequestContext(null);
    expect(ctx.accountId).toBeUndefined();
    expect(getAccount).not.toHaveBeenCalled();
  });

  it("传属于本 user 的 active 号(getAccount 成功)→ accountId 落进 ctx", async () => {
    getAccount.mockResolvedValue({
      id: "acct-1",
      userId: "user-zyongzhu",
      status: "active",
    });
    const ctx = await resolveRequestContext(null, "acct-1");
    expect(getAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-zyongzhu" }),
      "acct-1",
    );
    expect(ctx.accountId).toBe("acct-1");
  });

  it("[越权] accountId 指向非本 user 的号(getAccount 抛 OwnershipError)→ 拒绝(照抛 404 同貌),不降级", async () => {
    const { OwnershipError } = await import(
      "@creatoros/backend/modules/identity"
    );
    getAccount.mockRejectedValue(new OwnershipError());
    await expect(
      resolveRequestContext(null, "acct-of-another-user"),
    ).rejects.toSatisfy(isOwnershipError);
  });

  it("[伪造/已删] accountId 指向不存在的号(跨 bundle 复制的 OwnershipError,仅 name/code 同)→ 仍拒绝", async () => {
    const notFound = Object.assign(new Error("not found"), {
      name: "OwnershipError",
      code: "OwnershipError",
    });
    getAccount.mockRejectedValue(notFound);
    await expect(
      resolveRequestContext(null, "acct-deleted"),
    ).rejects.toSatisfy(isOwnershipError);
  });

  it("[已归档] 号属主但 status=archived → 拒绝,OwnershipError 同貌 + details.reason=account_archived", async () => {
    getAccount.mockResolvedValue({
      id: "acct-old",
      userId: "user-zyongzhu",
      status: "archived",
    });
    const err = await resolveRequestContext(null, "acct-old").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeNull();
    expect(isOwnershipError(err)).toBe(true);
    // 属主已验实,归档原因可以诚实给出(前端翻译「重新激活后数据原样回来」)。
    expect((err as { details?: { reason?: string } }).details?.reason).toBe(
      "account_archived",
    );
  });

  it("非 ownership 错误(DB 断等)→ 照抛原错,绝不伪装成引导态或拒绝语义", async () => {
    getAccount.mockRejectedValue(new Error("db connection lost"));
    await expect(resolveRequestContext(null, "acct-1")).rejects.toThrow(
      "db connection lost",
    );
  });

  it("空串 accountId(header 存在但为空)→ 视作未选,不查号也不落 accountId", async () => {
    const ctx = await resolveRequestContext(null, "");
    expect(getAccount).not.toHaveBeenCalled();
    expect(ctx.accountId).toBeUndefined();
  });

  it("校验用的是 token 解析出的真实 userId(而非前端可控)——防越权基石", async () => {
    const tokenCtx = { userId: "u-real", requestId: "r2", source: "user" as const };
    resolveContextFromToken.mockResolvedValue(tokenCtx);
    getAccount.mockResolvedValue({
      id: "acct-x",
      userId: "u-real",
      status: "active",
    });
    await resolveRequestContext("good-token", "acct-x");
    // getAccount 收到的 ctx 必须带 token 真实 userId,platform-account service 据此域内查权。
    expect(getAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-real" }),
      "acct-x",
    );
  });
});

/**
 * [T-332 S3·关 GAP-01] verifyAccountSelection 的 RSC 宽松档("unselected"):
 * RSC 读 current-account cookie 是**读路径引导态**——坏 cookie(号已删/已归档/切户残留)
 * 按未选号处理(accountId=null),不拒绝整页渲染;与 RPC("reject")共用同一校验器,
 * 保证两条路径对「什么号有效」的判断恒一致。
 */
describe("verifyAccountSelection — RSC 宽松档(unselected)vs RPC 拒绝档(reject)", () => {
  const BASE = LOCAL;

  it("有效 active 号 → 两档同样落 accountId", async () => {
    getAccount.mockResolvedValue({
      id: "acct-1",
      userId: "user-zyongzhu",
      status: "active",
    });
    const rsc = await verifyAccountSelection(BASE, "acct-1", "unselected");
    const rpc = await verifyAccountSelection(BASE, "acct-1", "reject");
    expect(rsc.accountId).toBe("acct-1");
    expect(rpc.accountId).toBe("acct-1");
  });

  it("坏 cookie(号不存在/不属主)→ unselected 档按未选号处理(accountId=null),不抛", async () => {
    const notFound = Object.assign(new Error("not found"), {
      name: "OwnershipError",
      code: "OwnershipError",
    });
    getAccount.mockRejectedValue(notFound);
    const ctx = await verifyAccountSelection(BASE, "acct-stale", "unselected");
    expect(ctx.accountId).toBeNull();
  });

  it("已归档号 → unselected 档同样按未选号处理(数据保留,不可当当前号)", async () => {
    getAccount.mockResolvedValue({
      id: "acct-old",
      userId: "user-zyongzhu",
      status: "archived",
    });
    const ctx = await verifyAccountSelection(BASE, "acct-old", "unselected");
    expect(ctx.accountId).toBeNull();
  });

  it("未传号 → 两档都保持未选号形状,不查库", async () => {
    const ctx = await verifyAccountSelection(BASE, null, "unselected");
    expect(ctx.accountId).toBeUndefined();
    expect(getAccount).not.toHaveBeenCalled();
  });

  it("非 ownership 错误(DB 断)→ unselected 档也照抛,不吞成引导态", async () => {
    getAccount.mockRejectedValue(new Error("db down"));
    await expect(
      verifyAccountSelection(BASE, "acct-1", "unselected"),
    ).rejects.toThrow("db down");
  });
});

describe("readRequestAccountId — 自定义 route 的账号入口", () => {
  it("x-account-id header 优先于 cookie", () => {
    const req = new Request("http://localhost/api/knowledge/relate", {
      headers: {
        "x-account-id": "acct-header",
        cookie: "creatoros_current_account=acct-cookie",
      },
    });
    expect(readRequestAccountId(req)).toBe("acct-header");
  });

  it("缺 header 时从 current-account cookie 兜底并解码", () => {
    const req = new Request("http://localhost/api/knowledge/relate", {
      headers: {
        cookie: "other=1; creatoros_current_account=acct%2Fencoded; tail=2",
      },
    });
    expect(readRequestAccountId(req)).toBe("acct/encoded");
  });

  it("header 和 cookie 都没有时诚实返回 null", () => {
    expect(
      readRequestAccountId(
        new Request("http://localhost/api/knowledge/relate"),
      ),
    ).toBeNull();
  });

  it("[T-691] header 与 cookie 不一致时保留冲突真相，不静默选号", () => {
    const selection = readRequestAccountSelection(
      new Request("http://localhost/api/chat", {
        headers: {
          "x-account-id": "acct-header",
          cookie: "creatoros_current_account=acct-cookie",
        },
      }),
    );
    expect(selection).toEqual({
      headerAccountId: "acct-header",
      cookieAccountId: "acct-cookie",
      effectiveAccountId: "acct-header",
      mismatch: true,
    });
  });
});


describe("账号组选择校验", () => {
 it("管理读取可从失效组恢复为未选中；业务请求拒绝失效组", async () => {
   const denied=Object.assign(new Error("不存在"),{name:"OwnershipError",code:"OwnershipError"});
   getGroup.mockRejectedValue(denied);
   await expect(resolveRequestContext(null,null,{groupId:"deleted-group",groupSelectionMode:"unselected"})).resolves.toMatchObject({groupId:null,accountId:null});
   await expect(resolveRequestContext(null,null,{groupId:"deleted-group"})).rejects.toBe(denied);
 });
 it("真实账号只有仍属于所选组时才附带成员版本", async () => {
   getAccount.mockResolvedValue({id:"real-account",status:"active"});
   getGroup.mockResolvedValue({id:"group-a",version:3});
   forAccount.mockResolvedValue({groupId:"group-b",version:8});
   await expect(resolveRequestContext(null,"real-account",{groupId:"group-a"})).rejects.toThrow("账号不在当前组");
   forAccount.mockResolvedValue({groupId:"group-a",version:8});
   await expect(resolveRequestContext(null,"real-account",{groupId:"group-a"})).resolves.toMatchObject({groupId:"group-a",groupVersion:3,accountId:"real-account",membershipVersion:8});
 });
});
