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
