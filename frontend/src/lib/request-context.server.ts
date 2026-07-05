import "server-only";
import { ErrorCode, type RequestContext } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
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
