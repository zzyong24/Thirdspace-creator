// [T-212a] Benchmark error surface（foundation §2）。OwnershipError → 404（跨用户访问不泄露
// 行存在）；ValidationError → 400（守 create/toggle 输入）；UnsupportedOperationError /
// AuthenticationError 从 shared infra re-export（transport default / no-ctx 分支用）。
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
