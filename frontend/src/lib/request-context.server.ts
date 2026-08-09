import "server-only";
import { ErrorCode, type RequestContext } from "@creatoros/contract";
import {
  getIdentityService,
  getPlatformAccountService,
} from "@/server/persistence-client";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";

// [失效 cookie 回落健壮化] 判定一个错是否「鉴权失败」——**不靠纯 instanceof**。Next server
// bundle 会把 AuthenticationError 复制成多份实例(跨 chunk),`err instanceof AuthenticationError`
// 会漏判(Object.setPrototypeOf 只在同实例内有效),导致失效 token 既不回落也不转 401、裸抛 500
// (清库/换环境/cookie 过期后浏览器残留旧 session cookie → 全站 dispatch 500 的真凶)。改用
// 结构化 code/name(跨 bundle 边界稳定)。
export function isAuthError(err: unknown): boolean {
  return (
    err instanceof AuthenticationError ||
    (err as { code?: unknown })?.code === ErrorCode.AuthenticationError ||
    (err as { name?: unknown })?.name === "AuthenticationError"
  );
}

// [T-332 S3] 同款结构化判定:OwnershipError(404 语义)。账号咽喉拒绝无效 x-account-id 时
// 抛它;dispatch/chat route 在 resolve-ctx 的 catch 里靠本判定转 404 envelope(不靠 instanceof,
// 理由同上——backend 与 identity 各有一份镜像类,跨 bundle 还会再复制)。
export function isOwnershipError(err: unknown): boolean {
  return (
    err instanceof OwnershipError ||
    (err as { code?: unknown })?.code === ErrorCode.OwnershipError ||
    (err as { name?: unknown })?.name === "OwnershipError"
  );
}

// [RT-H01·部分] 有副作用路由的解析选项。rejectInvalidToken=true(状态变更类:dispatch 的写 op /
//   chat / web-session)时,**present-but-invalid** 的 token 不再静默降级为本机主用户,而是上抛
//   AuthenticationError → route 转 401(「明确身份或拒绝」)。缺失 cookie(rawToken 为空)不受影响,
//   仍走 T-046 单机免登录直通,避免锁死装机版(它常态不发 session cookie)。读类路由不传此项,保持宽松。
export interface ResolveContextOptions {
  rejectInvalidToken?: boolean;
}

/**
 * 自定义 route 的当前账号单一解析入口：header 优先，current-account cookie 兜底。
 *
 * contract dispatch/chat 会显式发送 `x-account-id`；浏览器原生导航或遗留 escape-hatch
 * 可能只有 cookie。两者都只是“用户意图”，随后仍由 verifyAccountSelection 做属主与 active
 * 校验，cookie 兜底不会放松安全边界。
 */
export function readRequestAccountId(req: Request): string | null {
  return readRequestAccountSelection(req).effectiveAccountId;
}

/**
 * [T-691] 同时保留 header / cookie 两个账号来源，供有副作用的入口在进入 Context 前
 * 做一致性校验。普通读路由仍可消费 effectiveAccountId，保持既有 header 优先行为。
 */
export function readRequestAccountSelection(req: Request): {
  headerAccountId: string | null;
  cookieAccountId: string | null;
  effectiveAccountId: string | null;
  mismatch: boolean;
} {
  const headerAccountId = req.headers.get("x-account-id")?.trim() || null;
  const match = /(?:^|;\s*)creatoros_current_account=([^;]+)/.exec(
    req.headers.get("cookie") ?? "",
  );
  let cookieAccountId: string | null = null;
  if (match?.[1]) {
    try {
      cookieAccountId = decodeURIComponent(match[1]).trim() || null;
    } catch {
      cookieAccountId = match[1].trim() || null;
    }
  }
  return {
    headerAccountId,
    cookieAccountId,
    effectiveAccountId: headerAccountId ?? cookieAccountId,
    mismatch: Boolean(
      headerAccountId &&
        cookieAccountId &&
        headerAccountId !== cookieAccountId,
    ),
  };
}

// [T-046 单机免登录] route 层的统一 ctx 解析:有 session token 照旧验 token;无 token 或
// token 失效 → 以本机主用户(最早创建)直通。单机产品打开即用,登录页已下线;session 机制
// 保留为内部实现(脚本/curl 仍可 login 拿 cookie,行为不变)。
// 仍抛 AuthenticationError 的唯一路径:库里一个用户都没有(启动 seed 兜底,正常不发生),
// 调用方保留原 401 分支作为该异常态兜底。
//
// [T-332 S3·关 GAP-02] accountId(x-account-id header)验属主**失败即拒绝**(抛 OwnershipError
// → route 转 404),不再静默降级 null:strict 世界里「降级 null」= 把失效/伪造的号伪装成
// 「未选号引导态」,不诚实;RSC 读路径要宽松语义请走 `verifyAccountSelection(..., "unselected")`。
export async function resolveRequestContext(
  rawToken: string | null | undefined,
  accountId?: string | null,
  opts?: ResolveContextOptions,
): Promise<RequestContext> {
  const base = await resolveBaseContext(rawToken, opts);
  return verifyAccountSelection(base, accountId, "reject");
}

