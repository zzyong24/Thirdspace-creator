// 审核门错误面(foundation §2,同 reviews 模块约定):
//   - OwnershipError    跨用户/未知 id → 404(绝不 403,不泄露行存在性);
//   - ValidationError   输入守卫(非法 status 流转、regex 编译失败等)→ 400;
//   - UnsupportedOperationError / AuthenticationError 共享 infra re-export,
//     transport 的 default / no-ctx 分支抛出(composite 不掩真错)。
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@creatoros/backend";
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

// 「还没有审核报告」用 404 语义(契约无独立 NotFound code,复用 OwnershipError→404 映射;
// 前端 catch 后诚实显「未审」态,不误当异常)。
export class ReportNotFoundError extends Error {
  readonly code = ErrorCode.OwnershipError;
  constructor(message: string) {
    super(message);
    this.name = "ReportNotFoundError";
  }
}
