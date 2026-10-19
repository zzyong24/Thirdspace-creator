// HTTP dispatch 封装 —— MCP server 不直连 DB、不 import persistence-client(避免双持
// Pool 和调度器),一切能力都通过运行中的 Next dev server 的 /api/v1/dispatch 走一遍,
// 复用全部鉴权/transport/确认门语义,零重复装配。
//
// 鉴权:启动后首次调用时用 CREATOROS_EMAIL/CREATOROS_PASSWORD 走 POST /api/v1/auth/login
// 拿 httpOnly session cookie(creatoros_session);遇 401 自动重登一次再重试。
// T-046 本机免登录模式下 dispatch 也接受无 cookie(缺 env 时直接裸调),但登录逻辑
// 仍完整实现以对齐鉴权语义。

import { randomUUID } from "node:crypto";

export interface DispatchClientOptions {
  /** 运行中 CreatorOS 根地址。正式模式由 connection descriptor 提供。 */
  baseUrl: string;
  /** 登录邮箱(缺省 = 免登录模式,不带 cookie 裸调 dispatch) */
  email?: string;
  /** 登录密码 */
  password?: string;
  /** 注入 fetch,便于单测 mock;默认 globalThis.fetch */
  fetchImpl?: typeof fetch;
  /** 桌面 sidecar 启动级 handshake。 */
  handshakeToken?: string;
  /** 用户本次启动授予的 CLI 完整访问 token。 */
  cliAccessToken?: string;
  /** 单次 CLI/MCP 进程实例审计 ID；缺省随机生成。 */
  clientId?: string;
  productId?: string;
  packageId?: string;
  launchNonce?: string;
  paired?: {id:string;revision:string;token:string} | (()=>Promise<{id:string;revision:string;token:string}>);
}

/** dispatch 的 input 形状 = contract EndpointInput({ params, query, body })。 */
export interface DispatchInput {
  params?: unknown;
  query?: unknown;
  body?: unknown;
}

export interface DispatchCallOptions {
  accountId?: string;
  idempotencyKey?: string;
  apply?: boolean;
  confirmImpact?: string;
}

/** dispatch 失败时抛出,携带 HTTP status + 服务端错误信息(结构化或纯串)。 */
export class DispatchError extends Error {
  constructor(
    public readonly status: number,
    public readonly opId: string,
    message: string,
  ) {
    super(`dispatch ${opId} failed (${status}): ${message}`);
    this.name = "DispatchError";
  }
}

const SESSION_COOKIE = "creatoros_session";

/** 从 Set-Cookie 头里抽出 creatoros_session 的值(null = 该头没设这个 cookie)。 */
export function parseSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  // Set-Cookie 形如 "creatoros_session=xxx; HttpOnly; SameSite=Lax; Path=/; Expires=..."
  const match = setCookieHeader.match(
    new RegExp(`(?:^|,\\s*)${SESSION_COOKIE}=([^;]*)`),
  );
  if (!match) return null;
  const value = decodeURIComponent(match[1]!.trim());
  return value.length > 0 ? value : null;
}

/** 从错误 envelope 中抽出可读 message(兼容 {error:"..."} 和 {error:{message}} 两种形状)。 */
function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string") return err;
    if (
      err &&
      typeof err === "object" &&
      typeof (err as { message?: unknown }).message === "string"
    ) {
      return (err as { message: string }).message;
    }
  }
  return "unknown error";
}

export class DispatchClient {
  private readonly baseUrl: string;
  private readonly email: string | undefined;
  private readonly password: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly handshakeToken: string | undefined;
  private readonly cliAccessToken: string | undefined;
  private readonly clientId: string;
  private readonly productId: string | undefined;
  private readonly packageId: string | undefined;
  private readonly launchNonce: string | undefined;
  private readonly paired: DispatchClientOptions["paired"];
  private sessionCookie: string | null = null;
  private loggedIn = false;

