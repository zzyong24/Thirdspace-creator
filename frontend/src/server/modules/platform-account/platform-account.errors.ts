// PlatformAccount error surface (foundation §2). `OwnershipError` is the ONE typed
// class promoted to the identity module's public entry; it carries
// `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to HTTP 404
// (foundation §2: cross-user access → 404, never 403, to avoid leaking row existence
// across tenants). Reusing it keeps a cross-user get/update/archive/bind surfacing as
// 404 structurally (by `.code`).
//
// `ConflictError` (→409) is the duplicate-handle guard: registering an account whose
// (user, platform, handle) already exists violates the unique index (矩阵号 dup).
//
// `ValidationError` (→400) is the input/binding guard: an invalid platform string, a
// negative followerBaseline, an empty handle, or — for the cross-module binding seam
// `assertOwnedAccount` — an archived account / platform mismatch.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared infra
// so the transport's default + no-ctx branches raise them (the composite never masks a
// real error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";
export {
  UnsupportedOperationError,
  AuthenticationError,
} from "@creatoros/backend";

export class ConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
