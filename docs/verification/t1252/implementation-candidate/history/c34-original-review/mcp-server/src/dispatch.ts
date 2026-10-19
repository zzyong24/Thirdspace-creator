// HTTP dispatch 封装 —— MCP server 不直连 DB、不 import persistence-client(避免双持
// Pool 和调度器),一切能力都通过运行中的 Next dev server 的 /api/v1/dispatch 走一遍,
// 复用全部鉴权/transport/确认门语义,零重复装配。
//
// 鉴权:启动后首次调用时用 CREATOROS_EMAIL/CREATOROS_PASSWORD 走 POST /api/v1/auth/login
// 拿 httpOnly session cookie(creatoros_session);遇 401 自动重登一次再重试。
// T-046 本机免登录模式下 dispatch 也接受无 cookie(缺 env 时直接裸调),但登录逻辑
// 仍完整实现以对齐鉴权语义。

import { randomUUID } from "node:crypto";
import { Agent, type Dispatcher } from "undici";

/** 仅可信CLI/MCP宿主的本地观察控制，不进入公开input或工具参数。 */
export interface DispatchControl { signal?: AbortSignal; observationMs?: number; }

export interface DispatchClientOptions {
  /** 私有CLI装配控制；既有API参数与公开flags不变。 */
  control?: DispatchControl;
  cancelOnProcessSignal?: boolean;
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
}

/** dispatch 的 input 形状 = contract EndpointInput({ params, query, body })。 */
export interface DispatchInput {
  params?: unknown;
  query?: unknown;
  body?: unknown;
}

export interface DispatchCallOptions {
  groupId?: string;
  accountId?: string;
  idempotencyKey?: string;
  apply?: boolean;
  confirmImpact?: string;
}

// SEMANTIC_BOUNDARY_ALLOW: 仅校验并投影既有公开幂等回执字段，不推断业务结果、权限或创作选择。
export function invocationReceipt(envelope: unknown) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return undefined;
  const value = (envelope as { receipt?: unknown }).receipt;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const receipt = value as Record<string, unknown>;
  if (receipt.duplicate !== true || typeof receipt.requestId !== "string" || typeof receipt.status !== "string"
    || !(receipt.taskId === null || typeof receipt.taskId === "string")
    || !Array.isArray(receipt.targetRefs) || !receipt.targetRefs.every((ref) => typeof ref === "string")
    || typeof receipt.resultExpired !== "boolean" || typeof receipt.outcomeUnknown !== "boolean"
    || typeof receipt.manualReconcileRequired !== "boolean") return undefined;
  return {
    duplicate: true as const,
    requestId: receipt.requestId,
    status: receipt.status,
    taskId: receipt.taskId,
    targetRefs: receipt.targetRefs.filter((ref): ref is string => typeof ref === "string"),
    resultExpired: receipt.resultExpired,
    outcomeUnknown: receipt.outcomeUnknown,
    manualReconcileRequired: receipt.manualReconcileRequired,
  };
}

