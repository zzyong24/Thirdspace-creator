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

export { OwnershipError } from "@creatoros/backend";

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

// §15/§16 内容门禁失败:一个阶段「声称完成」但其核心交付物缺失。是一种 ConflictError
// (→409),但额外携带 `details.missing`(人类可读的中文缺失项列表)+ `details.stage`,
// 让 dispatch route 把它透传进 error envelope 的 details,前端 stepper 据此显示
// 「为什么进不去」。
export class StageGateError extends Error {
  readonly code = ErrorCode.ConflictError;
  readonly details: { stage: string; missing: string[] };
  constructor(stage: string, missing: string[]) {
    super(`阶段「${stage}」核心交付物缺失,无法流转:${missing.join("、")}`);
    this.name = "StageGateError";
    this.details = { stage, missing };
  }
}
