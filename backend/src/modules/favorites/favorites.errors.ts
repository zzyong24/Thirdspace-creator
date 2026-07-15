// [T-235c] Favorites error surface(foundation §2,照 trend-sources.errors 先例)。
// OwnershipError → 404(跨用户访问不泄露行存在);ValidationError → 400(守 create/toggle 输入);
// UnsupportedOperationError / AuthenticationError 从 shared infra re-export。
import { ErrorCode } from "@creatoros/contract";

export { OwnershipError } from "@creatoros/backend";
export {
  UnsupportedOperationError,
  AuthenticationError,
  // [T-332 S2] 账号全域隔离:未选号访问 per-account 域(favorites 两表)→ 引导态错误 + 统一断言。
  AccountRequiredError,
  requireAccountId,
} from "@creatoros/backend";

export class ValidationError extends Error {
  readonly code = ErrorCode.ValidationError;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
