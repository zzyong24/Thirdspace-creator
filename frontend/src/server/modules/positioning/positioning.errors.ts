// Positioning error surface (foundation §2). `OwnershipError` is promoted from the
// identity module's public entry; it carries `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (cross-user access → 404, never 403, to
// avoid leaking row existence across tenants, SPEC §20). A cross-user profile /
// statement read surfaces as 404 because the scoped select returns empty and the
// repo throws OwnershipError before any row is revealed.
//
// `ProfileRequiredError` guards createStatementVersion: a 定位陈述 needs a
// CreatorProfile first (七步 §3 "下游约束源" needs a profile). → 409 (ValidationError
// is the closest contract code that maps; we use ValidationError so the route maps
// it without importing the class).
//
// `GateSubjectError` is the PositioningGate guard: no resolvable statement (neither
// an explicit ownership-checked statementId nor a current max-version statement) →
// the gate cannot score. → ValidationError.
//
// `StatementValidationError` is the 3-keyword guard (contract requires exactly 3) +
// other input shape failures the service enforces beyond the Zod body parse.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared
// infra so the transport's default + no-ctx branches raise them (the composite never
// masks a real error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";
export {
  UnsupportedOperationError,
  AuthenticationError,
} from "@creatoros/backend";

export class ProfileRequiredError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ProfileRequiredError";
  }
}

export class GateSubjectError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "GateSubjectError";
  }
}

export class StatementValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "StatementValidationError";
  }
}
