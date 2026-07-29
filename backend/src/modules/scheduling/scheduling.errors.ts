// Scheduling error surface (foundation §2). `OwnershipError` is promoted from shared
// infra; it carries `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to
// HTTP 404 (cross-user access → 404, never 403, to avoid leaking row existence across
// tenants, SPEC §20). A cross-user scheduled_job / job_run read surfaces as 404 because
// the user-scoped select returns empty and the repo throws OwnershipError before any row
// is revealed. `job_run` reads/writes go through the requireJob gate (the parent job must
// belong to ctx.userId), so a cross-user run is unreachable.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared infra so
// the transport's default + no-ctx branches raise them (the composite never masks a real
// error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@creatoros/backend";
export {
  UnsupportedOperationError,
  AuthenticationError,
  // [T-332 S2] 账号全域隔离:未选号访问 per-account 域(scheduled_job)→ 引导态错误 + 统一断言。
  AccountRequiredError,
  requireAccountId,
} from "@creatoros/backend";

export class ValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
