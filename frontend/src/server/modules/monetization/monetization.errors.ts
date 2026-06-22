// Monetization error surface (foundation §2). Re-use the foundation error types; do
// not redefine if they already exist.
//   - `OwnershipError` is promoted from the identity module's public entry; it
//     carries ErrorCode.OwnershipError, which /api/v1/dispatch maps to HTTP 404
//     (cross-user access → 404, never 403, so row existence never leaks across
//     tenants, SPEC §20). A scoped select returning empty throws it before any row
//     is revealed.
//   - `ConflictError` guards the 意图层 link UNIQUE (a content铺路 a product at most
//     once, §4.4) → 409.
//   - `ValidationError` guards: price decoupling (patchProduct rejects a `price`
//     field — re-price goes through createOffer), price >= 0, and the RISK-005
//     悬空 ingestionRunId rejection.
//   - `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared
//     infra so the transport's default + no-ctx branches raise them (the composite
//     never masks a real error).
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
