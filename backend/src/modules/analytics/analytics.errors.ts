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
// [T-332 S2] 未选号访问 per-account 域 → 引导态错误(SPEC §4.2);service 各 ctx 入口经
// requireAccountId 断言 ctx.accountId,缺失即抛 —— 不存在「未选号 = 全量」退化。
export { AccountRequiredError, requireAccountId } from "@creatoros/backend";
