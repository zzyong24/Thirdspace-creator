import { ErrorCode } from "@creatoros/contract";

// Shared-infra error classes (foundation §1/§2). The persistence transport
// (Task 8) throws `AuthenticationError` when a persisted (owned) op is reached
// with NO RequestContext — an unauthenticated dispatch. It reuses the contract
// `ErrorCode` so the dispatch/auth route mapper (Task 9) resolves the SAME HTTP
// status (AuthenticationError → 401) structurally, by `.code`, whether the error
// originated here (backend infra) or in the identity module's mirror class.
//
// Kept minimal: only the codes shared infra needs to raise. The identity module
// owns the richer auth/ownership error surface (frontend identity.errors.ts);
// both carry `ErrorCode.AuthenticationError`, so the route mapper treats them
// identically.

/**
 * Authentication failure (maps to HTTP 401 via `ErrorCode.AuthenticationError`).
 * Thrown by the persistence transport for a persisted op with no ctx, and
 * available to any shared-infra layer that must reject unauthenticated access.
 */
export class AuthenticationError extends Error {
  readonly code = ErrorCode.AuthenticationError;

  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "AuthenticationError";
    // Restore the prototype chain for instanceof across the transpiled target.
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Ownership / not-found-for-this-scope failure (maps to HTTP 404 via
 * `ErrorCode.OwnershipError`). Shared-infra canonical home so backend modules
 * raise it WITHOUT importing the identity module (前后端分离:模块不跨依赖 identity)。
 * The identity module keeps a mirror class carrying the SAME `.code`; the dispatch
 * route mapper resolves both to 404 structurally by `.code`, never by instanceof.
 */
export class OwnershipError extends Error {
  readonly code = ErrorCode.OwnershipError;

  constructor(message = "Not found") {
    super(message);
    this.name = "OwnershipError";
    Object.setPrototypeOf(this, OwnershipError.prototype);
  }
}
