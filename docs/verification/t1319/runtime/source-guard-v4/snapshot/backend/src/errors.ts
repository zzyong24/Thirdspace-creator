import { ErrorCode } from "@creatoros/contract";

// Shared-infra error classes (foundation §1/§2). The persistence transport
// (Task 8) throws `AuthenticationError` when a persisted (owned) op is reached
// with NO RequestContext — an unauthenticated dispatch. It reuses the contract
// `ErrorCode` so the dispatch/auth route mapper (Task 9) resolves the SAME HTTP
// status (AuthenticationError → 401) structurally, by `.code`, whether the error
// originated here (backend infra) or in the identity module's mirror class.
//
// Kept minimal: only the codes shared infra needs to raise. The identity module
// owns the richer auth/ownership error surface (frontend identity.errors.ts);
// both carry `ErrorCode.AuthenticationError`, so the route mapper treats them
// identically.

/**
 * Authentication failure (maps to HTTP 401 via `ErrorCode.AuthenticationError`).
 * Thrown by the persistence transport for a persisted op with no ctx, and
 * available to any shared-infra layer that must reject unauthenticated access.
 */
export class AuthenticationError extends Error {
  readonly code = ErrorCode.AuthenticationError;

  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "AuthenticationError";
    // Restore the prototype chain for instanceof across the transpiled target.
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Ownership / not-found-for-this-scope failure (maps to HTTP 404 via
 * `ErrorCode.OwnershipError`). Shared-infra canonical home so backend modules
 * raise it WITHOUT importing the identity module (前后端分离:模块不跨依赖 identity)。
 * The identity module keeps a mirror class carrying the SAME `.code`; the dispatch
 * route mapper resolves both to 404 structurally by `.code`, never by instanceof.
 */
export class OwnershipError extends Error {
  readonly code = ErrorCode.OwnershipError;

  constructor(message = "Not found") {
    super(message);
    this.name = "OwnershipError";
    Object.setPrototypeOf(this, OwnershipError.prototype);
  }
}

/**
 * [T-332 S2] 未选号(ctx.accountId 缺失)时访问 per-account 域 → 引导态错误。
 * SPEC §4.2 裁决:未选号 = 引导态,创作域禁读写 —— 不存在「未选号 = 全局视图」的
 * 隐式退化;前端把本错误翻译成「绑定/选择抖音号」引导,而非红色报错。
 *
 * [T-332 S3] code 已收编进 contract `ErrorCode.AccountRequiredError`(枚举值即原
 * 字符串字面量,S2 的 100+ 抛点行为不变):dispatch 路由按 `.code` ∈ ERROR_HTTP
 * 结构化映射 → HTTP 428 Precondition Required;client(http-transport)按同码抛
 * 类型化错误,S4 页面据此翻译成「请先绑定/选择抖音号」引导。
 */
export class AccountRequiredError extends Error {
  readonly code = ErrorCode.AccountRequiredError;

  constructor(message = "当前未选择账号:请先绑定/选择一个抖音号") {
    super(message);
    this.name = "AccountRequiredError";
    Object.setPrototypeOf(this, AccountRequiredError.prototype);
  }
}

/**
 * [T-332 S2] per-account 域 service 入口的统一断言:`ctx.accountId` 非空则原样返回
 * (类型收窄为 string),缺失 → 抛 AccountRequiredError。
 *
 * 用法(各模块 service 的 repoFor):
 *   accountId: requireAccountId(ctx.accountId)
 *
 * 读写同门(SPEC §4.2:未选号读路径同样禁全量);写入 stamp 一律用该返回值,
 * repo 不接受调用方显式传号(SPEC §4.6 防绕过)。系统 daemon 路径(调度器枚举、
 * 启动 sweep)不走本断言 —— 它们用显式命名的 *System 方法(ISO-06,ctx 账号由
 * job/task 行派生),不是隐式全量退化。
 */
export function requireAccountId(
  accountId: string | null | undefined,
  what = "per-account operation",
): string {
  if (!accountId) {
    throw new AccountRequiredError(
      `AccountRequiredError: ${what} requires a selected account (ctx.accountId missing)`,
    );
  }
  return accountId;
}

/** 工作区版本/迁移冲突；由共同基础设施返回统一409。 */
export class ConflictError extends Error {
 readonly code=ErrorCode.ConflictError;
 constructor(message:string){super(message);this.name='ConflictError';}
}
