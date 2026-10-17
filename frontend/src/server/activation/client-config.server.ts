import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  randomBytes,
  verify,
} from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { resolveMasterKey } from "@creatoros/backend";

import packageJson from "../../../package.json";
import { resolveActivationConfig } from "./activation-config";
import {
  readLicenseVerdictDetailed,
  resolveLicenseFilePath,
  type LicenseVerdict,
} from "./license-file.server";
import {
  assertVerdictProductIdentity,
  ProductIdentitySecurityError,
} from "./product-identity.server";

const TICKET_CONTRACT = "config-access-ticket-v3";
const LEGACY_DIRECTORY_TICKET_CONTRACT = "config-access-ticket-v2";
type TicketContract=typeof TICKET_CONTRACT|typeof LEGACY_DIRECTORY_TICKET_CONTRACT;
type ManagedCredentialStates=Readonly<Record<string,{readonly status:'ready'|'not_configured'|'unverified'|'unavailable';readonly reasonCode:string|null;readonly accountStatus?:'ready'|'not_configured'|'unverified'}>>;
const BUNDLE_CONTRACT = "growth-client-config-bundle-v1";
const CLIENT_ID = "creatoros.desktop";
const EXTENSION_KEY = "creatoros.model-config";
const PROTOCOL_VERSION = "creatoros-model-config-v1";
const AM_PATH = "/api/license/client-config-tickets";
const GROWTH_PATH = "/api/client-config/bundles/current";
const MANAGED_CREDENTIAL_PATH = "/api/client-config/managed-credentials/current";
const MANAGED_CREDENTIAL_CONTRACT = "growth-managed-model-credential-v1";
const MAX_RESPONSE_BYTES = 300_000;
const MAX_DATE_SKEW_MS = 300_000;
const OFFLINE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const RAW_ED25519_SPKI_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex",
);
const CACHE_PREFIX = "enc:v1:";
const CACHE_CONTEXT = "creatoros-channel-model-config-v1";
const CACHE_SCHEMA = "creatoros-channel-model-config-cache-v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ChannelModelJson = { readonly [key: string]: JsonValue };

type ChannelConfigBundle = {
  readonly revision: number;
  readonly payload: {
    readonly brandName: string | null;
    readonly purchaseUrl: string | null;
    readonly renewalUrl: string | null;
    readonly channelSupportUrl: string | null;
    readonly bugFeedbackUrl: string | null;
    readonly downloadUrl: string | null;
  };
};

type ClientConfigExtension = {
  readonly extensionKey: typeof EXTENSION_KEY;
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly revision: number;
  readonly payload: JsonValue;
};

export type SignedClientConfigBundle = {
  readonly contractVersion: typeof BUNDLE_CONTRACT;
  readonly bundleVersion: number;
  readonly projectKey: string;
  readonly channelRef: string;
  readonly clientId: typeof CLIENT_ID;
  readonly environment: string;
  readonly issuedAt: string;
  readonly softExpiresAt: string;
  readonly hardExpiresAt: string;
  readonly channelConfig: ChannelConfigBundle;
  readonly extensions: readonly ClientConfigExtension[];
  readonly bundleDigest: string;
  readonly keyId: string;
  readonly signature: string;
};

export type ClientConfigCacheRecord = {
  readonly state: "channel" | "local" | "quarantined" | "blocked";
  readonly outcome:
    | "configured"
    | "not_configured"
    | "unreachable"
    | "security_error";
  readonly checkedAt: string;
  /** 当前激活事实对应的唯一 locator；版本序列只能在这个作用域内比较。 */
  readonly activeLocator?: ClientConfigLocator;
  readonly bundle: SignedClientConfigBundle | null;
  readonly channel: {
    readonly projectKey: string;
    readonly channelRef: string;
    readonly bundleVersion: number;
    readonly bundleDigest: string;
    readonly extensionRevision: number;
    readonly payload: ChannelModelJson;
    /** 已验证目录外的单服务读取事实；不改签名payload，也不清原密钥。 */
    readonly managedCredentials?:ManagedCredentialStates;
  } | null;
  /** 其他 locator 的历史密文只作 inactive 序列保留，绝不参与当前版本/ETag 判定。 */
  readonly inactiveLocators?: readonly ClientConfigLocatorSnapshot[];
  readonly reason?:
    | "authorization_changed"
    | "authorization_expired"
    | "channel_terminated";
};

export type ClientConfigLocator = {
  readonly projectKey: string;
  readonly channelRef: string;
  readonly clientId: typeof CLIENT_ID;
};

export type ClientConfigLocatorSnapshot = {
  readonly locator: ClientConfigLocator;
  readonly bundle: SignedClientConfigBundle;
  readonly channel: ClientConfigCacheRecord["channel"];
};

export interface ClientConfigStore {
  load(): Promise<ClientConfigCacheRecord | null>;
  save(record: ClientConfigCacheRecord): Promise<void>;
}

export type ClientConfigProjection = {
  readonly authority: "channel" | "local";
  readonly outcome:
    | "configured"
    | "not_configured"
    | "activation_scope_missing"
    | "unreachable"
    | "security_error";
  readonly action: string;
  readonly retryable: boolean;
};

export type ChannelModelAuthority =
  | {
      readonly authority: "channel";
      readonly outcome: "configured";
      readonly payload: ChannelModelJson;
      readonly scopeId: string;
      readonly bundleDigest?: string;
      readonly managedCredentials?:ManagedCredentialStates;
    }
  | {
      readonly authority: "local";
      readonly outcome:
        | "not_configured"
        | "activation_scope_missing"
        | "unreachable"
        | "security_error";
      readonly payload: null;
    };

type ActiveVerdict = Pick<
  LicenseVerdict,
  | "allowed"
  | "status"
  | "code"
  | "machineId"
  | "projectKey"
  | "channelRef"
  | "licenseMode"
>;

export function deriveChannelModelScopeId(identity: {
  readonly projectKey: string;
  readonly channelRef: string;
  readonly clientId: string;
}): string {
  const fields = [identity.projectKey, identity.channelRef, identity.clientId];
  if (
    fields.some(
      (value) =>
        typeof value !== "string" || !value || /[\u0000-\u001f]/.test(value),
    )
  ) {
    throw new Error("channel model identity is invalid");
  }
  const material = JSON.stringify([
    "creatoros-channel-model-scope-v1",
    identity.projectKey,
    identity.channelRef,
    identity.clientId,
  ]);
  return createHash("sha256").update(material, "utf8").digest("hex");
}

type Dependencies = {
  readonly signal?: AbortSignal;
  /** 私有模型调用绑定；在同一次activeVerdict捕获后核验，不能从新的全局scope发票据。 */
  readonly expectedScopeId?:string;
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => Date;
  readonly nonce?: () => string;
  readonly fetchImpl?: typeof fetch;
  readonly readVerdict?: () => ReturnType<typeof readLicenseVerdictDetailed>;
  readonly store?: ClientConfigStore;
  /**
   * T-679：完整子 Key 只允许从 no-store 响应直接写入系统密钥库支持的密文仓库，
   * 不能进入公开 bundle、client-config cache、日志或 Web DTO。
   */
  readonly putManagedCredential?: (
    scopeId: string,
    serviceId: string,
    token: string,
  ) => Promise<void>;
};

type VerifiedAmResponse = {
  readonly status: number;
  readonly value: unknown;
};

type TicketResponse = {
  readonly contractVersion: TicketContract;
  readonly configAccessTicket: string;
  readonly expiresAt: string;
  readonly nonce: string;
};

export type FreshClientConfigAccess = {
  /** 仅限 server-only 调用链使用；不得写日志、普通缓存或返回给 Web。 */
  readonly configAccessTicket: string;
  readonly expiresAt: string;
  readonly growthOrigin: string;
};

function activationManagedServiceIds(payload: unknown): readonly string[] {
  const row = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
  const services = Array.isArray(row?.services) ? row.services : [];
  const ids = new Set<string>();
  for (const value of services) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const service = value as Record<string, unknown>;
    const credential = service.credential;
    if (!credential || typeof credential !== "object" || Array.isArray(credential)) continue;
    const credentialRow = credential as Record<string, unknown>;
    if (
      service.id === "omnihi-main" &&
      service.provider === "omnihi" &&
      credentialRow.type === "api_key" &&
      credentialRow.source === "activation_managed" &&
      credentialRow.allowMultiple === false
    ) {
      ids.add(service.id.trim());
    }
  }
  return [...ids];
}