  constructor(options: DispatchClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.email = options.email;
    this.password = options.password;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.handshakeToken = options.handshakeToken;
    this.cliAccessToken = options.cliAccessToken;
    this.clientId = options.clientId ?? `cli-${randomUUID()}`;
    this.productId = options.productId;
    this.packageId = options.packageId;
    this.launchNonce = options.launchNonce;
    this.paired = options.paired;
  }

  /** 是否配置了登录凭据(否则走 T-046 免登录裸调)。 */
  get hasCredentials(): boolean {
    return Boolean(this.email && this.password);
  }

  /** POST /api/v1/auth/login 拿 session cookie。凭据缺失时为 no-op。 */
  async login(): Promise<void> {
    if (!this.hasCredentials) return;
    const res = await this.fetchImpl(`${this.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) {
      let message = "unknown error";
      try {
        message = extractErrorMessage(await res.json());
      } catch {
        /* 非 JSON body,忽略 */
      }
      throw new DispatchError(res.status, "auth.login", message);
    }
    this.sessionCookie = parseSessionCookie(res.headers.get("set-cookie"));
    this.loggedIn = true;
  }

  /**
   * 调用一个 contract op。失败时抛 DispatchError;401 且配了凭据时自动重登一次再重试
   * (session 失效自愈)。返回 contract envelope 原样({ data, meta } 或 list 形)。
   */
  async dispatch(
    opId: string,
    input: DispatchInput = {},
    callOptions: DispatchCallOptions = {},
  ): Promise<unknown> {
    // 懒登录:首次调用先 login(免登录模式下是 no-op)。
    if (!this.loggedIn && this.hasCredentials) {
      await this.login();
    }
    const res = await this.post(opId, input, callOptions);
    if (res.status === 401 && this.hasCredentials) {
      // session 失效 → 重登一次再试。
      await this.login();
      const retry = await this.post(opId, input, callOptions);
      return this.unwrap(retry, opId);
    }
    return this.unwrap(res, opId);
  }

  private async post(
    opId: string,
    input: DispatchInput,
    callOptions: DispatchCallOptions,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.sessionCookie) {
      headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(this.sessionCookie)}`;
    }
    if (this.handshakeToken) headers["x-creatoros-handshake"] = this.handshakeToken;
    if (this.cliAccessToken) headers["x-creatoros-cli-access"] = this.cliAccessToken;
    if (this.cliAccessToken) headers["x-creatoros-cli-client-id"] = this.clientId;
    if (this.productId) headers["x-creatoros-cli-product-id"] = this.productId;
    if (this.packageId) headers["x-creatoros-cli-package-id"] = this.packageId;
    if (this.launchNonce) headers["x-creatoros-cli-launch-nonce"] = this.launchNonce;
    const paired=typeof this.paired==="function"?await this.paired():this.paired;
    if (paired) {
      headers["x-creatoros-paired-id"] = paired.id;
      headers["x-creatoros-paired-revision"] = paired.revision;
      headers["x-creatoros-paired-token"] = paired.token;
    }
    if (callOptions.accountId) headers["x-account-id"] = callOptions.accountId;
    if (callOptions.idempotencyKey) {
      headers["x-idempotency-key"] = callOptions.idempotencyKey;
    }
    if (callOptions.apply) headers["x-creatoros-cli-apply"] = "1";
    if (callOptions.confirmImpact) {
      headers["x-creatoros-cli-confirm-impact"] = callOptions.confirmImpact;
    }
    return this.fetchImpl(`${this.baseUrl}/api/v1/dispatch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: opId, input }),
    });
  }

  private async unwrap(res: Response, opId: string): Promise<unknown> {
    if (!res.ok) {
      let message = "unknown error";
      try {
        message = extractErrorMessage(await res.json());
      } catch {
        /* 非 JSON body,忽略 */
      }
      throw new DispatchError(res.status, opId, message);
    }
    return res.json();
  }
}
