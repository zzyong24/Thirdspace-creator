// Assets error surface (foundation §2). `OwnershipError` is the ONE typed class
// promoted to the identity module's public entry; it carries
// `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to HTTP 404
// (foundation §2: cross-user access → 404, never 403, to avoid leaking row
// existence across tenants). Reusing it keeps a cross-user get/trash/restore/
// file-add surfacing as 404 structurally (by `.code`).
//
// The domain guards carry the contract `ErrorCode` in `.code` so the dispatch
// route maps them by code without importing each class:
//   - InvalidTransitionError → ConflictError (409): an illegal §12 lifecycle
//     transition (e.g. trashing an already-deleted asset).
//   - ConflictError → 409: an idempotency violation (completing an
//     already-completed upload session).
//   - UploadValidationError → ValidationError (400): SPEC §20 upload input
//     validation (bad assetType / fileSize ≤ 0 / empty mimeType / failed
//     head-object checks).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@creatoros/backend";

export class InvalidTransitionError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

export class ConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class UploadValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}