async function pullManagedCredentials(input: {
  growthOrigin: string | URL; ticket: string; payload: unknown; scopeId: string;
  fetchImpl: typeof fetch; putManagedCredential?: Dependencies["putManagedCredential"];
}): Promise<ManagedCredentialStates> {
  const states:Record<string,ManagedCredentialStates[string]>={};
  if (!input.putManagedCredential) return states;
  for (const serviceId of activationManagedServiceIds(input.payload)) {
    const url=new URL(MANAGED_CREDENTIAL_PATH,input.growthOrigin);
    url.searchParams.set("serviceId",serviceId);url.searchParams.set("existingOnly","1");
    let response:Response;
    try{response=await fetchNoRedirect(input.fetchImpl,url.toString(),{method:"GET",headers:{Accept:"application/json",Authorization:`Bearer ${input.ticket}`}});}
    catch(error){if(error instanceof ClientConfigPullError&&error.code==='CLIENT_CONFIG_NETWORK_UNAVAILABLE'){states[serviceId]={status:'unverified',reasonCode:error.code};continue;}throw error;}
    if(response.headers.get("cache-control")!=="private, no-store"||response.headers.get("pragma")!=="no-cache")fail("CLIENT_CONFIG_INVALID","渠道模型凭据响应无法验证",false);
    let value:unknown;
    try{value=JSON.parse((await limitedBytes(response)).toString("utf8"));}catch{fail("CLIENT_CONFIG_INVALID","渠道模型凭据响应无法验证",false);}
    if(response.status!==200){
      if(!exactObject(value,['error'])||!exactObject(value.error,['code','message'])||typeof value.error.code!=='string'||typeof value.error.message!=='string')fail('CLIENT_CONFIG_INVALID','渠道模型凭据响应无法验证',false);
      const code=value.error.code;
      // SEMANTIC_BOUNDARY_ALLOW: 核上游明确协议状态，不猜额度、不把安全错误称为缺余额，也不重试旧开户入口。
      const absent=response.status===404&&['MODEL_CREDENTIAL_NOT_CONFIGURED','MANAGED_SERVICE_NOT_CONFIGURED','AI_CREDIT_ACCOUNT_LINK_REQUIRED'].includes(code);
      const pending=response.status===409&&['MODEL_CREDENTIAL_PROVISIONING','ACTIVATION_ACCOUNT_PROVISIONING','AI_CREDIT_BOOTSTRAP_PENDING'].includes(code);
      const unsupported=response.status===422&&code==='CLIENT_EXTENSION_INVALID';
      const serviceUnavailable=response.status===503&&['MODEL_PROVIDER_NOT_CONFIGURED','MODEL_PROVIDER_UNAVAILABLE','MODEL_PROVIDER_RESPONSE_INVALID','MODEL_PROVIDER_BUDGET_MISMATCH','MODEL_PROVIDER_KEY_CONFLICT','MODEL_PROVIDER_KEY_NOT_FOUND','MODEL_CREDENTIAL_KEY_UNAVAILABLE','MODEL_CREDENTIAL_CIPHERTEXT_INVALID','MODEL_CREDENTIAL_UNAVAILABLE'].includes(code);
      if(absent||pending||unsupported||serviceUnavailable){states[serviceId]={status:absent?'not_configured':pending||unsupported?'unverified':'unavailable',reasonCode:code};continue;}
      parseGrowthError(response,value);
    }
    const body=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
    const credential=body?.credential;
    const row=credential&&typeof credential==='object'&&!Array.isArray(credential)?credential as Record<string,unknown>:null;
    const token=typeof row?.token==='string'?row.token.trim():'';
    if(body?.contractVersion!==MANAGED_CREDENTIAL_CONTRACT||body?.serviceId!==serviceId||row?.type!=='api_key'||!token)fail('CLIENT_CONFIG_INVALID','渠道模型凭据响应无法验证',false);
    await input.putManagedCredential(input.scopeId,serviceId,token);
    // token 只证明凭据；账户存在必须来自同一 existingOnly 响应的严格 wallet 投影。
    // AICA referenceId 和金额仅在本次服务端验证，不持久化、不返回给 Web。
    const wallet=body.wallet;
    let accountStatus:'ready'|'not_configured'|'unverified'='unverified';
    if(exactObject(wallet,['linked','availableUnits','referenceId'])){
      if(wallet.linked===true&&typeof wallet.referenceId==='string'&&/^AICA-[A-Za-z0-9_-]{6,96}$/.test(wallet.referenceId)&&typeof wallet.availableUnits==='number'&&Number.isSafeInteger(wallet.availableUnits)&&wallet.availableUnits>=0)accountStatus='ready';
      else if(wallet.linked===false&&wallet.referenceId===null&&wallet.availableUnits===null)accountStatus='not_configured';
    }
    states[serviceId]={status:'ready',reasonCode:null,accountStatus};
  }
  return states;
}

export class ClientConfigPullError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ClientConfigPullError";
  }
}

export class ClientConfigCacheSecurityError extends ClientConfigPullError {
  constructor() {
    super(
      "CLIENT_CONFIG_CACHE_SECURITY_ERROR",
      "本机渠道配置安全校验未通过",
      false,
    );
    this.name = "ClientConfigCacheSecurityError";
  }
}

function fail(code: string, message: string, retryable: boolean): never {
  throw new ClientConfigPullError(code, message, retryable);
}

function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isJsonValue(
  value: unknown,
  depth = 0,
  seen = { bytes: 0 },
): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    seen.bytes += Buffer.byteLength(value, "utf8");
    return seen.bytes <= 262_144;
  }
  if (Array.isArray(value)) {
    return value.every((child) => isJsonValue(child, depth + 1, seen));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).every(([key, child]) => {
      seen.bytes += Buffer.byteLength(key, "utf8");
      return (
        seen.bytes <= 262_144 && isJsonValue(child, depth + 1, seen)
      );
    });
  }
  return false;
}

/**
 * RFC 8785 对 JSON 域使用 ECMAScript number/string serialization，并递归按 key 排序。
 * Growth transport 已拒绝重复键、非有限数和超深输入；这里仍独立做同样的 closed 检查。
 */
