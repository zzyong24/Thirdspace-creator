// Knowledge error surface (foundation §2). `OwnershipError` is the ONE typed
// class promoted to the identity module's public entry; it carries
// `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to HTTP 404
// (foundation §2: cross-user access → 404, never 403, to avoid leaking row
// existence across tenants). Reusing it keeps a cross-user get/revise/relate
// surfacing as 404 structurally (by `.code`).
//
// `ConflictError` is the domain guard for an illegal write — here a self-link
// relation (source === target). It carries the contract `ErrorCode.ConflictError`
// in `.code` so the dispatch route maps it to 409 without importing the class.
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";

export class ConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

// `InvalidTransitionError` guards the §12-style status machine — here archiving
// an item that is not `active` (already archived). It carries
// `ErrorCode.ConflictError` (→409) in `.code` so the dispatch route maps it by
// code without importing the class (mirrors assets.trash's transition guard).
export class InvalidTransitionError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}