/** dispatch 失败时抛出,携带 HTTP status + 服务端错误信息(结构化或纯串)。 */
export class DispatchError extends Error {
  declare readonly receipt?: NonNullable<ReturnType<typeof invocationReceipt>>;
  declare readonly requestId?: string;
  constructor(
    public readonly status: number,
    public readonly opId: string,
    message: string,
    receipt?: NonNullable<ReturnType<typeof invocationReceipt>>,
  ) {
    super(`dispatch ${opId} failed (${status}): ${message}`);
    this.name = "DispatchError";
    if (receipt) {
      this.receipt = receipt;
      this.requestId = receipt.requestId;
    }
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

// SEMANTIC_BOUNDARY_ALLOW: 仅合成已批准的HTTP观察槽；不判断业务语义、不续原任务期限。
const POST_WAIT_MS = 8_100_000;
const LOGIN_WAIT_MS = 780_000;
const CLEANUP_WAIT_MS = 120_000;
const FINAL_MARGIN_MS = 60_000;
const MAX_TIMER_MS = 2_147_483_647;
export function dispatchObservationMs(hasCredentials: boolean): number {
  return (hasCredentials ? 2 * POST_WAIT_MS + 2 * LOGIN_WAIT_MS : POST_WAIT_MS)
    + CLEANUP_WAIT_MS + FINAL_MARGIN_MS;
}

export class DispatchObservationError extends Error {
  readonly code = "CLI_HTTP_OBSERVATION_FAILED";
  constructor(readonly opId: string, readonly phase: "before_request" | "request_sent" | "body_read",
    readonly outcomeUnknown: boolean) {
    super(outcomeUnknown ? `调用 ${opId} 的回执尚未确认；请核对原调用，不要重新发送。`
      : `调用 ${opId} 的本地观察已停止；没有新的业务回执。`);
    this.name = "DispatchObservationError";
  }
}

type Scope = {
  agent: Agent;
  controller: AbortController;
  deadline: number;
  postMs: number;
  phase: "before_request" | "request_sent" | "body_read";
  businessState: "not_sent" | "sent" | "known_response";
};
type HttpReply = { status: number; ok: boolean; headers: Headers; body: unknown };
function bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) return Promise.reject(Error("HTTP_PHASE_EXHAUSTED"));
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(Error("HTTP_PHASE_EXHAUSTED")), milliseconds);
  })]).finally(() => clearTimeout(timer));
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
  private readonly control: DispatchControl;
  private readonly cancelOnProcessSignal: boolean;
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
    this.control = options.control ?? {};
    this.cancelOnProcessSignal = options.cancelOnProcessSignal === true;
  }

  get hasCredentials(): boolean { return Boolean(this.email && this.password); }

  private async observe<T>(opId: string, control: DispatchControl, work: (scope: Scope) => Promise<T>): Promise<T> {
    const baseline = dispatchObservationMs(this.hasCredentials);
    const observationMs = control.observationMs ?? baseline;
    if (!Number.isSafeInteger(observationMs) || observationMs < baseline || observationMs > MAX_TIMER_MS)
      throw new RangeError("CLI_HTTP_OBSERVATION_BUDGET_INVALID");
    control.signal?.throwIfAborted();
    const entered = performance.now();
    const controller = new AbortController();
    const workMs = observationMs - CLEANUP_WAIT_MS - FINAL_MARGIN_MS;
    const postMs = POST_WAIT_MS + Math.floor((observationMs - baseline) / (this.hasCredentials ? 2 : 1));
    const agent = new Agent({ connect: { timeout: 120_000 }, headersTimeout: postMs,
      bodyTimeout: postMs, pipelining: 0 });
    const scope: Scope = { agent, controller, deadline: entered + workMs, postMs,
      phase: "before_request", businessState: "not_sent" };
    const abort = () => controller.abort(control.signal?.reason ?? Error("LOCAL_HTTP_OBSERVATION_CANCELLED"));
    const processAbort = () => controller.abort(Error("LOCAL_CLI_SIGNAL"));
    control.signal?.addEventListener("abort", abort, { once: true });
    if (control.signal?.aborted) abort();
    if (this.cancelOnProcessSignal) {
      process.once("SIGINT", processAbort); process.once("SIGTERM", processAbort);
    }
    const timer = setTimeout(() => controller.abort(Error("COMPLETE_HTTP_OBSERVATION_EXHAUSTED")), workMs);
    try {
      return await work(scope);
    } catch (error) {
      if (error instanceof DispatchError || error instanceof RangeError) throw error;
      throw new DispatchObservationError(opId, scope.phase, scope.businessState === "sent");
    } finally {
      clearTimeout(timer);
      control.signal?.removeEventListener("abort", abort);
      if (this.cancelOnProcessSignal) {
        process.removeListener("SIGINT", processAbort); process.removeListener("SIGTERM", processAbort);
      }
      // 业务成功/错误已经决定。cleanup不可从finally抛出、覆写回执或暗示重发。
      const cleanupDeadline = performance.now() + CLEANUP_WAIT_MS;
      let confirmed = false;
      try {
        await bounded(agent.close(), cleanupDeadline - performance.now()); confirmed = true;
      } catch {
        try {
          const destroying = agent.destroy();
          try { await bounded(destroying, cleanupDeadline - performance.now()); confirmed = true; }
          catch { void destroying.catch(() => undefined); }
        } catch { /* 清理同步异常也不能覆盖可信业务结果。 */ }
      }
      if (!confirmed) try { console.error("CREATOROS_HTTP_CLEANUP_UNCONFIRMED", { opId, phase: "cleanup", code: "OWN_AGENT_CLOSE_UNCONFIRMED" }); }
      catch { /* 诊断观察者不能更改业务交付。 */ }
    }
  }

  private async http(scope: Scope, opId: string, endpoint: "login" | "dispatch", init: RequestInit): Promise<HttpReply> {
    scope.controller.signal.throwIfAborted();
    const remaining = scope.deadline - performance.now();
    if (remaining <= 0) throw Error("COMPLETE_HTTP_OBSERVATION_EXHAUSTED");
    const phaseController = new AbortController();
    const abort = () => phaseController.abort(scope.controller.signal.reason);
    scope.controller.signal.addEventListener("abort", abort, { once: true });
    if (scope.controller.signal.aborted) abort();
    const phaseMs = Math.min(endpoint === "login" ? LOGIN_WAIT_MS : scope.postMs, remaining);
    const phaseDeadline = performance.now() + phaseMs;
    const check = () => {
      phaseController.signal.throwIfAborted();
      if (performance.now() >= phaseDeadline || performance.now() >= scope.deadline) {
        phaseController.abort(Error("COMPLETE_HTTP_PHASE_EXHAUSTED"));
        phaseController.signal.throwIfAborted();
      }
    };
    const timer = setTimeout(() => phaseController.abort(Error("COMPLETE_HTTP_PHASE_EXHAUSTED")), phaseMs);
    let rejectAborted!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const onAbort = () => rejectAborted(phaseController.signal.reason);
    phaseController.signal.addEventListener("abort", onAbort, { once: true });
    try {
      check();
      scope.phase = endpoint === "dispatch" ? "request_sent" : "before_request";
      if (endpoint === "dispatch") scope.businessState = "sent";
      const url = `${this.baseUrl}/api/v1/${endpoint === "login" ? "auth/login" : "dispatch"}`;
      const complete = (async () => {
        const response = await this.fetchImpl(url, { ...init, signal: phaseController.signal,
          dispatcher: scope.agent } as RequestInit & { dispatcher: Dispatcher });
        check();
        if (endpoint === "dispatch") scope.phase = "body_read";
        const text = await response.text();
        check();
        let body: unknown;
        try { body = JSON.parse(text); }
        catch (error) { if (endpoint === "dispatch" && response.ok) throw error; body = null; }
        check();
        if (endpoint === "dispatch") scope.businessState = "known_response";
        return { status: response.status, ok: response.ok, headers: response.headers, body };
      })();
      return await Promise.race([complete, aborted]);
    } finally {
      clearTimeout(timer);
      scope.controller.signal.removeEventListener("abort", abort);
      phaseController.signal.removeEventListener("abort", onAbort);
    }
  }

  private async loginWithin(scope: Scope): Promise<void> {
    if (!this.hasCredentials) return;
    const reply = await this.http(scope, "auth.login", "login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!reply.ok) throw new DispatchError(reply.status, "auth.login", extractErrorMessage(reply.body));
    this.sessionCookie = parseSessionCookie(reply.headers.get("set-cookie"));
    this.loggedIn = true;
  }

  async login(control: DispatchControl = this.control): Promise<void> {
    if (!this.hasCredentials) return;
    await this.observe("auth.login", control, scope => this.loginWithin(scope));
  }

  async dispatch(opId: string, input: DispatchInput = {}, callOptions: DispatchCallOptions = {},
    control: DispatchControl = this.control): Promise<unknown> {
    return this.observe(opId, control, async scope => {
      if (!this.loggedIn && this.hasCredentials) await this.loginWithin(scope);
      const reply = await this.post(scope, opId, input, callOptions);
      if (reply.status === 401 && this.hasCredentials) {
        await this.loginWithin(scope);
        return this.unwrap(await this.post(scope, opId, input, callOptions), opId);
      }
      return this.unwrap(reply, opId);
    });
  }

  private post(scope: Scope, opId: string, input: DispatchInput, callOptions: DispatchCallOptions): Promise<HttpReply> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.sessionCookie) headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(this.sessionCookie)}`;
    if (this.handshakeToken) headers["x-creatoros-handshake"] = this.handshakeToken;
    if (this.cliAccessToken) headers["x-creatoros-cli-access"] = this.cliAccessToken;
    if (this.cliAccessToken) headers["x-creatoros-cli-client-id"] = this.clientId;
    if (this.productId) headers["x-creatoros-cli-product-id"] = this.productId;
    if (this.packageId) headers["x-creatoros-cli-package-id"] = this.packageId;
    if (this.launchNonce) headers["x-creatoros-cli-launch-nonce"] = this.launchNonce;
    if (callOptions.groupId) headers["x-group-id"] = callOptions.groupId;
    if (callOptions.accountId) headers["x-account-id"] = callOptions.accountId;
    if (callOptions.idempotencyKey) headers["x-idempotency-key"] = callOptions.idempotencyKey;
    if (callOptions.apply) headers["x-creatoros-cli-apply"] = "1";
    if (callOptions.confirmImpact) headers["x-creatoros-cli-confirm-impact"] = callOptions.confirmImpact;
    return this.http(scope, opId, "dispatch", { method: "POST", headers, body: JSON.stringify({ id: opId, input }) });
  }

  private unwrap(reply: HttpReply, opId: string): unknown {
    if (!reply.ok) {
      const receipt = invocationReceipt(reply.body);
      let message = extractErrorMessage(reply.body);
      if (receipt && message === "unknown error") message = `原调用状态为 ${receipt.status}，请求编号 ${receipt.requestId}。`;
      throw new DispatchError(reply.status, opId, message, receipt);
    }
    return reply.body;
  }
}