function canonicalJson(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function parseUtcMs(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicKey(rawBase64: string) {
  const raw = Buffer.from(rawBase64.trim(), "base64");
  if (raw.length !== 32) {
    fail(
      "CLIENT_CONFIG_PENDING",
      "渠道配置验签材料尚未就绪",
      false,
    );
  }
  return createPublicKey({
    key: Buffer.concat([RAW_ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

function resolveHttpsOrigin(value: string | undefined, label: string): URL {
  if (!value?.trim()) {
    fail("CLIENT_CONFIG_PENDING", `${label}尚未配置`, false);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail("CLIENT_CONFIG_PENDING", `${label}配置无效`, false);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    fail("CLIENT_CONFIG_PENDING", `${label}配置无效`, false);
  }
  return parsed;
}

function activeVerdict(
  result: Awaited<ReturnType<typeof readLicenseVerdictDetailed>>,
): ActiveVerdict {
  const verdict = result.verdict;
  if (
    result.state !== "ready" ||
    !verdict ||
    verdict.allowed !== true ||
    !verdict.code ||
    !verdict.machineId ||
    !verdict.projectKey
  ) {
    fail(
      "CLIENT_CONFIG_LICENSE_UNAVAILABLE",
      "当前没有可用于同步渠道配置的有效授权",
      false,
    );
  }
  if (!verdict.channelRef) {
    fail(
      "CLIENT_CONFIG_ACTIVATION_SCOPE_MISSING",
      "授权缺少渠道信息，无法同步受管模型",
      false,
    );
  }
  return verdict;
}

function assertConfigObserverLive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("已停止等待，原权益仍可重新核对", "AbortError");
}
function observedConfigFetch(fetchImpl: typeof fetch, signal?: AbortSignal): typeof fetch {
  if (!signal) return fetchImpl;
  return (input, init) => {
    assertConfigObserverLive(signal);
    return fetchImpl(input, { ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
  };
}

async function fetchNoRedirect(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(input, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(executionTimeoutMs(10_000)),
    });
  } catch {
    return fail(
      "CLIENT_CONFIG_NETWORK_UNAVAILABLE",
      "配置服务暂时不可用",
      true,
    );
  }
}

async function limitedBytes(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "配置服务响应无法验证，请稍后重试",
      true,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_RESPONSE_BYTES) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "配置服务响应无法验证，请稍后重试",
      true,
    );
  }
  return bytes;
}

async function verifyAmResponse(
  response: Response,
  requestUrl: string,
  rawPublicKey: string,
  now: Date,
): Promise<VerifiedAmResponse> {
  const bytes = await limitedBytes(response);
  const contentType = response.headers.get("content-type") ?? "";
  const cacheControl = response.headers.get("cache-control") ?? "";
  const signature = response.headers.get("x-license-signature");
  const date = response.headers.get("x-license-date");
  const digest = response.headers.get("x-license-digest");
  const computed = `SHA-256=${createHash("sha256")
    .update(bytes)
    .digest("base64")}`;
  const parsedDate = date ? Date.parse(date) : Number.NaN;
  if (
    !signature ||
    !date ||
    !contentType.toLowerCase().startsWith("application/json") ||
    !/(?:^|,)\s*(?:private,\s*)?no-store(?:\s*,|$)/i.test(cacheControl) ||
    digest !== computed ||
    !Number.isFinite(parsedDate) ||
    Math.abs(now.getTime() - parsedDate) > MAX_DATE_SKEW_MS
  ) {
    fail(
      "CLIENT_CONFIG_AUTHORITY_INVALID",
      "授权服务响应无法验证，请稍后重试",
      true,
    );
  }
  const url = new URL(requestUrl);
  const signingInput = `post ${url.pathname}\n${url.host}\n${date}\n${computed}`;
  const signatureBytes = Buffer.from(signature, "base64");
  if (
    signatureBytes.length !== 64 ||
    !verify(
      null,
      Buffer.from(signingInput),
      publicKey(rawPublicKey),
      signatureBytes,
    )
  ) {
    fail(
      "CLIENT_CONFIG_AUTHORITY_INVALID",
      "授权服务响应无法验证，请稍后重试",
      true,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    return fail(
      "CLIENT_CONFIG_AUTHORITY_INVALID",
      "授权服务响应无法验证，请稍后重试",
      true,
    );
  }
  return { status: response.status, value };
}

function validateGrowthSuccessHeaders(response: Response): string {
  const cacheControl = response.headers.get("cache-control") ?? "";
  const correlationId = response.headers.get("x-correlation-id") ?? "";
  if (
    !/(?:^|,)\s*(?:private,\s*)?no-store(?:\s*,|$)/i.test(cacheControl) ||
    !/^cor_[0-9a-f]{32}$/.test(correlationId) ||
    (response.status === 200 &&
      !(response.headers.get("content-type") ?? "")
        .toLowerCase()
        .startsWith("application/json"))
  ) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "配置服务响应头无法验证，请稍后重试",
      true,
    );
  }
  return correlationId;
}

function parseTicket(
  response: VerifiedAmResponse,
  expectedNonce: string,
  now: Date,
  expectedVersion:TicketContract=TICKET_CONTRACT,
): TicketResponse {
  if (response.status !== 200) {
    const value = response.value;
    if (
      !exactObject(value, ["success", "error"]) ||
      value.success !== false ||
      !exactObject(value.error, ["code", "message"]) ||
      typeof value.error.code !== "string"
    ) {
      fail(
        "CLIENT_CONFIG_AUTHORITY_INVALID",
        "授权服务响应无法验证，请稍后重试",
        true,
      );
    }
    const code = value.error.code;
    if (code === "LICENSE_REVOKED") {
      fail(
        "CLIENT_CONFIG_ACCESS_REVOKED",
        "当前授权已失效，请重新激活后重试",
        false,
      );
    }
    if (code === "LICENSE_EXPIRED") {
      fail(
        "CLIENT_CONFIG_ACCESS_EXPIRED",
        "当前授权已到期，请续费后重试",
        false,
      );
    }
    if (
      code === "LICENSE_BINDING_MISMATCH" ||
      code === "LICENSE_CHANNEL_UNAVAILABLE"
    ) {
      fail(
        "CLIENT_CONFIG_ACCESS_CHANGED",
        "授权状态刚刚变化，请重新激活后重试",
        false,
      );
    }
    if (code === "CONFIG_TICKET_SIGNING_UNAVAILABLE") {
      fail(
        "CLIENT_CONFIG_AUTHORITY_UNAVAILABLE",
        "配置授权服务暂时不可用，请稍后重试",
        true,
      );
    }
    if (code === "CONFIG_TICKET_REQUEST_INVALID") {
      fail(
        "CLIENT_CONFIG_NOT_APPLICABLE",
        "当前激活未提供渠道模型配置",
        false,
      );
    }
    fail(
      "CLIENT_CONFIG_ACCESS_DENIED",
      "当前授权无法同步渠道配置",
      false,
    );
  }
  const value = response.value;
  if (
    !exactObject(value, [
      "configAccessTicket",
      "contractVersion",
      "expiresAt",
      "nonce",
    ]) ||
    value.contractVersion !== expectedVersion ||
    typeof value.configAccessTicket !== "string" ||
    value.configAccessTicket.length < 5 ||
    value.nonce !== expectedNonce
  ) {
    fail(
      "CLIENT_CONFIG_AUTHORITY_INVALID",
      "授权服务响应无法验证，请稍后重试",
      true,
    );
  }
  const expiresAt = parseUtcMs(value.expiresAt);
  if (
    expiresAt === null ||
    expiresAt <= now.getTime() ||
    expiresAt - now.getTime() > MAX_DATE_SKEW_MS + 30_000
  ) {
    fail(
      "CLIENT_CONFIG_AUTHORITY_INVALID",
      "本次配置授权已失效，请重试",
      true,
    );
  }
  return value as TicketResponse;
}

function parseBundleShape(value: unknown): SignedClientConfigBundle {
  const topKeys = [
    "bundleDigest",
    "bundleVersion",
    "channelConfig",
    "channelRef",
    "clientId",
    "contractVersion",
    "environment",
    "extensions",
    "hardExpiresAt",
    "issuedAt",
    "keyId",
    "projectKey",
    "signature",
    "softExpiresAt",
  ] as const;
  if (!exactObject(value, topKeys)) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "渠道配置响应格式不受支持，请升级后重试",
      false,
    );
  }
  if (
    value.contractVersion !== BUNDLE_CONTRACT ||
    value.clientId !== CLIENT_ID ||
    typeof value.bundleVersion !== "number" ||
    !Number.isSafeInteger(value.bundleVersion) ||
    value.bundleVersion < 1 ||
    typeof value.projectKey !== "string" ||
    typeof value.channelRef !== "string" ||
    typeof value.environment !== "string" ||
    typeof value.bundleDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.bundleDigest) ||
    typeof value.keyId !== "string" ||
    typeof value.signature !== "string" ||
    !Array.isArray(value.extensions) ||
    !exactObject(value.channelConfig, ["payload", "revision"]) ||
    typeof value.channelConfig.revision !== "number" ||
    !Number.isSafeInteger(value.channelConfig.revision) ||
    value.channelConfig.revision < 1 ||
    !exactObject(value.channelConfig.payload, [
      "brandName",
      "bugFeedbackUrl",
      "channelSupportUrl",
      "downloadUrl",
      "purchaseUrl",
      "renewalUrl",
    ])
  ) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "渠道配置响应无法验证，请稍后重试",
      false,
    );
  }
  for (const entry of Object.values(value.channelConfig.payload)) {
    if (entry !== null && typeof entry !== "string") {
      fail(
        "CLIENT_CONFIG_INVALID",
        "渠道配置响应无法验证，请稍后重试",
        false,
      );
    }
  }
  if (value.extensions.length > 1) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "当前产品配置响应无法验证，请稍后重试",
      false,
    );
  }
  if (value.extensions.length === 0) {
    return value as unknown as SignedClientConfigBundle;
  }
  if (
    !exactObject(value.extensions[0], [
      "extensionKey",
      "payload",
      "protocolVersion",
      "revision",
    ]) ||
    value.extensions[0].extensionKey !== EXTENSION_KEY
  ) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "当前产品配置响应无法验证，请稍后重试",
      false,
    );
  }
  const extension = value.extensions[0];
  if (extension.protocolVersion !== PROTOCOL_VERSION) {
    fail(
      "CLIENT_PROTOCOL_NOT_SUPPORTED",
      "当前渠道配置需要更新应用后才能使用",
      false,
    );
  }
  if (
    typeof extension.revision !== "number" ||
    !Number.isSafeInteger(extension.revision) ||
    extension.revision < 1 ||
    !isJsonValue(extension.payload) ||
    !extension.payload ||
    typeof extension.payload !== "object" ||
    Array.isArray(extension.payload)
  ) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "当前产品配置无法解析，请联系官方处理",
      false,
    );
  }
  return value as unknown as SignedClientConfigBundle;
}

