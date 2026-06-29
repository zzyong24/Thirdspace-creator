// AI error surface (foundation §2). `OwnershipError` is promoted from the identity
// module's public entry; it carries `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (cross-user access → 404, never 403, to avoid
// leaking row existence across tenants, SPEC §20). A cross-user conversation / task /
// result read surfaces as 404 because the scoped select returns empty and the repo
// throws OwnershipError before any row is revealed.
//
// `ConflictError` is the AI Task state-machine guard (SPEC §12 / state-machine.ts): an
// illegal transition (confirm from a non-awaiting_confirmation status, cancel from a
// terminal state) is a ConflictError (→ 409). It carries the contract `ErrorCode` in
// `.code` so the dispatch route maps it by code without importing the class.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared infra
// so the transport's default + no-ctx branches raise them (the composite never masks a
// real error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@creatoros/backend";
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
