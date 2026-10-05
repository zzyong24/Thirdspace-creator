// [T-235d] TopicAttribution error surface(foundation §2,照 trend-sources.errors 先例)。
// 本模块只有系统写入(runner 落库)+ 只读 list,无人工变更入口 → 无需自有 ValidationError;
// UnsupportedOperationError / AuthenticationError 从 shared infra re-export。
export {
  UnsupportedOperationError,
  AuthenticationError,
  OwnershipError,
  // [T-332 S2] 账号全域隔离:未选号访问 per-account 域(topic_attributions)→ 引导态错误 + 统一断言。
  AccountRequiredError,
  requireAccountId,
} from "@creatoros/backend";
