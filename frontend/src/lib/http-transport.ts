import { ErrorCode, type Endpoint, type Transport } from "@creatoros/contract";
import { handshakeHeaders } from "@/lib/handshake-client";

// [T-136 切片 a] 当前选中抖音号的 localStorage 键(与 account-switcher 同一真值)。切号写它,
// 每次请求读它注入 x-account-id header。server 端会验属主([T-332 S3] 验不过 → 404 拒绝,
// 不再降级),故这里带的值是「意图」而非「授权」——安全边界在 server。
export const CURRENT_ACCOUNT_KEY = "creatoros:current-account";

// [T-332 S3·关 GAP-01] 当前号的服务端可读 cookie(非 httpOnly:值只是账号 id「意图」,
// 不是凭据;server 每次都重新验属主)。RSC 首屏经 session.server.ts 读它解析 ctx.accountId,
// 与 RPC 的 x-account-id 共用同一校验器(verifyAccountSelection)——消「首屏 user 级、
// 水合后按号」的裂缝。写端:本 transport 每次请求前把 localStorage 真值镜像进 cookie
// (单一真值仍是 localStorage;cookie 是它的服务端投影)。
export const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

// 读当前号 id。仅浏览器有 localStorage;SSR / 隐私模式禁用 storage → try/catch 降级为 null
// (= 未选号,server 走引导态语义,不崩)。复用 sidebar collapse 同款降级范式。
// [T-220] 导出:/api/chat 的 useChat transport 不走本 dispatch,需复用同一读法注入 x-account-id
//   (否则 chat 全程无号 → 截图/封面 asset 落 NULL 号 → 破图)。单一真值,不另抄 localStorage 键。
export function readCurrentAccountId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(CURRENT_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

// [T-332 S3] 把当前号镜像进服务端可读 cookie(见 CURRENT_ACCOUNT_COOKIE 注释)。
// null → 清除(未选号)。document.cookie 不可用(SSR/测试/隐私模式)→ 静默跳过,
// RSC 退回未选号引导态,不崩。导出给 S4:切换器切号后应同步调用(在 router.refresh()
// 之前),否则新号的首个 RSC refresh 仍读到旧 cookie(差一拍)。
export function syncCurrentAccountCookie(accountId: string | null): void {
  try {
    if (typeof document === "undefined") return;
    if (accountId) {
      // 一年有效;SameSite=Lax 与 session cookie 同款;Path=/ 全站可见。
      document.cookie = `${CURRENT_ACCOUNT_COOKIE}=${encodeURIComponent(accountId)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    } else {
      document.cookie = `${CURRENT_ACCOUNT_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
    }
  } catch {
    /* cookie 不可写 → RSC 退未选号引导态,client 请求不受影响 */
  }
}

/**
 * 直连 CreatorOS API 的统一客户端入口。
 *
 * contract client 已经会带当前账号，但知识 AI、本地文件等 escape-hatch route 仍需直接
 * fetch。此前这些调用点各自拼 header，最容易漏掉 `x-account-id`，造成页面明明已选号、
 * route 却在进入 AI/业务前直接报 AccountRequiredError。统一在这里附加：
 *   - 当前账号（localStorage 单一真值，并同步 cookie 供 RSC/服务端兜底）；
 *   - 桌面启动握手；
 *   - same-origin 凭据。
 */
export function creatorApiHeaders(
  input?: HeadersInit,
  options: { readonly includeCurrentAccount?: boolean } = {},
): Record<string, string> {
  const headers = Object.fromEntries(new Headers(input).entries());
  Object.assign(headers, handshakeHeaders());
  if (options.includeCurrentAccount !== false) {
    const currentAccountId = readCurrentAccountId();
    syncCurrentAccountCookie(currentAccountId);
    if (currentAccountId) headers["x-account-id"] = currentAccountId;
  } else {
    delete headers["x-account-id"];
  }
  return headers;
}

export function fetchCreatorApi(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { readonly includeCurrentAccount?: boolean } = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: creatorApiHeaders(init.headers, options),
    credentials: init.credentials ?? "same-origin",
  });
}

