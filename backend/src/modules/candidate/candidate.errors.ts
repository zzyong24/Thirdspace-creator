// Candidate error surface (foundation §2). `OwnershipError` is promoted from the
// identity module's public entry; it carries `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (cross-user access → 404, never 403, to
// avoid leaking row existence across tenants, SPEC §20). A cross-user candidate /
// signal read surfaces as 404 because the scoped select returns empty and the repo
// throws OwnershipError before any row is revealed.
//
// `DerivedFieldError` guards the repository's patchCandidate: a free patch can NEVER
// set `status:'promoted'` (only the promote op) nor `demand_count` (a maintained
// denormalization). → ValidationError.
//
// `PromoteStateError` is the promote guard: an already-promoted Candidate cannot be
// promoted again (no double-promote → no duplicate Project / topic_promotions row).
// → ValidationError.
//
// `DanglingRunError` is the C-4 / RISK-005 guard: ingestAudienceSignal rejects a
// signal whose `ingestionRunId` does not reference a REAL IngestionRun. →
// ValidationError.
//
// `SignalSchemaError` (errorCode:"SCHEMA_INVALID") is the typed-record guard: the
// Ingestion module hands opaque `Record<string,unknown>` records; this module
// validates them against `audienceSignalRecordSchema` and rejects with a STABLE
// code so Ingestion's partial-success accounting works. → ValidationError.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared
// infra so the transport's default + no-ctx branches raise them (the composite never
// masks a real error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@creatoros/backend";
export {
  UnsupportedOperationError,
  AuthenticationError,
  // [T-332 S2] 账号全域隔离:未选号访问 per-account 域(candidate 四表)→ 引导态错误 + 统一断言。
  AccountRequiredError,
  requireAccountId,
} from "@creatoros/backend";

export class DerivedFieldError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "DerivedFieldError";
  }
}

export class PromoteStateError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "PromoteStateError";
  }
}

export class DanglingRunError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "DanglingRunError";
  }
}

export class SignalSchemaError extends Error {
  readonly code = ErrorCode.ValidationError;
  readonly errorCode = "SCHEMA_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "SignalSchemaError";
  }
}
