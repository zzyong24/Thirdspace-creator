// Artifacts error surface (foundation §2). `OwnershipError` is the ONE typed class
// promoted from the identity module's public entry; it carries
// `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to HTTP 404
// (cross-user access → 404, never 403, to avoid leaking row existence across
// tenants). A cross-user get/version/restore/relate surfaces as 404 structurally
// (by `.code`).
//
// `ConflictError` is the domain guard for an illegal write — here a structured-
// content write against a non-current version (the immutable-plan guard, roadmap
// §5 callout 5). It carries the contract `ErrorCode.ConflictError` so the dispatch
// route maps it to 409 without importing the class.
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";

export class ConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
