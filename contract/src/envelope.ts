import { z } from "zod";

export const requestId = z.string();

export const successMeta = z.object({ requestId });
export const listMeta = z.object({
  requestId,
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export function successEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: successMeta });
}

export function listEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), meta: listMeta });
}

export enum ErrorCode {
  ValidationError = "ValidationError",
  AuthenticationError = "AuthenticationError",
  OwnershipError = "OwnershipError",
  ConflictError = "ConflictError",
  RateLimitError = "RateLimitError",
  ExternalDependencyError = "ExternalDependencyError",
  UnexpectedError = "UnexpectedError",
  // [T-332 S3] 账号全域隔离(SPEC §4.2):per-account op 在「未选号」ctx 下被拒。
  // 语义是引导态(前端翻译成「请先绑定/选择抖音号」),不是校验失败也不是越权,
  // 故独立成码;HTTP 用 428 Precondition Required(前置条件 = 已选中一个账号)。
  AccountRequiredError = "AccountRequiredError",
  // [T-520] 收藏读取从 CDP → dispatch → HttpTransport 保留可操作错因。
  // 不能回退成裸字符串，否则 UI 只能猜类名/文案并把失败误报成“请登录”或真 0。
  DouyinFavoritesSessionExpired = "DOUYIN_FAVORITES_SESSION_EXPIRED",
  DouyinFavoritesBrowserLocked = "DOUYIN_FAVORITES_BROWSER_LOCKED",
  DouyinFavoritesCaptcha = "DOUYIN_FAVORITES_CAPTCHA",
  DouyinFavoritesNetwork = "DOUYIN_FAVORITES_NETWORK",
  DouyinFavoritesUpstream = "DOUYIN_FAVORITES_UPSTREAM",
  DouyinFavoritesInvalidResponse = "DOUYIN_FAVORITES_INVALID_RESPONSE",
  AttemptIdInvalid = "ATTEMPT_ID_INVALID",
  ReservedInputField = "RESERVED_INPUT_FIELD",
  AttemptPayloadMismatch = "ATTEMPT_PAYLOAD_MISMATCH",
  RetrySourceNotTerminal = "RETRY_SOURCE_NOT_TERMINAL",
  ExecutionClaimInvalid = "EXECUTION_CLAIM_INVALID",
  ModelConfigurationManaged = "MODEL_CONFIGURATION_MANAGED",
  OutputNotOwned = "OUTPUT_NOT_OWNED",
  UnsupportedOutputType = "UNSUPPORTED_OUTPUT_TYPE",
  UnsupportedDeliverable = "UNSUPPORTED_DELIVERABLE",
  TargetPlatformMismatch = "TARGET_PLATFORM_MISMATCH",
  OwnerMismatch = "OWNER_MISMATCH",
  CapabilityUnavailable = "CAPABILITY_UNAVAILABLE",
  SourceUnavailable = "SOURCE_UNAVAILABLE",
  CandidateNotReady = "CANDIDATE_NOT_READY",
  MediaBindingMismatch = "MEDIA_BINDING_MISMATCH",
  AssetNotConfirmed = "ASSET_NOT_CONFIRMED",
  VersionConflict = "VERSION_CONFLICT",
  IdempotencyConflict = "IDEMPOTENCY_CONFLICT",
}

export const ERROR_HTTP: Record<ErrorCode, number> = {
  [ErrorCode.ValidationError]: 400,
  [ErrorCode.AuthenticationError]: 401,
  [ErrorCode.OwnershipError]: 404,
  [ErrorCode.ConflictError]: 409,
  [ErrorCode.RateLimitError]: 429,
  [ErrorCode.ExternalDependencyError]: 502,
  [ErrorCode.UnexpectedError]: 500,
  [ErrorCode.AccountRequiredError]: 428,
  [ErrorCode.DouyinFavoritesSessionExpired]: 401,
  [ErrorCode.DouyinFavoritesBrowserLocked]: 409,
  [ErrorCode.DouyinFavoritesCaptcha]: 428,
  [ErrorCode.DouyinFavoritesNetwork]: 502,
  [ErrorCode.DouyinFavoritesUpstream]: 502,
  [ErrorCode.DouyinFavoritesInvalidResponse]: 502,
  [ErrorCode.AttemptIdInvalid]: 400,
  [ErrorCode.ReservedInputField]: 400,
  [ErrorCode.AttemptPayloadMismatch]: 409,
  [ErrorCode.RetrySourceNotTerminal]: 409,
  [ErrorCode.ExecutionClaimInvalid]: 400,
  [ErrorCode.ModelConfigurationManaged]: 409,
  [ErrorCode.OutputNotOwned]: 404,
  [ErrorCode.UnsupportedOutputType]: 400,
  [ErrorCode.UnsupportedDeliverable]: 400,
  [ErrorCode.TargetPlatformMismatch]: 409,
  [ErrorCode.OwnerMismatch]: 409,
  [ErrorCode.CapabilityUnavailable]: 503,
  [ErrorCode.SourceUnavailable]: 424,
  [ErrorCode.CandidateNotReady]: 409,
  [ErrorCode.MediaBindingMismatch]: 409,
  [ErrorCode.AssetNotConfirmed]: 409,
  [ErrorCode.VersionConflict]: 409,
  [ErrorCode.IdempotencyConflict]: 409,
};

// `code` is a free string (domain codes like PROJECT_NOT_FOUND) but every
// domain code maps to one ErrorCode class for HTTP status resolution.
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
  meta: successMeta,
});

export type SuccessEnvelope<T> = { data: T; meta: { requestId: string } };
export type ListEnvelope<T> = { data: T[]; meta: z.infer<typeof listMeta> };
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
