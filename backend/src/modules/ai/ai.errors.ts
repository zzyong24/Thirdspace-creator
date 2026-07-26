// AI error surface (foundation §2). `OwnershipError` is promoted from the identity
// module's public entry; it carries `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (cross-user access → 404, never 403, to avoid
// leaking row existence across tenants, SPEC §20). A cross-user conversation / task /
// result read surfaces as 404 because the scoped select returns empty and the repo
// throws OwnershipError before any row is revealed.
//
// `ConflictError` is the AI Task state-machine guard (SPEC §12 / state-machine.ts): an
// illegal transition (confirm from a non-awaiting_confirmation status, cancel from a
// terminal state) is a ConflictError (→ 409). It carries the contract `ErrorCode` in
// `.code` so the dispatch route maps it by code without importing the class.
//
// `UnsupportedOperationError` / `AuthenticationError` are re-exported from shared infra
// so the transport's default + no-ctx branches raise them (the composite never masks a
// real error).
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

export class AttemptIdInvalidError extends Error {
  readonly code = ErrorCode.AttemptIdInvalid;
  constructor() {
    super("attemptId must contain 16..128 characters");
    this.name = "AttemptIdInvalidError";
  }
}

export class ReservedInputFieldError extends Error {
  readonly code = ErrorCode.ReservedInputField;
  readonly details: { fields: string[] };
  constructor(fields: string[]) {
    super(`Reserved AI task input fields are server-only: ${fields.join(", ")}`);
    this.name = "ReservedInputFieldError";
    this.details = { fields };
  }
}

export class AttemptPayloadMismatchError extends Error {
  readonly code = ErrorCode.AttemptPayloadMismatch;
  readonly details: { existingTaskId: string };
  constructor(existingTaskId: string) {
    super("The same attemptId was reused with a different request payload");
    this.name = "AttemptPayloadMismatchError";
    this.details = { existingTaskId };
  }
}

export class RetrySourceNotTerminalError extends Error {
  readonly code = ErrorCode.RetrySourceNotTerminal;
  readonly details: { taskId: string };
  constructor(taskId: string) {
    super("retryOfTaskId must refer to a terminal task of the same taskType");
    this.name = "RetrySourceNotTerminalError";
    this.details = { taskId };
  }
}

export class ExecutionClaimInvalidError extends Error {
  readonly code = ErrorCode.ExecutionClaimInvalid;
  constructor(message: string) {
    super(message);
    this.name = "ExecutionClaimInvalidError";
  }
}

/** Server-only signal that a live runner no longer owns its execution lease. */
export class ExecutionLeaseLostError extends Error {
  constructor(taskId: string) {
    super(`AI task execution lease was lost: ${taskId}`);
    this.name = "ExecutionLeaseLostError";
  }
}