// These operations are user-scoped and validate their target IDs in their own
// service. A stale current-account selection must not block account recovery
// or binding another account. Account-owned reads/writes still use the header.
const USER_SCOPED_OPERATIONS = new Set([
  "accounts.list", "accounts.create", "accounts.get", "accounts.update", "accounts.archive",
  "platforms.capabilities.list", "platforms.bind.begin", "platforms.bind.confirm", "platforms.bind.cancel",
]);

/**
 * [T-332 S3] dispatch 结构化错误的类型化载体。之前只抛裸 Error(message 拼串),调用方
 * 无法可靠分支;现在保留同款 message(既有 catch 按文案匹配的行为不回归),额外带上
 * status / code / details,供上层按码翻译。S4 用 `isAccountRequiredError` 把 428 翻译成
 * 「请先绑定/选择抖音号」引导,而不是红色报错。
 */
export class HttpTransportError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    opts: {
      status: number;
      code?: string | null;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "HttpTransportError";
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.details = opts.details ?? {};
    Object.setPrototypeOf(this, HttpTransportError.prototype);
  }
}

// [T-332 S3] 结构化判定:未选号引导态错误(backend AccountRequiredError → dispatch 428)。
// 按 `.code` 判,不靠 instanceof(与 isAuthError 同理由:跨 bundle 稳定;也兼容非本
// transport 来源的同码错误,如 /api/chat 透传的结构化错误体)。
export function isAccountRequiredError(err: unknown): boolean {
  return (
    (err as { code?: unknown })?.code === ErrorCode.AccountRequiredError ||
    (err as { name?: unknown })?.name === "AccountRequiredError"
  );
}

// Client-safe transport: serializes the operation to the /api/v1 RPC dispatch
// route, which runs the handler against the SERVER store and returns the
// contract envelope. Browser islands use this so their mutations reach the
// same server-side store the server components render from.
//
// No server imports here — keeps the mock backend + canonicalDataset out of the
// client bundle. Stage 16 replaces the route's handler with real persistence;
// this transport is unchanged.
export function createHttpTransport(baseUrl = "/api/v1"): Transport {
  return {
    async request(endpoint: Endpoint, input) {
      const forceNewDouyin = endpoint.id === "ingestion.douyin.login" &&
        (input as { body?: { forceNew?: boolean } } | undefined)?.body?.forceNew === true;
      const res = await fetchCreatorApi(`${baseUrl}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Send the httpOnly session cookie so the route can derive the
        // RequestContext (multi-tenant). Same-origin defaults to sending it,
        // but make it explicit so a future base-url change can't silently drop
        // auth.
        credentials: "same-origin",
        body: JSON.stringify({ id: endpoint.id, input }),
      }, { includeCurrentAccount: !USER_SCOPED_OPERATIONS.has(endpoint.id) && !forceNewDouyin });
      if (!res.ok) {
        // 把后端的错误文案带上。否则前端只看到 "400/409",拿不到 DouyinNotLoggedInError /
        // 阶段交付物缺失 之类的可判定信息 —— 错误处理(未登录引导 / 进入下一步 gate 原因)失效。
        // dispatch body 有两种形状:① {error:"..."}(纯串);② {error:{code,message,details}}(结构化)。
        // 两者都抽出可读 message(结构化时优先 .message);[T-332 S3] 结构化时把 code/details
        // 一并带进 HttpTransportError,供调用方按码分支(如 AccountRequiredError → 选号引导)。
        let detail = "";
        let code: string | null = null;
        let details: Record<string, unknown> = {};
        try {
          const body = (await res.json()) as {
            error?: unknown;
          };
          const err = body?.error;
          if (typeof err === "string") {
            detail = `: ${err}`;
          } else if (err && typeof err === "object") {
            const structured = err as {
              message?: unknown;
              code?: unknown;
              details?: unknown;
            };
            if (typeof structured.message === "string") {
              detail = `: ${structured.message}`;
            }
            if (typeof structured.code === "string") {
              code = structured.code;
            }
            if (structured.details && typeof structured.details === "object") {
              details = structured.details as Record<string, unknown>;
            }
          }
        } catch {
          /* 非 JSON body,忽略 */
        }
        throw new HttpTransportError(
          `HttpTransport: ${res.status} for ${endpoint.id}${detail}`,
          { status: res.status, code, details },
        );
      }
      return res.json();
    },
  };
}