// 先解析出「本次请求是谁」(userId 维度)——与 accountId 无关的既有逻辑(T-046/T-142)。
async function resolveBaseContext(
  rawToken: string | null | undefined,
  opts?: ResolveContextOptions,
): Promise<RequestContext> {
  const identity = await getIdentityService();
  if (rawToken) {
    try {
      return await identity.resolveContextFromToken(rawToken);
    } catch (err) {
      // 非鉴权错误(DB 断等)照抛。
      if (!isAuthError(err)) throw err;
      // [RT-H01] 状态变更类:present-but-invalid token 不静默降级主用户 → 上抛(route 转 401)。
      if (opts?.rejectInvalidToken) throw err;
      // 读类:失效 token → 落本机用户直通(与无 token 同路径,兼容残留旧 cookie,不破 T-046)。
    }
  }
  // 缺失 cookie:无论读写,仍走本机主用户直通(单机免登录,别锁死 app;真正身份绑定靠 follow-up 启动令牌)。
  return identity.resolveLocalContext();
}

/**
 * [T-332 S3] 无效号的处置模式 —— RPC 与 RSC 共用同一校验器,只差这一档:
 *  - "reject":RPC 咽喉(dispatch/chat)。验不过 → 抛 OwnershipError(404 同貌,不泄露
 *    存在性),SPEC §4.3「拒绝而非降级」。
 *  - "unselected":RSC 读路径(session cookie 解析,session.server.ts)。坏 cookie(号已删/
 *    已归档/切户残留)→ 按**未选号引导态**处理(accountId=null),不拒绝整页渲染——RSC 是
 *    读路径引导态,页面层负责显示「绑定/选择账号」;拒绝会把首屏炸成错误页。
 */
export type InvalidAccountMode = "reject" | "unselected";

/**
 * [T-136 切片 a · gate BLOCKER-1 → T-332 S3·关 GAP-02] accountId 属主硬校验。
 * 前端传来的 accountId(x-account-id header / current-account cookie)**绝不可信**:
 * 必须以 base ctx 的真实 userId 在 platform_accounts 域内查这个号(getAccount 已按
 * ctx.userId 过滤 + 不属主/不存在时抛 OwnershipError/404),并且号必须是 active——
 * archived 号数据保留但不可作为当前号发起读写(SPEC §4.3)。校验必须在任何按号 repo 过滤前。
 *
 * 三种失败的区分(按 SPEC §4.3):
 *  - 不存在 / 不属主:同貌 OwnershipError(原错误照抛)——不泄露「这个 id 存不存在」;
 *  - 已归档:属主已验实,允许更诚实的文案 + `details.reason = "account_archived"`
 *    (前端可翻译成「该账号已归档,重新激活后数据原样回来」)。
 * 非 ownership 类错误(DB 断等)恒照抛,两种模式一致——那不是「号无效」,吞掉会假装成引导态。
 */
export async function verifyAccountSelection(
  base: RequestContext,
  accountId: string | null | undefined,
  mode: InvalidAccountMode,
): Promise<RequestContext> {
  // 未传 / 空串 → 未选号(引导态),保持既有形状(不带 accountId),兼容所有不带号的调用点。
  // per-account 域随后由 backend 的 AccountRequiredError 断言把关(S2),这里不越权代答。
  if (!accountId) return base;

  let status: string;
  try {
    const accounts = await getPlatformAccountService();
    // getAccount 域内(ctx.userId)查:不属主 / 不存在 → OwnershipError。成功 = 该号确属本 user。
    const account = await accounts.getAccount(base, accountId);
    status = (account as { status?: string }).status ?? "active";
  } catch (err) {
    if (!isOwnershipError(err)) throw err; // DB 断等异常照抛,绝不伪装成引导态
    if (mode === "reject") throw err; // [S3] 不存在/不属主同貌 404,不泄露存在性
    // RSC 读路径:坏 cookie(切户残留/号已删)→ 未选号引导态 + 安全日志(不含敏感态)。
    console.warn(
      "[T-332 S3] current-account 属主校验未过,RSC 按未选号引导态处理(不返他人数据)",
      {
        userId: base.userId,
        requestedAccountId: accountId,
        reason:
          err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
    );
    return { ...base, accountId: null };
  }

  // [S3] 已归档号:不可作为当前号发起读写(数据保留,重新激活原样回来——SPEC §4.3)。
  if (status === "archived") {
    if (mode === "reject") {
      throw Object.assign(
        new OwnershipError(
          `OwnershipError: platform account is archived: ${accountId}`,
        ),
        { details: { reason: "account_archived" } },
      );
    }
    console.warn(
      "[T-332 S3] current-account 指向已归档号,RSC 按未选号引导态处理",
      { userId: base.userId, requestedAccountId: accountId },
    );
    return { ...base, accountId: null };
  }

  return { ...base, accountId };
}
