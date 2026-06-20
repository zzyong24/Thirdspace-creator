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
}

export const ERROR_HTTP: Record<ErrorCode, number> = {
  [ErrorCode.ValidationError]: 400,
  [ErrorCode.AuthenticationError]: 401,
  [ErrorCode.OwnershipError]: 404,
  [ErrorCode.ConflictError]: 409,
  [ErrorCode.RateLimitError]: 429,
  [ErrorCode.ExternalDependencyError]: 502,
  [ErrorCode.UnexpectedError]: 500,
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
