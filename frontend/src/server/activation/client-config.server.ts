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

import { resolveMasterKey } from "@creatoros/backend";

import packageJson from "../../../package.json";
import {
  readLicenseVerdictDetailed,
  resolveLicenseFilePath,
  type LicenseVerdict,
} from "./license-file.server";

const TICKET_CONTRACT = "config-access-ticket-v1";
const BUNDLE_CONTRACT = "growth-client-config-bundle-v1";
const CLIENT_ID = "creatoros.desktop";
const EXTENSION_KEY = "creatoros.model-config";
const PROTOCOL_VERSION = "creatoros-model-config-v1";
const AM_PATH = "/api/license/client-config-tickets";
const GROWTH_PATH = "/api/v2/client-config/bundles/current";
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
  readonly bundle: SignedClientConfigBundle | null;
  readonly channel: {
    readonly projectKey: string;
    readonly channelRef: string;
    readonly bundleVersion: number;
    readonly bundleDigest: string;
    readonly extensionRevision: number;
    readonly payload: ChannelModelJson;
  } | null;
  readonly reason?:
    | "authorization_changed"
    | "authorization_expired"
    | "channel_terminated";
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
    }
  | {
      readonly authority: "local";
      readonly outcome: "not_configured" | "unreachable" | "security_error";
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
>;

type Dependencies = {
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => Date;
  readonly nonce?: () => string;
  readonly fetchImpl?: typeof fetch;
  readonly readVerdict?: () => ReturnType<typeof readLicenseVerdictDetailed>;
  readonly store?: ClientConfigStore;
};

type VerifiedAmResponse = {
  readonly status: number;
  readonly value: unknown;
};

type TicketResponse = {
  readonly contractVersion: typeof TICKET_CONTRACT;
  readonly configAccessTicket: string;
  readonly expiresAt: string;
  readonly nonce: string;
};

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
    !verdict.projectKey ||
    !verdict.channelRef
  ) {
    fail(
      "CLIENT_CONFIG_LICENSE_UNAVAILABLE",
      "当前没有可用于同步渠道配置的有效授权",
      false,
    );
  }
  return verdict;
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
      signal: AbortSignal.timeout(10_000),
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
    value.contractVersion !== TICKET_CONTRACT ||
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
      "当前渠道配置需要更新 CreatorOS 后才能使用",
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
  if (
    response.status === 503 &&
    (code === "CONFIG_AUTHORITY_UNAVAILABLE" ||
      code === "CLIENT_CONFIG_UNAVAILABLE" ||
      code === "CLIENT_CONFIG_SIGNER_UNAVAILABLE")
  ) {
    fail(
      "CLIENT_CONFIG_AUTHORITY_UNAVAILABLE",
      "配置服务暂时不可用，请稍后重试",
      true,
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

class EncryptedClientConfigStore implements ClientConfigStore {
  constructor(
    private readonly path: string,
    private readonly key: Buffer,
  ) {}

  async load(): Promise<ClientConfigCacheRecord | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return null;
    }
    try {
      const packed = Buffer.from(raw.trim().slice(CACHE_PREFIX.length), "base64");
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
        envelope.schemaVersion !== CACHE_SCHEMA ||
        !envelope.record ||
        typeof envelope.record !== "object"
      ) {
        return null;
      }
      return envelope.record as ClientConfigCacheRecord;
    } catch {
      return null;
    }
  }

  async save(record: ClientConfigCacheRecord): Promise<void> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plain = Buffer.from(
      JSON.stringify({ schemaVersion: CACHE_SCHEMA, record }),
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
    const directory = await open(dir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    const readback = await this.load();
    if (JSON.stringify(readback) !== JSON.stringify(record)) {
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

/**
 * API-575-002（Growth 跨仓编号 API-CREATOR-002）server-only refresh。所有 identity 来自当前加密授权；请求不接受
 * channelRef/projectKey/clientId override，Web 永远拿不到 code/machineId/ticket。
 */
export async function refreshClientConfig(
  dependencies: Dependencies = {},
): Promise<ClientConfigProjection> {
  const env = dependencies.env ?? process.env;
  if (env.CREATOROS_CLIENT_CONFIG_PULL_ENABLED?.trim() !== "1") {
    fail("CLIENT_CONFIG_PENDING", "渠道配置同步尚未启用", false);
  }
  const amOrigin = resolveHttpsOrigin(
    env.CREATOROS_LICENSE_BASE_URL,
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
  const store = dependencies.store ?? defaultStore(env);
  const previous = await store.load();
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const nonce = (
    dependencies.nonce ?? (() => randomBytes(16).toString("base64url"))
  )();

  try {
    const amUrl = new URL(AM_PATH, amOrigin).toString();
    const amHttp = await fetchNoRedirect(fetchImpl, amUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contractVersion: TICKET_CONTRACT,
        projectKey: verdict.projectKey,
        clientId: CLIENT_ID,
        code: verdict.code,
        machineId: verdict.machineId,
        nonce,
      }),
    });
    const ticket = parseTicket(
      await verifyAmResponse(
        amHttp,
        amUrl,
        env.CREATOROS_LICENSE_PUBLIC_KEY_B64,
        now,
      ),
      nonce,
      now,
    );

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
    if (previous?.bundle) {
      headers["If-None-Match"] = `"${previous.bundle.bundleDigest}"`;
    }
    const response = await fetchNoRedirect(
      fetchImpl,
      growthUrl.toString(),
      { method: "GET", headers },
    );
    const correlationId =
      response.status === 200 || response.status === 304
        ? validateGrowthSuccessHeaders(response)
        : null;
    if (response.status === 304) {
      if (
        !previous?.bundle ||
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
      } as const;
      await store.save(refreshed);
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
    if (previous?.bundle) {
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
          bundle,
          channel: {
            projectKey: bundle.projectKey,
            channelRef: bundle.channelRef,
            bundleVersion: bundle.bundleVersion,
            bundleDigest: bundle.bundleDigest,
            extensionRevision: extension.revision,
            payload: extension.payload as ChannelModelJson,
          },
        }
      : {
          state: "local",
          outcome: "not_configured",
          checkedAt: now.toISOString(),
          bundle,
          channel: previous?.channel ?? null,
        };
    await store.save(next);
    console.info(
      `[client-config] refresh=${extension ? "configured" : "not-configured"} correlation=${correlationId}`,
    );
    return extension
      ? project("channel", "configured")
      : project("local", "not_configured");
  } catch (error) {
    if (error instanceof ClientConfigPullError) {
      const reason = blockReason(error);
      if (reason) {
        await store.save({
          state: "blocked",
          outcome: "security_error",
          reason,
          checkedAt: now.toISOString(),
          bundle: previous?.bundle ?? null,
          channel: previous?.channel ?? null,
        });
        throw error;
      }
      if (isOfflineEligible(error)) {
        await store.save({
          state: "local",
          outcome: "unreachable",
          checkedAt: now.toISOString(),
          bundle: previous?.bundle ?? null,
          channel: previous?.channel ?? null,
        });
        return project("local", "unreachable");
      }
      await store.save({
        state: "quarantined",
        outcome: "security_error",
        checkedAt: now.toISOString(),
        bundle: previous?.bundle ?? null,
        channel: previous?.channel ?? null,
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
  } catch {
    return { authority: "local", outcome: "unreachable", payload: null };
  }
}