function bundleSemantic(bundle: SignedClientConfigBundle): JsonValue {
  const semantic = { ...bundle } as Record<string, JsonValue>;
  delete semantic.bundleDigest;
  delete semantic.keyId;
  delete semantic.signature;
  return semantic;
}

function verifyBundle(
  raw: unknown,
  verdict: ActiveVerdict,
  env: Record<string, string | undefined>,
  now: Date,
): SignedClientConfigBundle {
  const bundle = parseBundleShape(raw);
  if (
    bundle.projectKey !== verdict.projectKey ||
    bundle.channelRef !== verdict.channelRef
  ) {
    fail(
      "CLIENT_CONFIG_IDENTITY_MISMATCH",
      "授权渠道与配置不一致，请重新激活后重试",
      false,
    );
  }
  const expectedKeyId = env.CREATOROS_GROWTH_CONFIG_KEY_ID?.trim();
  if (!expectedKeyId || bundle.keyId !== expectedKeyId) {
    fail(
      "CLIENT_CONFIG_SIGNATURE_INVALID",
      "渠道配置签名无法验证，请稍后重试",
      false,
    );
  }
  const semantic = bundleSemantic(bundle);
  const digest = `sha256:${createHash("sha256")
    .update(canonicalJson(semantic))
    .digest("hex")}`;
  if (digest !== bundle.bundleDigest) {
    fail(
      "CLIENT_CONFIG_SIGNATURE_INVALID",
      "渠道配置签名无法验证，请稍后重试",
      false,
    );
  }
  const signedObject = {
    ...(semantic as Record<string, JsonValue>),
    bundleDigest: bundle.bundleDigest,
    keyId: bundle.keyId,
  };
  const signature = Buffer.from(bundle.signature, "base64url");
  if (
    signature.length !== 64 ||
    !verify(
      null,
      Buffer.from(canonicalJson(signedObject)),
      publicKey(env.CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64 ?? ""),
      signature,
    )
  ) {
    fail(
      "CLIENT_CONFIG_SIGNATURE_INVALID",
      "渠道配置签名无法验证，请稍后重试",
      false,
    );
  }
  const issuedAt = parseUtcMs(bundle.issuedAt);
  const softExpiresAt = parseUtcMs(bundle.softExpiresAt);
  const hardExpiresAt = parseUtcMs(bundle.hardExpiresAt);
  if (
    issuedAt === null ||
    softExpiresAt === null ||
    hardExpiresAt === null ||
    issuedAt > now.getTime() + MAX_DATE_SKEW_MS ||
    softExpiresAt <= issuedAt ||
    softExpiresAt - issuedAt > OFFLINE_TOLERANCE_MS ||
    hardExpiresAt < softExpiresAt ||
    now.getTime() >= hardExpiresAt
  ) {
    fail(
      "CLIENT_CONFIG_EXPIRED",
      "渠道配置已过期，请联网后重试",
      false,
    );
  }
  return bundle;
}

function project(
  authority: "channel" | "local",
  outcome: ClientConfigProjection["outcome"],
): ClientConfigProjection {
  const actions = {
    configured: "渠道模型正在使用",
    not_configured: "本地模型正在使用 · 渠道未配置",
    activation_scope_missing: "授权缺少渠道信息，无法同步受管模型",
    unreachable: "本地模型正在使用 · 暂时无法取得渠道配置",
    security_error: "本地模型正在使用 · 渠道配置安全校验未通过",
  } as const;
  return {
    authority,
    outcome,
    action: actions[outcome],
    retryable: outcome === "unreachable",
  };
}

function isOfflineEligible(error: unknown): boolean {
  return (
    error instanceof ClientConfigPullError &&
    (error.code === "CLIENT_CONFIG_NETWORK_UNAVAILABLE" ||
      error.code === "CLIENT_CONFIG_AUTHORITY_UNAVAILABLE")
  );
}

function blockReason(error: ClientConfigPullError) {
  if (error.code === "CLIENT_CONFIG_ACCESS_REVOKED") {
    return "authorization_changed" as const;
  }
  if (error.code === "CLIENT_CONFIG_ACCESS_EXPIRED") {
    return "authorization_expired" as const;
  }
  if (
    error.code === "CLIENT_CONFIG_ACCESS_CHANGED" ||
    error.code === "CLIENT_CONFIG_ACCESS_DENIED"
  ) {
    return "authorization_changed" as const;
  }
  if (error.code === "CLIENT_CONFIG_CHANNEL_TERMINATED") {
    return "channel_terminated" as const;
  }
  return null;
}

function parseGrowthError(response: Response, value: unknown): never {
  if (response.status >= 500) {
    fail(
      "CLIENT_CONFIG_AUTHORITY_UNAVAILABLE",
      "配置服务暂时不可用，请稍后重试",
      true,
    );
  }
  if (
    !exactObject(value, ["error"]) ||
    !exactObject(value.error, ["code", "message"]) ||
    typeof value.error.code !== "string" ||
    typeof value.error.message !== "string"
  ) {
    fail(
      "CLIENT_CONFIG_INVALID",
      "配置服务响应无法验证，请稍后重试",
      true,
    );
  }
  const code = value.error.code;
  if (
    response.status === 403 &&
    (code === "CONFIG_ACCESS_DENIED" ||
      code === "CONFIG_ACCESS_TICKET_INVALID")
  ) {
    fail(
      "CLIENT_CONFIG_ACCESS_REVOKED",
      "当前授权已失效，请重新激活后重试",
      false,
    );
  }
  if (response.status === 410 && code === "CHANNEL_TERMINATED") {
    fail(
      "CLIENT_CONFIG_CHANNEL_TERMINATED",
      "当前渠道已停止服务，请联系官方处理",
      false,
    );
  }
  if (response.status === 401) {
    fail(
      "CLIENT_CONFIG_ACCESS_DENIED",
      "本次配置授权已失效，请重试",
      false,
    );
  }
  fail(
    "CLIENT_CONFIG_REMOTE_REJECTED",
    "当前配置暂不可用，请稍后重试",
    response.status >= 500,
  );
}

function locatorFromVerdict(verdict: ActiveVerdict): ClientConfigLocator {
  return {
    projectKey: verdict.projectKey!,
    channelRef: verdict.channelRef!,
    clientId: CLIENT_ID,
  };
}

function locatorFromBundle(
  bundle: SignedClientConfigBundle,
): ClientConfigLocator {
  return {
    projectKey: bundle.projectKey,
    channelRef: bundle.channelRef,
    clientId: bundle.clientId,
  };
}

function sameLocator(
  left: ClientConfigLocator | null | undefined,
  right: ClientConfigLocator | null | undefined,
): boolean {
  return Boolean(
    left &&
      right &&
      left.projectKey === right.projectKey &&
      left.channelRef === right.channelRef &&
      left.clientId === right.clientId,
  );
}

function snapshotFromRecord(
  record: ClientConfigCacheRecord,
): ClientConfigLocatorSnapshot | null {
  if (!record.bundle) return null;
  return {
    locator: locatorFromBundle(record.bundle),
    bundle: record.bundle,
    channel: record.channel,
  };
}

function dedupeSnapshots(
  snapshots: readonly ClientConfigLocatorSnapshot[],
): ClientConfigLocatorSnapshot[] {
  const result: ClientConfigLocatorSnapshot[] = [];
  for (const snapshot of snapshots) {
    if (result.some((item) => sameLocator(item.locator, snapshot.locator))) {
      continue;
    }
    result.push(snapshot);
  }
  return result;
}

/**
 * 把单文件 cache 切到当前激活 locator 的独立版本序列。其他 locator 只进 inactive 密文集合：
 * 不发它的 ETag、不比较版本，也不会因网络失败重新激活。
 */
