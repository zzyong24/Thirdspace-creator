// Analytics error surface (foundation §2). Analytics owns NO module-specific error
// codes beyond ownership: the entities are append-only metric facts with no
// lifecycle (SPEC §12 — no state machine, so no ConflictError), and the contract
// ops are reads. `OwnershipError` is the ONE typed class — promoted from the
// identity module's public entry — carrying `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (cross-user access → 404, never reveal
// row existence across tenants, SPEC §20). A cross-user publication/project read
// surfaces as 404 because the Publishing resolve gate throws OwnershipError before
// any metric row is read.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared
// infra so the transport's default + no-ctx branches raise them (the composite
// never masks a real error).
export { OwnershipError } from "@creatoros/backend";
export {
  UnsupportedOperationError,
  AuthenticationError,
} from "@creatoros/backend";
