import { ErrorCode } from "@creatoros/contract";

// Taxonomy error classes (Step 3). These reuse the contract `ErrorCode` names
// (envelope.ts) so the dispatch route's error mapper + SPEC §14 stay aligned:
// each error carries the `ErrorCode` whose `ERROR_HTTP` entry resolves the HTTP
// status. Mirrors identity.errors.ts.
//
//   TagNotFoundError      → OwnershipError  → 404 (cross-user / unknown tag)
//   DuplicateTagError     → ConflictError   → 409 (unique (user,name) violation)
//   InvalidEntityRefError → ValidationError → 400 (entityType not one of the 6)

/**
 * Tag not found within the caller's ownership scope (maps to HTTP 404 via
 * `ErrorCode.OwnershipError`). Surfaced as 404 (not 403) to avoid leaking row
 * existence across tenants (SPEC §14/§20).
 */
export class TagNotFoundError extends Error {
  readonly code = ErrorCode.OwnershipError;

  constructor(message = "Tag not found") {
    super(message);
    this.name = "TagNotFoundError";
    Object.setPrototypeOf(this, TagNotFoundError.prototype);
  }
}

/**
 * Duplicate tag name for this user (maps to HTTP 409 via
 * `ErrorCode.ConflictError`). Raised on the `tags_user_name_uq` violation.
 */
export class DuplicateTagError extends Error {
  readonly code = ErrorCode.ConflictError;

  constructor(message = "A tag with this name already exists") {
    super(message);
    this.name = "DuplicateTagError";
    Object.setPrototypeOf(this, DuplicateTagError.prototype);
  }
}

/**
 * Invalid entity reference (maps to HTTP 400 via `ErrorCode.ValidationError`).
 * Raised when `entityType` is not one of the 6 known kinds, or `name` is blank.
 */
export class InvalidEntityRefError extends Error {
  readonly code = ErrorCode.ValidationError;

  constructor(message = "Invalid entity reference") {
    super(message);
    this.name = "InvalidEntityRefError";
    Object.setPrototypeOf(this, InvalidEntityRefError.prototype);
  }
}
