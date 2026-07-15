import "server-only";
import { cookies, headers } from "next/headers";
import type { RequestContext } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
import {
  AuthenticationError,
  type UserDTO,
} from "@creatoros/backend/modules/identity";
import { SESSION_COOKIE } from "@/app/api/v1/auth/_session";
import { CURRENT_ACCOUNT_COOKIE } from "@/lib/http-transport";
import { verifyAccountSelection } from "@/lib/request-context.server";

// Server-only session helper (Module 00, Task 11). The (creator) layout session
// guard reads the httpOnly session cookie from the RSC request store, resolves a
// RequestContext through the identity service (never the db client directly —
// SPEC §22), and returns the current user for the Shell user card. Routes still
// read the cookie off the raw Request; RSCs use next/headers cookies() — the two
// agree on the SESSION_COOKIE name (single source of truth in _session.ts).
//
// [T-332 S3·关 GAP-01] resolveSession 现在还解析**当前选中抖音号**:读非 httpOnly 的
// `creatoros_current_account` cookie(写端在 http-transport:每次 RPC 把 localStorage
// 真值镜像进来;S4 切换器切号时同步写),经与 RPC 同一个校验器 verifyAccountSelection
// 验属主 + active 后落进 ctx.accountId —— RSC 首屏与 client RPC 从此同号,消
// 「首屏 user 级、水合后按号」的裂缝。坏 cookie(号已删/已归档/切户残留)按**未选号
// 引导态**处理(mode="unselected"),不拒绝整页渲染——RSC 是读路径,引导由页面层给。

export interface ResolvedSession {
  readonly ctx: RequestContext;
  readonly user: UserDTO;
}

// [T-332 S3] 把 current-account cookie 解析进 ctx(RSC 读路径,宽松档)。
async function withAccountFromCookie(
  ctx: RequestContext,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): Promise<RequestContext> {
  const raw = cookieStore.get(CURRENT_ACCOUNT_COOKIE)?.value;
  // 写端 encodeURIComponent 的对称读;损坏值(非法 % 序列)不许炸整页 → 按原串
  // 送校验(校验不过自然落未选号引导态)。
  let accountId: string | null = raw || null;
  if (accountId) {
    try {
      accountId = decodeURIComponent(accountId);
    } catch {
      /* 保留原串 */
    }
  }
  return verifyAccountSelection(ctx, accountId, "unselected");
}

/**
 * Resolve the current request's session. [T-046 单机免登录] 有 session cookie 就照旧
 * 解析;无/失效 session 不再返回 null,而是以**本机主用户**直通(单机产品打开即用,
 * 登录页已下线)。返回 null 的路径仅剩「库里一个用户都没有」的异常态(启动 seed 兜底,
 * 正常不发生);既有调用方的 null→redirect 分支保留为该异常态的兜底。
 */
export async function resolveSession(): Promise<ResolvedSession | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  const identity = await getIdentityService();

  if (rawToken) {
    try {
      const ctx = await identity.resolveContextFromToken(rawToken);
      const user = await identity.getCurrentUser(ctx);
      return { ctx: await withAccountFromCookie(ctx, cookieStore), user };
    } catch (err) {
      // 失效 token → 落到下方本机用户直通(与无 cookie 同路径)。
      if (!(err instanceof AuthenticationError)) throw err;
    }
  }

  try {
    const ctx = await identity.resolveLocalContext();
    const user = await identity.getCurrentUser(ctx);
    return { ctx: await withAccountFromCookie(ctx, cookieStore), user };
  } catch (err) {
    if (err instanceof AuthenticationError) return null;
    throw err;
  }
}

/**
 * The current request's pathname (forwarded by middleware as `x-pathname`), used
 * to build the `/login?from=<pathname>` redirect target so the user returns to
 * where they were after authenticating. Falls back to "/" if the header is
 * absent (e.g. a request that never passed through the middleware matcher).
 */
export async function currentPathname(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("x-pathname") ?? "/";
}
