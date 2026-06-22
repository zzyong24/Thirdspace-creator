// Ingestion error surface (foundation §2). `OwnershipError` (promoted from the
// identity module's public entry) is thrown for cross-user / unknown run access
// (→ HTTP 404 via ErrorCode.OwnershipError — never reveal a run's existence across
// tenants, SPEC §20). `UnsupportedOperationError` / `AuthenticationError` are
// re-exported from shared infra so the transport's default + no-ctx branches raise
// them (the composite never masks a real error).
export { OwnershipError } from "@/server/modules/identity";
export {
  UnsupportedOperationError,
  AuthenticationError,
} from "@creatoros/backend";
