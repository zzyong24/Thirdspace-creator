// Reviews error surface (foundation §2). `OwnershipError` is promoted from the
// identity module's public entry; it carries `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (cross-user access → 404, never 403, to
// avoid leaking row existence across tenants, SPEC §20). A cross-user review/
// insight read surfaces as 404 because the scoped select returns empty and the repo
// throws OwnershipError before any row is revealed.
//
// `ConflictError` is the Review state-machine guard (SPEC §12): adding an insight
// to a non-`in_progress` review, or completing an `abandoned` review, is a
// ConflictError (→ 409). `ValidationError` is the input guard (an output-scoped
// create without a contentOutputId → 400). Both carry the contract `ErrorCode` in
// `.code` so the dispatch route maps them by code without importing each class.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared
// infra so the transport's default + no-ctx branches raise them (the composite
// never masks a real error).
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
