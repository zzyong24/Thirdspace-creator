import "server-only";
import { ErrorCode, type RequestContext } from "@creatoros/contract";
import {
  getIdentityService,
  getPlatformAccountService,
} from "@/server/persistence-client";
import { AuthenticationError } from "@creatoros/backend/modules/identity";

// [失效 cookie 回落健壮化] 判定一个错是否「鉴权失败」——**不靠纯 instanceof**。Next server
// bundle 会把 AuthenticationError 复制成多份实例(跨 chunk),`err instanceof AuthenticationError`
// 会漏判(Object.setPrototypeOf 只在同实例内有效),导致失效 token 既不回落也不转 401、裸抛 500
// (清库/换环境/cookie 过期后浏览器残留旧 session cookie → 全站 dispatch 500 的真凶)。改用
// 结构化 code/name(跨 bundle 边界稳定)。
function isAuthError(err: unknown): boolean {
  return (
    err instanceof AuthenticationError ||
    (err as { code?: unknown })?.code === ErrorCode.AuthenticationError ||
    (err as { name?: unknown })?.name === "AuthenticationError"
  );
}

// [T-046 单机免登录] route 层的统一 ctx 解析:有 session token 照旧验 token;无 token 或
// token 失效 → 以本机主用户(最早创建)直通。单机产品打开即用,登录页已下线;session 机制
// 保留为内部实现(脚本/curl 仍可 login 拿 cookie,行为不变)。
// 仍抛 AuthenticationError 的唯一路径:库里一个用户都没有(启动 seed 兜底,正常不发生),
// 调用方保留原 401 分支作为该异常态兜底。
export async function resolveRequestContext(
  rawToken: string | null | undefined,
  accountId?: string | null,
): Promise<RequestContext> {
  const base = await resolveBaseContext(rawToken);
  return withVerifiedAccount(base, accountId);
}

// 先解析出「本次请求是谁」(userId 维度)——与 accountId 无关的既有逻辑(T-046/T-142)。
async function resolveBaseContext(
  rawToken: string | null | undefined,
): Promise<RequestContext> {
  const identity = await getIdentityService();
  if (rawToken) {
    try {
      return await identity.resolveContextFromToken(rawToken);
    } catch (err) {
      // 失效 token → 落到本机用户直通(与无 token 同路径);非鉴权错误照抛。
      if (!isAuthError(err)) throw err;
    }
  }
  return identity.resolveLocalContext();
}

// [T-136 切片 a · gate BLOCKER-1] accountId 属主硬校验。前端经 x-account-id header 传来的
// accountId **绝不可信**:必须以 base ctx 的真实 userId 在 platform_accounts 域内查这个号
// (getAccount 已按 ctx.userId 过滤 + 不属主/不存在时抛 OwnershipError/404)。属主符 → 落进
// ctx.accountId;属主不符 / 号不存在 / 空串 → 降级 accountId=null(未选号,repo 门不按号过滤,
// 返回该 user 全部——安全退化,绝不返他人号数据)。校验必须在任何按号 repo 过滤前。
async function withVerifiedAccount(
  base: RequestContext,
  accountId: string | null | undefined,
): Promise<RequestContext> {
  // 未传 / 空串 header → 视作未选号,保持既有形状(不带 accountId),兼容所有不带号的调用点。
  if (!accountId) return base;

  try {
    const accounts = await getPlatformAccountService();
    // getAccount 域内(ctx.userId)查:不属主 / 不存在 → OwnershipError。成功 = 该号确属本 user。
    await accounts.getAccount(base, accountId);
    return { ...base, accountId };
  } catch (err) {
    // 越权(伪造 header 指他人号)/ 号已删 / 查询失败 → 降级 null + 记安全日志(不含敏感态)。
    console.warn(
      "[T-136] x-account-id 属主校验未过,降级为未选号(不返他人数据)",
      {
        userId: base.userId,
        requestedAccountId: accountId,
        reason:
          err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
    );
    return { ...base, accountId: null };
  }
}
