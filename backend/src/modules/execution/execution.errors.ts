// 执行层错误面(T-255a)—— 与 ai 模块同款:OwnershipError(→404,跨用户/非 exec 任务
// 不泄漏存在性)与共享 infra 的 Authentication/UnsupportedOperation 直接复用;
// ConflictError(状态机守卫,→409)/ValidationError(契约校验失败,→400)带契约
// ErrorCode,dispatch route 按 `.code` 映射,无需 import 本模块类。
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

export class ExecutionValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ExecutionValidationError";
  }
}
