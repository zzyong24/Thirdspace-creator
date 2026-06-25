import { ErrorCode } from "@creatoros/contract";

// Identity error classes (Module 00, Task 4).
//
// These reuse the contract `ErrorCode` names (envelope.ts) so the dispatch /
// auth-route error mapper (Task 9) and SPEC §14 stay aligned: each error carries
// the `ErrorCode` whose `ERROR_HTTP` entry resolves the HTTP status
// (AuthenticationError → 401, OwnershipError → 404). The repository currently
// signals OwnershipError by message; Task 5's service throws these classes so the
// route layer can map them structurally rather than by string-sniffing.

/**
 * Authentication failure (maps to HTTP 401 via `ErrorCode.AuthenticationError`).
 *
 * Thrown for wrong/blank credentials and for no/invalid/revoked/expired sessions.
 * The default message is deliberately generic — login uses the SAME message for
 * "unknown email" and "wrong password" to avoid user enumeration (SPEC §20, plan
 * Task 5).
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
 * `ErrorCode.OwnershipError`).
 *
 * Thrown when a user/session row is not found within the caller's ownership
 * scope. Surfaced as 404 (not 403) to avoid leaking row existence across tenants
 * (SPEC §14, foundation §2).
 */
export class OwnershipError extends Error {
  readonly code = ErrorCode.OwnershipError;

  constructor(message = "Not found") {
    super(message);
    this.name = "OwnershipError";
    Object.setPrototypeOf(this, OwnershipError.prototype);
  }
}

/**
 * Registration conflict — the requested email is already taken (maps to HTTP
 * 409 via `ErrorCode.ConflictError`).
 *
 * Unlike login (which uses ONE generic message to avoid user enumeration),
 * registration MUST tell the caller their chosen email is unavailable so they
 * can pick another — the conflict signal is unavoidable and expected here. The
 * default message stays neutral (no account detail beyond "taken").
 */
export class EmailTakenError extends Error {
  readonly code = ErrorCode.ConflictError;

  constructor(message = "Email already registered") {
    super(message);
    this.name = "EmailTakenError";
    Object.setPrototypeOf(this, EmailTakenError.prototype);
  }
}
