import "server-only";

import {
  createHash,
  createPublicKey,
  randomBytes,
  verify,
} from "node:crypto";

import {
  localProductFeedbackRequest,
  localProductFeedbackSuccess,
  type LocalProductFeedbackRequest,
  type LocalProductFeedbackResponse,
} from "@creatoros/contract";

import {
  readLicenseVerdictDetailed,
  type LicenseVerdict,
} from "@/server/activation/license-file.server";

const DEFAULT_LICENSE_BASE_URL = "https://license.aitongban.cloud";
const AM_PATH = "/api/license/feedback-context";
const GROWTH_PATH = "/api/v2/product-feedback";
const MAX_RESPONSE_BYTES = 65_536;
const MAX_DATE_SKEW_MS = 300_000;
const RAW_ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

type FeedbackContextResponse = {
  readonly schemaVersion: "feedback-context-v1";
  readonly feedbackContextToken: string;
  readonly expiresAt: string;
  readonly nonce: string;
};

type GrowthErrorDisposition = {
  readonly status: number;
  readonly retryable: boolean;
  readonly message: string;
};

const GROWTH_ERROR_DISPOSITIONS: Readonly<
  Record<string, GrowthErrorDisposition>
> = {
  FEEDBACK_CONTEXT_INVALID: {
    status: 401,
    retryable: false,
    message: "反馈授权无效，请重新激活后再试",
  },
  FEEDBACK_CHANNEL_NOT_FOUND: {
    status: 404,
    retryable: false,
    message: "当前授权绑定的反馈渠道不存在，请联系官方处理",
  },
  IDEMPOTENCY_MISMATCH: {
    status: 409,
    retryable: false,
    message: "反馈内容与本次重试记录不一致，请重新打开反馈窗口后提交",
  },
  FEEDBACK_CONTEXT_STALE: {
    status: 409,
    retryable: true,
    message: "授权状态刚刚发生变化，请重试",
  },
  FEEDBACK_CONTEXT_EXPIRED: {
    status: 410,
    retryable: true,
    message: "本次反馈授权已过期，请重试",
  },
  CHANNEL_TERMINATED: {
    status: 410,
    retryable: false,
    message: "当前渠道已终止，请联系官方完成渠道改绑",
  },
  FEEDBACK_TOO_LARGE: {
    status: 413,
    retryable: false,
    message: "反馈内容过长，请精简后重试",
  },
  FEEDBACK_INVALID: {
    status: 422,
    retryable: false,
    message: "反馈内容格式不符合要求，请检查后重试",
  },
  FEEDBACK_PRODUCT_PROJECT_MISMATCH: {
    status: 422,
    retryable: false,
    message: "产品与授权渠道不匹配，请联系官方处理",
  },
  FEEDBACK_RATE_LIMITED: {
    status: 429,
    retryable: true,
    message: "提交过于频繁，请稍后重试",
  },
  FEEDBACK_AUTHORITY_UNAVAILABLE: {
    status: 503,
    retryable: true,
    message: "反馈服务暂时不可用，请稍后重试",
  },
};

type SubmitDependencies = {
  readonly fetchImpl?: typeof fetch;
  readonly readVerdict?: () => Promise<FeedbackLicenseReadResult>;
  readonly env?: Record<string, string | undefined>;
  readonly nonce?: () => string;
  readonly now?: () => Date;
  readonly verifyAmResponse?: (
    response: Response,
    requestUrl: string,
    nonce: string,
    publicKeyB64: string,
    now: Date,
  ) => Promise<FeedbackContextResponse>;
};

type FeedbackLicenseVerdict = Pick<
  LicenseVerdict,
  "v" | "allowed" | "status" | "code" | "machineId" | "projectKey"
> & {
  readonly channelRuntime?: {
    readonly bugFeedbackUrl?: string | null;
  } | null;
};

type FeedbackLicenseReadResult =
  | { readonly state: "ready"; readonly verdict: FeedbackLicenseVerdict }
  | { readonly state: "unavailable" | "read_error"; readonly verdict: null };

export class ProductFeedbackSubmissionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "ProductFeedbackSubmissionError";
  }
}

function fail(
  code: string,
  status: number,
  retryable: boolean,
  message: string,
): never {
  throw new ProductFeedbackSubmissionError(code, status, retryable, message);
}

function closedObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index]);
}

