// MaterialLink error surface (foundation §2). `OwnershipError` is promoted from the
// identity module's public entry; it carries `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (cross-user access → 404, never 403, so a
// cross-user delete cannot probe row existence). `ValidationError` (→400) guards the
// create input (bad entityType). `UnsupportedOperationError` / `AuthenticationError`
// are re-exported from shared infra so the transport's default + no-ctx branches raise
// them (the composite never masks a real error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";
export {
  UnsupportedOperationError,
  AuthenticationError,
} from "@creatoros/backend";

export class ValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