function scopeRecordToLocator(
  record: ClientConfigCacheRecord | null,
  verdict: ActiveVerdict,
): ClientConfigCacheRecord | null {
  if (!record) return null;
  const target = locatorFromVerdict(verdict);
  const currentLocator =
    record.activeLocator ??
    (record.bundle ? locatorFromBundle(record.bundle) : null);
  const inactive = [...(record.inactiveLocators ?? [])];
  if (sameLocator(currentLocator, target)) {
    return {
      ...record,
      activeLocator: target,
      inactiveLocators: dedupeSnapshots(inactive),
    };
  }

  const currentSnapshot = snapshotFromRecord(record);
  const candidates = dedupeSnapshots([
    ...(currentSnapshot ? [currentSnapshot] : []),
    ...inactive,
  ]);
  const selected = candidates.find((item) => sameLocator(item.locator, target));
  return {
    state: "local",
    outcome: "unreachable",
    checkedAt: record.checkedAt,
    activeLocator: target,
    bundle: selected?.bundle ?? null,
    channel: selected?.channel ?? null,
    inactiveLocators: candidates.filter(
      (item) => !sameLocator(item.locator, target),
    ),
  };
}

function parseCacheLocator(value: unknown): ClientConfigLocator {
  if (
    !exactObject(value, ["channelRef", "clientId", "projectKey"]) ||
    typeof value.projectKey !== "string" ||
    typeof value.channelRef !== "string" ||
    value.clientId !== CLIENT_ID
  ) {
    throw new ClientConfigCacheSecurityError();
  }
  return value as ClientConfigLocator;
}

function parseCacheChannel(
  value: unknown,
): ClientConfigCacheRecord["channel"] {
  if (value === null) return null;
  if (
    !exactObject(value, [
      "bundleDigest",
      "bundleVersion",
      "channelRef",
      "extensionRevision",
      "payload",
      "projectKey",
      ...(value&&typeof value==='object'&&Object.hasOwn(value,'managedCredentials')?['managedCredentials']:[]),
    ]) ||
    typeof value.projectKey !== "string" ||
    typeof value.channelRef !== "string" ||
    typeof value.bundleVersion !== "number" ||
    !Number.isSafeInteger(value.bundleVersion) ||
    typeof value.bundleDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.bundleDigest) ||
    typeof value.extensionRevision !== "number" ||
    !Number.isSafeInteger(value.extensionRevision) ||
    !isJsonValue(value.payload) ||
    !value.payload ||
    typeof value.payload !== "object" ||
    Array.isArray(value.payload)
  ) {
    throw new ClientConfigCacheSecurityError();
  }
  if(value.managedCredentials!==undefined){
    const states=value.managedCredentials;
    if(!states||typeof states!=='object'||Array.isArray(states)||Object.entries(states).some(([id,row])=>id!=='omnihi-main'||!exactObject(row,row&&typeof row==='object'&&Object.hasOwn(row,'accountStatus')?['status','reasonCode','accountStatus']:['status','reasonCode'])||typeof row.status!=='string'||!['ready','not_configured','unverified','unavailable'].includes(row.status)||(row.reasonCode!==null&&(typeof row.reasonCode!=='string'||!/^[_A-Z0-9]{1,128}$/.test(row.reasonCode)))||(row.accountStatus!==undefined&&(typeof row.accountStatus!=='string'||!['ready','not_configured','unverified'].includes(row.accountStatus)))))throw new ClientConfigCacheSecurityError();
  }
  return value as ClientConfigCacheRecord["channel"];
}

function parseCachedBundle(value: unknown): SignedClientConfigBundle {
  try {
    return parseBundleShape(value);
  } catch {
    throw new ClientConfigCacheSecurityError();
  }
}

function parseCacheRecord(value: unknown): ClientConfigCacheRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClientConfigCacheSecurityError();
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set([
    "activeLocator",
    "bundle",
    "channel",
    "checkedAt",
    "inactiveLocators",
    "outcome",
    "reason",
    "state",
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new ClientConfigCacheSecurityError();
  }
  if (
    !["channel", "local", "quarantined", "blocked"].includes(
      String(raw.state),
    ) ||
    ![
      "configured",
      "not_configured",
      "unreachable",
      "security_error",
    ].includes(String(raw.outcome)) ||
    parseUtcMs(raw.checkedAt) === null
  ) {
    throw new ClientConfigCacheSecurityError();
  }
  const bundle =
    raw.bundle === null ? null : parseCachedBundle(raw.bundle);
  const activeLocator =
    raw.activeLocator === undefined
      ? bundle
        ? locatorFromBundle(bundle)
        : undefined
      : parseCacheLocator(raw.activeLocator);
  const channel = parseCacheChannel(raw.channel);
  if (
    raw.reason !== undefined &&
    ![
      "authorization_changed",
      "authorization_expired",
      "channel_terminated",
    ].includes(String(raw.reason))
  ) {
    throw new ClientConfigCacheSecurityError();
  }
  if (
    raw.inactiveLocators !== undefined &&
    !Array.isArray(raw.inactiveLocators)
  ) {
    throw new ClientConfigCacheSecurityError();
  }
  const inactiveLocators = (
    (raw.inactiveLocators ?? []) as unknown[]
  ).map((item) => {
    if (
      !exactObject(item, ["bundle", "channel", "locator"])
    ) {
      throw new ClientConfigCacheSecurityError();
    }
    const locator = parseCacheLocator(item.locator);
    const inactiveBundle = parseCachedBundle(item.bundle);
    if (!sameLocator(locator, locatorFromBundle(inactiveBundle))) {
      throw new ClientConfigCacheSecurityError();
    }
    return {
      locator,
      bundle: inactiveBundle,
      channel: parseCacheChannel(item.channel),
    };
  });
  if (
    activeLocator &&
    bundle &&
    !sameLocator(activeLocator, locatorFromBundle(bundle))
  ) {
    throw new ClientConfigCacheSecurityError();
  }
  if (
    new Set(
      inactiveLocators.map(
        (item) =>
          `${item.locator.projectKey}\u0000${item.locator.channelRef}\u0000${item.locator.clientId}`,
      ),
    ).size !== inactiveLocators.length ||
    inactiveLocators.some((item) =>
      sameLocator(item.locator, activeLocator),
    )
  ) {
    throw new ClientConfigCacheSecurityError();
  }
  return {
    state: raw.state as ClientConfigCacheRecord["state"],
    outcome: raw.outcome as ClientConfigCacheRecord["outcome"],
    checkedAt: raw.checkedAt as string,
    ...(activeLocator ? { activeLocator } : {}),
    bundle,
    channel,
    inactiveLocators,
    ...(raw.reason
      ? { reason: raw.reason as NonNullable<ClientConfigCacheRecord["reason"]> }
      : {}),
  };
}

export class EncryptedClientConfigStore implements ClientConfigStore {
  constructor(
    private readonly path: string,
    private readonly key: Buffer,
  ) {}