function parseFeedbackContext(value: unknown): FeedbackContextResponse {
  const keys = [
    "expiresAt",
    "feedbackContextToken",
    "nonce",
    "schemaVersion",
  ] as const;
  if (!closedObject(value, keys)) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  if (
    value.schemaVersion !== "feedback-context-v1" ||
    typeof value.feedbackContextToken !== "string" ||
    value.feedbackContextToken.length < 5 ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    typeof value.nonce !== "string"
  ) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  return value as FeedbackContextResponse;
}

function publicKeyFromRawBase64(value: string) {
  const raw = Buffer.from(value.trim(), "base64");
  if (raw.length !== 32) {
    fail(
      "FEEDBACK_SIGNING_KEY_UNAVAILABLE",
      503,
      true,
      "反馈授权验签配置不可用，请稍后重试",
    );
  }
  return createPublicKey({
    key: Buffer.concat([RAW_ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/**
 * 验证 API-AM-013 的确切 body bytes、Ed25519、RFC1123 date 与 nonce。
 * 任何失败都只抛稳定错误，不把响应正文、token 或 URL 写入日志。
 */
export async function verifyAmLicenseResponse(
  response: Response,
  requestUrl: string,
  expectedNonce: string,
  publicKeyB64: string,
  now = new Date(),
): Promise<FeedbackContextResponse> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_RESPONSE_BYTES) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  const signature = response.headers.get("x-license-signature");
  const date = response.headers.get("x-license-date");
  const digest = response.headers.get("x-license-digest");
  if (!signature || !date || !digest) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  const computed = `SHA-256=${createHash("sha256").update(bytes).digest("base64")}`;
  const parsedDate = Date.parse(date);
  if (
    digest !== computed ||
    !Number.isFinite(parsedDate) ||
    Math.abs(now.getTime() - parsedDate) > MAX_DATE_SKEW_MS
  ) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  const url = new URL(requestUrl);
  const signingInput = `post ${url.pathname}\n${url.host}\n${date}\n${computed}`;
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    return fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  if (
    signatureBytes.length !== 64 ||
    !verify(
      null,
      Buffer.from(signingInput, "utf8"),
      publicKeyFromRawBase64(publicKeyB64),
      signatureBytes,
    )
  ) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  if (!response.ok) {
    fail(
      "FEEDBACK_CONTEXT_UNAVAILABLE",
      response.status >= 500 ? 503 : response.status,
      response.status >= 500 || response.status === 409,
      response.status === 410
        ? "当前授权已到期，续费后可重新发送"
        : "当前授权暂时无法提交反馈",
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    return fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  const parsed = parseFeedbackContext(raw);
  if (parsed.nonce !== expectedNonce) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  const expiresAt = Date.parse(parsed.expiresAt);
  if (
    expiresAt <= now.getTime() - 30_000 ||
    expiresAt <= parsedDate ||
    expiresAt - parsedDate > MAX_DATE_SKEW_MS
  ) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "授权服务响应无法验证，请稍后重试",
    );
  }
  return parsed;
}

function resolveHttpsBaseUrl(raw: string, code: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail(code, 503, false, "反馈服务部署配置不可用");
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
    fail(code, 503, false, "反馈服务部署配置不可用");
  }
  return parsed;
}

function resolveGrowthOrigin(
  verdict: FeedbackLicenseVerdict,
  env: Record<string, string | undefined>,
): URL {
  const bugFeedbackUrl = verdict.channelRuntime?.bugFeedbackUrl;
  if (!bugFeedbackUrl) {
    fail(
      "FEEDBACK_CHANNEL_UNAVAILABLE",
      409,
      false,
      "当前授权还没有可用的问题反馈渠道",
    );
  }
  let signedUrl: URL;
  try {
    signedUrl = new URL(bugFeedbackUrl);
  } catch {
    return fail(
      "FEEDBACK_ORIGIN_NOT_ALLOWED",
      503,
      false,
      "问题反馈地址未通过安全校验",
    );
  }
  if (
    signedUrl.protocol !== "https:" ||
    signedUrl.username ||
    signedUrl.password ||
    signedUrl.port
  ) {
    fail(
      "FEEDBACK_ORIGIN_NOT_ALLOWED",
      503,
      false,
      "问题反馈地址未通过安全校验",
    );
  }
  const allowed = (env.CREATOROS_FEEDBACK_OFFICIAL_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) =>
      resolveHttpsBaseUrl(entry.endsWith("/") ? entry : `${entry}/`, "FEEDBACK_ORIGIN_NOT_ALLOWED"),
    )
    .map((entry) => entry.origin);
  if (allowed.length === 0 || !allowed.includes(signedUrl.origin)) {
    fail(
      "FEEDBACK_ORIGIN_NOT_ALLOWED",
      503,
      false,
      "问题反馈地址未通过官方服务校验",
    );
  }
  return new URL(`${signedUrl.origin}${GROWTH_PATH}`);
}

function activeLicense(result: FeedbackLicenseReadResult): FeedbackLicenseVerdict {
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
      "LICENSE_NOT_ACTIVE",
      409,
      false,
      "当前没有可用于提交反馈的有效激活授权",
    );
  }
  return verdict;
}

