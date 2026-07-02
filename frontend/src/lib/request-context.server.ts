import "server-only";
import type { RequestContext } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
import { AuthenticationError } from "@creatoros/backend/modules/identity";

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
      if (!(err instanceof AuthenticationError)) throw err;
    }
  }
  return identity.resolveLocalContext();
}