  async load(): Promise<ClientConfigCacheRecord | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      return this.quarantineDamagedFile();
    }
    try {
      const encoded = raw.trim();
      if (!encoded.startsWith(CACHE_PREFIX)) {
        throw new ClientConfigCacheSecurityError();
      }
      const base64 = encoded.slice(CACHE_PREFIX.length);
      if (
        !base64 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
        base64.length % 4 !== 0
      ) {
        throw new ClientConfigCacheSecurityError();
      }
      const packed = Buffer.from(base64, "base64");
      if (
        packed.length <= IV_BYTES + TAG_BYTES ||
        packed.toString("base64") !== base64
      ) {
        throw new ClientConfigCacheSecurityError();
      }
      const iv = packed.subarray(0, IV_BYTES);
      const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
      const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      const envelope: unknown = JSON.parse(plain);
      if (
        !exactObject(envelope, ["record", "schemaVersion"]) ||
        envelope.schemaVersion !== CACHE_SCHEMA
      ) {
        throw new ClientConfigCacheSecurityError();
      }
      return parseCacheRecord(envelope.record);
    } catch {
      return this.quarantineDamagedFile();
    }
  }

  private async quarantineDamagedFile(): Promise<never> {
    const quarantinedPath = `${this.path}.corrupt.${Date.now()}.${randomBytes(6).toString("hex")}`;
    try {
      await rename(this.path, quarantinedPath);
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw new ClientConfigCacheSecurityError();
      }
    }
    throw new ClientConfigCacheSecurityError();
  }

  async save(record: ClientConfigCacheRecord): Promise<void> {
    // 校验并统一可选字段；回读解析会重建对象，字段插入顺序不是完整性判据。
    const expected = parseCacheRecord(record);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plain = Buffer.from(
      JSON.stringify({ schemaVersion: CACHE_SCHEMA, record: expected }),
    );
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    const encoded = `${CACHE_PREFIX}${packed.toString("base64")}\n`;
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true });
    const temp = join(
      dir,
      `.channel-model-config.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(encoded, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temp, 0o600);
    try {
      await rename(temp, this.path);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    // Windows的只读目录句柄不能FlushFileBuffers；文件sync与认证读回仍是必经步骤。
    // POSIX保留目录fsync，真实文件/权限错误不能被兼容分支吞掉。
    if (process.platform !== "win32") {
      const directory = await open(dir, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
    const readback = await this.load();
    if (!isDeepStrictEqual(readback, expected)) {
      throw new Error("client config cache readback mismatch");
    }
  }
}

function defaultStore(
  env: Record<string, string | undefined>,
): ClientConfigStore {
  const licensePath = resolveLicenseFilePath(env);
  if (!licensePath) {
    fail(
      "CLIENT_CONFIG_STORAGE_UNAVAILABLE",
      "本机配置存储尚未就绪",
      true,
    );
  }
  const { key: masterKey, degraded } = resolveMasterKey(env);
  if (degraded || masterKey.length !== 32) {
    fail(
      "CLIENT_CONFIG_STORAGE_UNAVAILABLE",
      "本机配置存储尚未就绪",
      true,
    );
  }
  const key = createHash("sha256")
    .update(masterKey)
    .update(CACHE_CONTEXT)
    .digest();
  return new EncryptedClientConfigStore(
    join(dirname(licensePath), ".channel-model-config"),
    key,
  );
}

async function requestTicketForVerdict(input: {
  readonly env:Record<string,string|undefined>;readonly now:Date;readonly nonce:string;
  readonly fetchImpl:typeof fetch;readonly verdict:ActiveVerdict;readonly amOrigin:URL;readonly growthOrigin:URL;
  readonly legacyDirectoryNonce?:()=>string;
}):Promise<FreshClientConfigAccess>{
  const amUrl=new URL(AM_PATH,input.amOrigin).toString();
  const request=async(version:TicketContract,nonce:string)=>{
    const http=await fetchNoRedirect(input.fetchImpl,amUrl,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({contractVersion:version,projectKey:input.verdict.projectKey,code:input.verdict.code,machineId:input.verdict.machineId,nonce})});
    if(http.status>=500)fail('CLIENT_CONFIG_AUTHORITY_UNAVAILABLE','授权服务暂时不可用，请稍后重试',true);
    return verifyAmResponse(http,amUrl,input.env.CREATOROS_LICENSE_PUBLIC_KEY_B64!,input.now);
  };
  let response=await request(TICKET_CONTRACT,input.nonce),version:TicketContract=TICKET_CONTRACT,nonce=input.nonce;
  const value=response.value;
  // SEMANTIC_BOUNDARY_ALLOW: 只核真实授权mode与已验签协议错误；不从码名/销售方式推断grant或普通授权。
  const ordinary=['TIME','COUNT','PERMANENT'].includes(input.verdict.licenseMode??'')&&['active','grace'].includes(input.verdict.status);
  if(input.legacyDirectoryNonce&&ordinary&&response.status===422&&exactObject(value,['success','error'])&&value.success===false&&exactObject(value.error,['code','message'])&&value.error.code==='CONFIG_TICKET_REQUEST_INVALID'&&typeof value.error.message==='string'){
    nonce=input.legacyDirectoryNonce();if(!nonce||nonce===input.nonce)fail('CLIENT_CONFIG_AUTHORITY_INVALID','兼容目录请求需要新的授权标识',false);
    version=LEGACY_DIRECTORY_TICKET_CONTRACT;response=await request(version,nonce);
  }
  const ticket=parseTicket(response,nonce,input.now,version);
  return {configAccessTicket:ticket.configAccessTicket,expiresAt:ticket.expiresAt,growthOrigin:input.growthOrigin.toString()};
}

/**
 * 为 Growth 的短时 server-only 操作申请一张新的 config access ticket。
 * 票据不缓存、不写日志，也不跨越本地可信 API 边界。
 */
export async function requestFreshClientConfigAccess(
  dependencies: Pick<
    Dependencies,
    "env" | "now" | "nonce" | "fetchImpl" | "readVerdict" | "expectedScopeId" | "signal"
  > & { readonly purpose?: "ai-credit-bootstrap" | "ai-credit-link" } = {},
): Promise<FreshClientConfigAccess> {
  assertConfigObserverLive(dependencies.signal);
  const env = dependencies.env ?? process.env;
  if (env.CREATOROS_CLIENT_CONFIG_PULL_ENABLED?.trim() !== "1") {
    fail("CLIENT_CONFIG_PENDING", "权益配置同步尚未启用", false);
  }
  const amOrigin = resolveHttpsOrigin(
    resolveActivationConfig(env).baseUrl,
    "授权服务",
  );
  const growthOrigin = resolveHttpsOrigin(
    env.CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN,
    "权益服务",
  );
  if (!env.CREATOROS_LICENSE_PUBLIC_KEY_B64?.trim()) {
    fail("CLIENT_CONFIG_PENDING", "授权校验材料尚未就绪", false);
  }
  const now = (dependencies.now ?? (() => new Date()))();
  const readVerdict =
    dependencies.readVerdict ?? (() => readLicenseVerdictDetailed());
  const verdict = activeVerdict(await readVerdict());
  if(dependencies.expectedScopeId!==undefined&&deriveChannelModelScopeId({projectKey:verdict.projectKey!,channelRef:verdict.channelRef!,clientId:CLIENT_ID})!==dependencies.expectedScopeId){
    fail('MODEL_ROUTE_IDENTITY_CHANGED','原模型授权范围已变化，不能申请另一范围的票据',false);
  }
  try {
    assertVerdictProductIdentity(verdict.projectKey!, env);
  } catch (error) {
    if (!(error instanceof ProductIdentitySecurityError)) throw error;
    fail(
      "CLIENT_CONFIG_PRODUCT_IDENTITY_INVALID",
      "当前安装包产品身份校验未通过",
      false,
    );
  }
  return requestTicketForVerdict({
    env,
    now,
    nonce: (
      dependencies.nonce ?? (() => randomBytes(16).toString("base64url"))
    )(),
    fetchImpl: observedConfigFetch(dependencies.fetchImpl ?? fetch, dependencies.signal),
    verdict,
    amOrigin,
    growthOrigin,
    ...(dependencies.purpose === "ai-credit-bootstrap" || dependencies.purpose === "ai-credit-link"
      ? { legacyDirectoryNonce: dependencies.nonce ?? (() => randomBytes(16).toString("base64url")) }
      : {}),
  });
}

export type ActivationIncludedCreditResult = {
  readonly status: "ready" | "not_eligible" | "pending" | "unavailable";
  readonly action: string;
  readonly retryable: boolean;
};

/** 独立履行原已含权益；目录同步不得调用本动作。完整凭据留在本server-only边界。 */
export async function fulfillActivationIncludedCredit(dependencies: Pick<Dependencies,
  "env" | "now" | "nonce" | "fetchImpl" | "readVerdict" | "expectedScopeId" | "signal"> = {}): Promise<ActivationIncludedCreditResult> {
  try {
    assertConfigObserverLive(dependencies.signal);
    const access = await requestFreshClientConfigAccess(dependencies);
    assertConfigObserverLive(dependencies.signal);
    const url = new URL(MANAGED_CREDENTIAL_PATH, access.growthOrigin);
    url.searchParams.set("serviceId", "omnihi-main"); url.searchParams.set("activationFulfillment", "1");
    const response = await fetchNoRedirect(observedConfigFetch(dependencies.fetchImpl ?? fetch, dependencies.signal), url.toString(),
      { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${access.configAccessTicket}` } });
    assertConfigObserverLive(dependencies.signal);
    if (response.headers.get("cache-control") !== "private, no-store" || response.headers.get("pragma") !== "no-cache")
      fail("CLIENT_CONFIG_INVALID", "官方额度启用结果无法验证，请稍后核对", false);
    let body: unknown;
    try { body = JSON.parse((await limitedBytes(response)).toString("utf8")); }
    catch { fail("CLIENT_CONFIG_INVALID", "官方额度启用结果无法验证，请稍后核对", false); }
    assertConfigObserverLive(dependencies.signal);
    const value = body as Record<string, unknown>;
    if (response.status === 200) {
      const credential = value?.credential as Record<string, unknown> | undefined;
      if (value?.contractVersion !== MANAGED_CREDENTIAL_CONTRACT || value.serviceId !== "omnihi-main" ||
          credential?.type !== "api_key" || typeof credential.token !== "string" || !credential.token.trim())
        fail("CLIENT_CONFIG_INVALID", "官方额度启用结果无法验证，请稍后核对", false);
      const wallet = value.wallet;
      if (!exactObject(wallet, ["linked", "availableUnits", "referenceId"]) || wallet.linked !== true ||
          typeof wallet.referenceId !== "string" || !/^AICA-[A-Za-z0-9_-]{6,96}$/.test(wallet.referenceId) ||
          typeof wallet.availableUnits !== "number" || !Number.isSafeInteger(wallet.availableUnits) || wallet.availableUnits < 0)
        return { status: "unavailable", action: "已找到原模型凭据，但额度账户尚未就绪；不会重复开户或赠额，请联系官方核对，也可先用自配模型", retryable: true };
      return { status: "ready", action: "产品已含额度已启用，已有余额保持不变", retryable: false };
    }
    if (!exactObject(body, ["error"]) || !exactObject(body.error, ["code", "message"]) || typeof body.error.code !== "string")
      fail("CLIENT_CONFIG_INVALID", "官方额度启用结果无法验证，请稍后核对", false);
    const code = body.error.code;
    if (response.status === 422 && code === "ACTIVATION_UNIT_UNSUPPORTED")
      return { status: "not_eligible", action: "当前授权未包含可直接启用的官方额度，可使用自配模型、本地Codex或自己的充值码", retryable: false };
    if (response.status === 422 && code === "CLIENT_EXTENSION_INVALID")
      return { status: "unavailable", action: "官方额度启用服务暂未接通，可稍后重试或先使用自配模型", retryable: true };
    if (response.status === 409 && ["ACTIVATION_ACCOUNT_PROVISIONING", "MODEL_PROVIDER_CREATION_UNKNOWN", "AI_CREDIT_BOOTSTRAP_PENDING"].includes(code))
      return { status: "pending", action: "原权益仍在确认中，请稍后重新核对；不会重复发放，也可先使用自配模型", retryable: true };
    if (response.status === 503)
      return { status: "pending", action: "本次启用结果尚未确认，请稍后重新核对原权益，也可先使用自配模型", retryable: true };
    return parseGrowthError(response, body);
  } catch (error) {
    assertConfigObserverLive(dependencies.signal);
    if (error instanceof ClientConfigPullError && error.code === "CLIENT_CONFIG_NOT_APPLICABLE")
      return { status: "not_eligible", action: "当前授权未包含可直接启用的官方额度，可使用自配模型、本地Codex或自己的充值码", retryable: false };
    if (error instanceof ClientConfigPullError && error.code === "CLIENT_CONFIG_NETWORK_UNAVAILABLE")
      return { status: "pending", action: "启用结果尚未确认，请稍后重新核对原权益，也可先使用自配模型", retryable: true };
    throw error;
  }
}

