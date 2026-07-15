// Ingestion error surface (foundation §2). `OwnershipError` (promoted from the
// identity module's public entry) is thrown for cross-user / unknown run access
// (→ HTTP 404 via ErrorCode.OwnershipError — never reveal a run's existence across
// tenants, SPEC §20). `UnsupportedOperationError` / `AuthenticationError` are
// re-exported from shared infra so the transport's default + no-ctx branches raise
// them (the composite never masks a real error).
export { OwnershipError } from "@creatoros/backend";
export {
  UnsupportedOperationError,
  AuthenticationError,
  // [T-332 S2] 账号全域隔离:external_sources / ingestion_runs 是 per-account 表,
  // 未选号读写 → 引导态错误 + 统一断言(采集链路 ctx 的账号由绑定/job 派生,恒有号)。
  AccountRequiredError,
  requireAccountId,
} from "@creatoros/backend";
