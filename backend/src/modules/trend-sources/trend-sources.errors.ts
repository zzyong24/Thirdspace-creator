// [T-235b] TrendSources error surface(foundation §2,照 benchmark.errors 先例)。
// OwnershipError → 404(跨用户访问不泄露行存在);ValidationError → 400(守 create/toggle 输入);
// UnsupportedOperationError / AuthenticationError 从 shared infra re-export。
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
