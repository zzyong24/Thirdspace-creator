// 设置授权只经后端服务持久化；旧consentVersion=1不在本服务内升级。
export { createObservabilityCollector as createEncryptedLogReporting } from "../observability/collector";
