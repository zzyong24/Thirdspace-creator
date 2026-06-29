// Calibration error surface (foundation §2). Re-use the foundation error types; do
// not redefine if they already exist.
//   - `OwnershipError` is promoted from the identity module's public entry; it
//     carries ErrorCode.OwnershipError, which /api/v1/dispatch maps to HTTP 404
//     (cross-user access → 404, never 403, so row existence never leaks across
//     tenants, SPEC §20). A scoped select returning empty throws it before any row
//     is revealed.
//   - `ConflictError` guards the Prediction state machine: a CalibrationResult against
//     an UNLOCKED (still-editable) prediction is rejected → 409.
//   - `ImmutableError` guards the immutability invariants (§6.2): a content edit /
//     re-lock attempt against a LOCKED prediction, or any update of an immutable
//     RubricVersion row. Mapped to 409 (a conflicting state, like ConflictError) —
//     it carries ErrorCode.ConflictError so the dispatch route maps it by code.
//   - `ValidationError` guards the 变现加权维度 rules (§2.0): non-empty dimensions, the
//     weight normalizer, and the "not 播放量-only" direction.
//   - `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared
//     infra so the transport's default + no-ctx branches raise them (the composite
//     never masks a real error).
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

// A locked Prediction / an immutable RubricVersion is never edited (§6.2 盲预测不可改 +
// data-model 约束 6). An edit/unlock attempt is a conflicting state → mapped to 409 via
// ErrorCode.ConflictError (no separate HTTP code for immutability in the contract).
export class ImmutableError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ImmutableError";
  }
}

export class ValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