/**
 * API-575-002（Growth 跨仓编号 API-CREATOR-002）server-only refresh。所有 identity 来自当前加密授权；请求不接受
 * channelRef/projectKey override，Web 永远拿不到 code/machineId/ticket。Creator 不向 Activity
 * 自报 clientId 作为授权依据；它只向 Growth 声明接受的 extension/protocol，最终 clientId
 * 由 Growth registry 决定并签入 bundle。
 */
export async function refreshClientConfig(
  dependencies: Dependencies = {},
): Promise<ClientConfigProjection> {
  assertConfigObserverLive(dependencies.signal);
  const env = dependencies.env ?? process.env;
  if (env.CREATOROS_CLIENT_CONFIG_PULL_ENABLED?.trim() !== "1") {
    fail("CLIENT_CONFIG_PENDING", "渠道配置同步尚未启用", false);
  }
  const amOrigin = resolveHttpsOrigin(
    resolveActivationConfig(env).baseUrl,
    "授权服务",
  );
  const growthOrigin = resolveHttpsOrigin(
    env.CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN,
    "渠道配置服务",
  );
  if (
    !env.CREATOROS_LICENSE_PUBLIC_KEY_B64?.trim() ||
    !env.CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64?.trim() ||
    !env.CREATOROS_GROWTH_CONFIG_KEY_ID?.trim()
  ) {
    fail("CLIENT_CONFIG_PENDING", "渠道配置验签材料尚未就绪", false);
  }
  const now = (dependencies.now ?? (() => new Date()))();
  const readVerdict =
    dependencies.readVerdict ?? (() => readLicenseVerdictDetailed());
  const verdict = activeVerdict(await readVerdict());
  try {
    assertVerdictProductIdentity(verdict.projectKey!, env);
  } catch (error) {
    if (!(error instanceof ProductIdentitySecurityError)) throw error;
    fail(
      "CLIENT_CONFIG_PRODUCT_IDENTITY_INVALID",
      "当前安装包产品身份校验未通过",
      false,
    );
  }
  const backingStore = dependencies.store ?? defaultStore(env);
  const store: ClientConfigStore = { load: () => backingStore.load(), save: record => {
    assertConfigObserverLive(dependencies.signal); return backingStore.save(record);
  }};
  const putManagedCredential: Dependencies["putManagedCredential"] = dependencies.putManagedCredential ? async (...args) => {
    assertConfigObserverLive(dependencies.signal); await dependencies.putManagedCredential!(...args);
  } : undefined;
  const activeLocator = locatorFromVerdict(verdict);
  let previous: ClientConfigCacheRecord | null;
  try {
    previous = scopeRecordToLocator(await store.load(), verdict);
  } catch (error) {
    if (!(error instanceof ClientConfigCacheSecurityError)) throw error;
    await store.save({
      state: "quarantined",
      outcome: "security_error",
      checkedAt: now.toISOString(),
      activeLocator,
      bundle: null,
      channel: null,
      inactiveLocators: [],
    });
    return project("local", "security_error");
  }
  const fetchImpl = observedConfigFetch(dependencies.fetchImpl ?? fetch, dependencies.signal);
  const nonce = (
    dependencies.nonce ?? (() => randomBytes(16).toString("base64url"))
  )();

  try {
    const ticket = await requestTicketForVerdict({
      env,
      now,
      nonce,
      fetchImpl,
      verdict,
      amOrigin,
      growthOrigin,
      legacyDirectoryNonce:dependencies.nonce??(()=>randomBytes(16).toString("base64url")),
    });

    const growthUrl = new URL(GROWTH_PATH, growthOrigin);
    growthUrl.searchParams.set("clientVersion", packageJson.version);
    growthUrl.searchParams.append(
      "accept",
      `${EXTENSION_KEY}@${PROTOCOL_VERSION}`,
    );
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${ticket.configAccessTicket}`,
    };
    if (
      previous?.bundle &&
      sameLocator(previous.activeLocator, activeLocator)
    ) {
      headers["If-None-Match"] = `"${previous.bundle.bundleDigest}"`;
    }
    const response = await fetchNoRedirect(
      fetchImpl,
      growthUrl.toString(),
      { method: "GET", headers },
    );
    if (response.status >= 500) {
      fail(
        "CLIENT_CONFIG_AUTHORITY_UNAVAILABLE",
        "配置服务暂时不可用，请稍后重试",
        true,
      );
    }
    const correlationId =
      response.status === 200 || response.status === 304
        ? validateGrowthSuccessHeaders(response)
        : null;
    if (response.status === 304) {
      if (
        !previous?.bundle ||
        !sameLocator(previous.activeLocator, activeLocator) ||
        response.headers.get("etag") !==
          `"${previous.bundle.bundleDigest}"` ||
        response.headers.get("x-config-bundle-version") !==
          String(previous.bundle.bundleVersion) ||
        response.headers.get("x-config-key-id") !==
          previous.bundle.keyId
      ) {
        fail(
          "CLIENT_CONFIG_INVALID",
          "配置版本确认无法验证，请重新同步",
          true,
        );
      }
      const extension = previous.bundle.extensions[0];
      if (
        extension &&
        (!previous.channel ||
          previous.channel.projectKey !== verdict.projectKey ||
          previous.channel.channelRef !== verdict.channelRef ||
          previous.channel.bundleVersion !== previous.bundle.bundleVersion ||
          previous.channel.bundleDigest !== previous.bundle.bundleDigest ||
          previous.channel.extensionRevision !== extension.revision ||
          canonicalJson(previous.channel.payload) !==
            canonicalJson(extension.payload))
      ) {
        fail(
          "CLIENT_CONFIG_INVALID",
          "配置版本确认无法验证，请重新同步",
          false,
        );
      }
      const refreshed = {
        ...previous,
        state: extension ? "channel" : "local",
        outcome: extension ? "configured" : "not_configured",
        checkedAt: now.toISOString(),
        activeLocator,
      } as const;
      await store.save(refreshed);
    previous=refreshed;
    if(extension&&refreshed.channel){
      const states=await pullManagedCredentials({growthOrigin,ticket:ticket.configAccessTicket,payload:extension.payload,scopeId:deriveChannelModelScopeId(activeLocator),fetchImpl,putManagedCredential});
      if(Object.keys(states).length){const withStatus={...refreshed,channel:{...refreshed.channel,managedCredentials:states}};await store.save(withStatus);previous=withStatus;}
    }
      console.info(
        `[client-config] refresh=not-modified correlation=${correlationId}`,
      );
      return extension
        ? project("channel", "configured")
        : project("local", "not_configured");
    }
    const raw = await limitedBytes(response);
    let value: unknown;
    try {
      value = JSON.parse(raw.toString("utf8"));
    } catch {
      return fail(
        "CLIENT_CONFIG_INVALID",
        "配置服务响应无法验证，请稍后重试",
        true,
      );
    }
    if (response.status !== 200) parseGrowthError(response, value);
    const bundle = verifyBundle(value, verdict, env, now);
    if (
      response.headers.get("etag") !== `"${bundle.bundleDigest}"` ||
      response.headers.get("x-config-bundle-version") !==
        String(bundle.bundleVersion) ||
      response.headers.get("x-config-key-id") !== bundle.keyId
    ) {
      fail(
        "CLIENT_CONFIG_INVALID",
        "配置服务响应头无法验证，请稍后重试",
        true,
      );
    }
    if (
      previous?.bundle &&
      sameLocator(previous.activeLocator, activeLocator)
    ) {
      if (bundle.bundleVersion < previous.bundle.bundleVersion) {
        fail(
          "CLIENT_CONFIG_VERSION_DOWNGRADE",
          "检测到旧版本配置，已保留当前配置",
          false,
        );
      }
      if (
        bundle.bundleVersion === previous.bundle.bundleVersion &&
        bundle.bundleDigest !== previous.bundle.bundleDigest
      ) {
        fail(
          "CLIENT_CONFIG_VERSION_COLLISION",
          "配置版本校验不一致，已保留当前配置",
          false,
        );
      }
    }
    const extension = bundle.extensions[0];
    const next: ClientConfigCacheRecord = extension
      ? {
          state: "channel",
          outcome: "configured",
          checkedAt: now.toISOString(),
          activeLocator,
          bundle,
          channel: {
            projectKey: bundle.projectKey,
            channelRef: bundle.channelRef,
            bundleVersion: bundle.bundleVersion,
            bundleDigest: bundle.bundleDigest,
            extensionRevision: extension.revision,
            payload: extension.payload as ChannelModelJson,
          },
          inactiveLocators: previous?.inactiveLocators ?? [],
        }
      : {
          state: "local",
          outcome: "not_configured",
          checkedAt: now.toISOString(),
          activeLocator,
          bundle,
          // 明确未配置后不激活旧 payload，但仍保留同 locator 的历史密文以便审计/恢复。
          channel: previous?.channel ?? null,
          inactiveLocators: previous?.inactiveLocators ?? [],
        };
    await store.save(next);
    previous=next;
    if(extension&&next.channel){
      const states=await pullManagedCredentials({growthOrigin,ticket:ticket.configAccessTicket,payload:extension.payload,scopeId:deriveChannelModelScopeId(activeLocator),fetchImpl,putManagedCredential});
      if(Object.keys(states).length){const withStatus={...next,channel:{...next.channel,managedCredentials:states}};await store.save(withStatus);previous=withStatus;}
    }
    console.info(
      `[client-config] refresh=${extension ? "configured" : "not-configured"} correlation=${correlationId}`,
    );
    return extension
      ? project("channel", "configured")
      : project("local", "not_configured");
  } catch (error) {
    assertConfigObserverLive(dependencies.signal);
    if (error instanceof ClientConfigPullError) {
      console.info(
        `[client-config] ${JSON.stringify({
          phase: "refresh",
          status: "failed",
          errorCode: error.code,
          retryable: error.retryable,
        })}`,
      );
      if (error.code === "CLIENT_CONFIG_NOT_APPLICABLE") {
        await store.save({
          state: "local",
          outcome: "not_configured",
          checkedAt: now.toISOString(),
          activeLocator,
          bundle: previous?.bundle ?? null,
          channel: previous?.channel ?? null,
          inactiveLocators: previous?.inactiveLocators ?? [],
        });
        return project("local", "not_configured");
      }
      const reason = blockReason(error);
      if (reason) {
        await store.save({
          state: "blocked",
          outcome: "security_error",
          reason,
          checkedAt: now.toISOString(),
          activeLocator,
          bundle: previous?.bundle ?? null,
          channel: previous?.channel ?? null,
          inactiveLocators: previous?.inactiveLocators ?? [],
        });
        throw error;
      }
      if (isOfflineEligible(error)) {
        await store.save({
          state: "local",
          outcome: "unreachable",
          checkedAt: now.toISOString(),
          activeLocator,
          bundle: previous?.bundle ?? null,
          channel: previous?.channel ?? null,
          inactiveLocators: previous?.inactiveLocators ?? [],
        });
        return project("local", "unreachable");
      }
      await store.save({
        state: "quarantined",
        outcome: "security_error",
        checkedAt: now.toISOString(),
        activeLocator,
        bundle: previous?.bundle ?? null,
        channel: previous?.channel ?? null,
        inactiveLocators: previous?.inactiveLocators ?? [],
      });
      return project("local", "security_error");
    }
    throw error;
  }
}

/**
 * 模型运行时的唯一 authority 读面。只在当前激活 identity 与加密记录完全一致时返回 payload；
 * 其他任何状态都返回 local，且从不把 opaque JSON 投影到 Web。
 */
export async function readChannelModelAuthority(
  dependencies: Pick<Dependencies, "env" | "readVerdict" | "store"> = {},
): Promise<ChannelModelAuthority> {
  const env = dependencies.env ?? process.env;
  if (env.CREATOROS_CLIENT_CONFIG_PULL_ENABLED?.trim() !== "1") {
    return { authority: "local", outcome: "unreachable", payload: null };
  }
  try {
    const readVerdict =
      dependencies.readVerdict ?? (() => readLicenseVerdictDetailed());
    const verdict = activeVerdict(await readVerdict());
    const store = dependencies.store ?? defaultStore(env);
    const record = await store.load();
    const channel = record?.channel;
    const extension = record?.bundle?.extensions[0];
    if (
      record?.state === "channel" &&
      record.outcome === "configured" &&
      sameLocator(record.activeLocator, locatorFromVerdict(verdict)) &&
      channel !== null &&
      channel !== undefined &&
      channel.projectKey === verdict.projectKey &&
      channel.channelRef === verdict.channelRef &&
      record.bundle?.projectKey === verdict.projectKey &&
      record.bundle.channelRef === verdict.channelRef &&
      record.bundle.bundleVersion === channel.bundleVersion &&
      record.bundle.bundleDigest === channel.bundleDigest &&
      extension?.revision === channel.extensionRevision &&
      canonicalJson(extension.payload) === canonicalJson(channel.payload)
    ) {
      return {
        authority: "channel",
        outcome: "configured",
        payload: channel.payload,
        ...(channel.managedCredentials?{managedCredentials:channel.managedCredentials}:{}),
        bundleDigest: record.bundle.bundleDigest,
        scopeId: deriveChannelModelScopeId({
          projectKey: verdict.projectKey,
          channelRef: verdict.channelRef,
          clientId: CLIENT_ID,
        }),
      };
    }
    return {
      authority: "local",
      outcome:
        record?.outcome === "not_configured" ||
        record?.outcome === "security_error"
          ? record.outcome
          : "unreachable",
      payload: null,
    };
  } catch (error) {
    if (error instanceof ClientConfigCacheSecurityError) {
      return { authority: "local", outcome: "security_error", payload: null };
    }
    if (
      error instanceof ClientConfigPullError &&
      error.code === "CLIENT_CONFIG_ACTIVATION_SCOPE_MISSING"
    ) {
      return {
        authority: "local",
        outcome: "activation_scope_missing",
        payload: null,
      };
    }
    return { authority: "local", outcome: "unreachable", payload: null };
  }
}
