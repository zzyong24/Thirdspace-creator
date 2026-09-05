// Publishing error surface (foundation §2). `OwnershipError` is the ONE typed class
// promoted from the identity module's public entry; it carries
// `ErrorCode.OwnershipError`, which the /api/v1/dispatch route maps to HTTP 404
// (cross-user access → 404, never 403, to avoid leaking row existence across
// tenants). A cross-user publication get/revision/transition surfaces as 404
// structurally.
//
// `ConflictError` is the domain guard for an illegal state-machine move — here a
// Publication.status transition outside the §12 machine (e.g. draft → removed, or
// a backward published → scheduled jump). It carries the contract
// `ErrorCode.ConflictError` so the dispatch route maps it to 409 without importing
// the class.
//
// `ValidationError` guards a malformed input — an unknown `platform` string that
// does not parse as a contract `platformId`, or a cover asset that is missing /
// not an image (SPEC §15: Publishing 校验封面). It maps to 422.
//
// `UnsupportedOperationError` is re-exported from shared infra so the transport's
// default branch raises it (the composite never masks a real error).
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@creatoros/backend";
export { UnsupportedOperationError, AuthenticationError } from "@creatoros/backend";
// [T-332 S2] 未选号访问 per-account 域 → 引导态错误(SPEC §4.2);service 的 repoFor 经
// requireAccountId 断言 ctx.accountId,缺失即抛 —— 不存在「未选号 = 全量」退化。
export { AccountRequiredError, requireAccountId } from "@creatoros/backend";

export class ConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  readonly details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ConflictError";
    this.details = details;
  }
}

export class ValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** 平台动作未接通，与transport不拥有该操作不同，不能触发mock兜底。 */
export class PublishingUnavailableError extends Error {
  readonly code = ErrorCode.ConflictError;
  readonly details: {reason: "automatic_publishing_unavailable"; operation: "publish" | "remove"};
  constructor(operation: "publish" | "remove") {
    super(operation === "publish"
      ? "自动发布暂未接通。请在平台完成发布后，使用手工登记记录作品链接。"
      : "自动下架暂未接通。请前往平台管理已发布作品。");
    this.name = "PublishingUnavailableError";
    this.details = {reason: "automatic_publishing_unavailable", operation};
  }
}
