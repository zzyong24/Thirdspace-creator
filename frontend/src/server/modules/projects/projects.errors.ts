// Projects error surface. `OwnershipError` is the ONE typed class promoted to the
// identity module's public entry; it carries `ErrorCode.OwnershipError`, which the
// /api/v1/dispatch route maps to HTTP 404 (foundation §2: cross-user access → 404,
// never 403, to avoid leaking row existence across tenants). Reusing it keeps a
// cross-user read/list/transition surfacing as 404 structurally (by `.code`).
//
// The state-machine guards are domain-specific: an illegal stage/output/task
// transition is a ConflictError (→ 409). They carry the contract `ErrorCode` in
// `.code` so the dispatch route maps them by code without importing each class.
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@/server/modules/identity";

export class StageTransitionError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "StageTransitionError";
  }
}

export class OutputStateError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "OutputStateError";
  }
}

export class TaskStateError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "TaskStateError";
  }
}

export class ProjectStateError extends Error {
  readonly code = ErrorCode.ConflictError;
  constructor(message: string) {
    super(message);
    this.name = "ProjectStateError";
  }
}
