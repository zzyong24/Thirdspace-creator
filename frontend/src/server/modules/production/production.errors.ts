// Production error surface (foundation §2). `OwnershipError` is the ONE typed class
// promoted from the identity module's public entry; it carries
// `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to HTTP 404
// (cross-user access → 404, never 403, to avoid leaking row existence across
// tenants). A cross-user get/segment/export surfaces as 404 structurally.
//
// `ConflictError` is the domain guard for an illegal state-machine move — here a
// Production.status skip/backward jump (§12) or an ExportRecord completed out of
// its `queued|rendering` window. It carries the contract `ErrorCode.ConflictError`
// so the dispatch route maps it to 409 without importing the class.
//
// `UnsupportedOperationError` is re-exported from shared infra so the transport's
// default branch raises it (the composite never masks a real error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";
export { UnsupportedOperationError } from "@creatoros/backend";

export class ConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