async function fetchNoRedirect(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务暂时不可用，请稍后重试",
    );
  }
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    return fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务响应无法解析，请稍后重试",
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_RESPONSE_BYTES) {
    return fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务响应无法解析，请稍后重试",
    );
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务响应无法解析，请稍后重试",
    );
  }
}

function parseGrowthError(
  value: unknown,
  responseStatus: number,
): {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly message: string;
} {
  if (!closedObject(value, ["error"])) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务响应无法验证，请稍后重试",
    );
  }
  const error = value.error;
  if (
    !closedObject(error, ["code", "message"]) ||
    typeof error.code !== "string" ||
    typeof error.message !== "string"
  ) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务响应无法验证，请稍后重试",
    );
  }
  const disposition = GROWTH_ERROR_DISPOSITIONS[error.code];
  if (!disposition || disposition.status !== responseStatus) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务响应无法验证，请稍后重试",
    );
  }
  return {
    code: error.code,
    ...disposition,
  };
}

export async function submitProductFeedback(
  rawInput: LocalProductFeedbackRequest,
  idempotencyKey: string,
  dependencies: SubmitDependencies = {},
): Promise<LocalProductFeedbackResponse> {
  const input = localProductFeedbackRequest.parse(rawInput);
  const env = dependencies.env ?? process.env;
  if (env.CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED !== "1") {
    fail(
      "FEEDBACK_SUBMISSION_DISABLED",
      503,
      true,
      "当前版本尚未开放应用内发送，请复制文字并使用官方反馈页",
    );
  }
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const readVerdict =
    dependencies.readVerdict ?? (() => readLicenseVerdictDetailed());
  const verdict = activeLicense(await readVerdict());
  const growthUrl = resolveGrowthOrigin(verdict, env);
  const amOrigin = resolveHttpsBaseUrl(
    env.CREATOROS_LICENSE_BASE_URL?.trim() || DEFAULT_LICENSE_BASE_URL,
    "FEEDBACK_AUTHORITY_UNAVAILABLE",
  );
  const amUrl = new URL(AM_PATH, amOrigin).toString();
  const nonce = (dependencies.nonce ?? (() => randomBytes(16).toString("base64url")))();

  const amResponse = await fetchNoRedirect(fetchImpl, amUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      projectKey: verdict.projectKey,
      code: verdict.code,
      machineId: verdict.machineId,
      nonce,
    }),
  });
  const verifyResponse =
    dependencies.verifyAmResponse ?? verifyAmLicenseResponse;
  const context = await verifyResponse(
    amResponse,
    amUrl,
    nonce,
    env.CREATOROS_LICENSE_PUBLIC_KEY_B64 ?? "",
    (dependencies.now ?? (() => new Date()))(),
  );

  const growthResponse = await fetchNoRedirect(
    fetchImpl,
    growthUrl.toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        contractVersion: "channel-bound-feedback-v1",
        feedbackContextToken: context.feedbackContextToken,
        productRef: "creatoros",
        summary: input.summary,
        description: input.description,
        reproductionSteps: input.reproductionSteps,
        appVersion: input.appVersion,
        osName: input.osName,
        locale: input.locale,
      }),
    },
  );
  const responseBody = await readLimitedJson(growthResponse);
  if (growthResponse.status !== 202) {
    const upstreamError = parseGrowthError(
      responseBody,
      growthResponse.status,
    );
    return fail(
      upstreamError.code,
      upstreamError.status,
      upstreamError.retryable,
      upstreamError.message,
    );
  }
  const success = localProductFeedbackSuccess.safeParse({
    ok: true,
    ...(responseBody as object),
  });
  if (!success.success) {
    fail(
      "FEEDBACK_AUTHORITY_UNAVAILABLE",
      503,
      true,
      "反馈服务响应无法验证，请稍后重试",
    );
  }
  return success.data;
}
