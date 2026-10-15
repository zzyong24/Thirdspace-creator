// Settings module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Settings ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared
// db, the transport factory + op-id list the composite merges, SETTINGS_DDL, the
// DTO schemas, and the error class the dispatch route maps. No cross-module
// repository import — the account read is injected as an `accountReader` (the
// Identity service's getCurrentUser), not a `users` repo import (foundation §1).
//
// `resolveModelForCapability` is public on SettingsService so the AI module's
// ClaudeAgentRunner reads the user's model config from Settings (foundation §3).

export {
  createSettingsService,
  type ModelRoutingProjectionReader,
  ModelRoutingConflictError,
  ModelRoutingValidationError,
  type SettingsService,
  type AccountReader,
  type AccountWriter,
  type AccountProfilePatch,
  type ResolvedModel,
  type ModelConfigInternal,
  type ChannelModelCredentialStatus,
  // [T-363] 模型配置导出/导入(设置页兜底;route 直调 service,无契约 op)。
  ModelConfigImportError,
  type ModelConfigExportFile,
  type ModelConfigExportRow,
  type ModelConfigImportReport,
  type ModelConfigImportRowResult,
  type ModelConfigImportSecretOutcome,
} from "./settings.service";

export {
  createSettingsRepository,
  type SettingsRepository,
  type RepoDeps,
  type UserPreferenceRow,
  type ModelConfigurationRow,
  type ChannelModelCredentialRow,
  type AgentConfigurationRow,
  type StorageConfigRow,
  type SkillConfigOverrideRow,
  type PreferencePatch,
  type ModelPutBody,
  type AgentCreateInput,
  type StorageConfigPatch,
  type SkillConfigOverridePutBody,
  // [T-453] 解密失败 sentinel + 判定 helper —— resolve.ts / UI 层认这个值就能给
  //   「已配但密钥不可用,请重填」明确提示,而非"消失、当没配"迷惑用户。
  SECRET_DECRYPT_FAIL_SENTINEL,
  isDecryptFailSentinel,
} from "./settings.repository";

export {
  createSettingsTransport,
  SETTINGS_OP_IDS,
} from "./settings.transport";

export { SETTINGS_DDL } from "./settings.db-schema";

export {
  OwnershipError,
  StorageValidationError,
  PromptValidationError,
} from "./settings.errors";

export {
  userResource,
  userPreferenceResource,
  modelConfigurationResource,
  agentConfigurationResource,
  storageConfigResource,
  skillConfigOverrideResource,
  type UserResource,
  type UserPreferenceResource,
  type ModelConfigurationResource,
  type AgentConfigurationResource,
  type StorageConfigResource,
  type SkillConfigOverrideResource,
} from "./settings.schema";

export {createIntegrationCredentials,INTEGRATION_CREDENTIALS_DDL} from "./integration-credentials";
export {createRedfoxSubmissions} from "./redfox-submissions";

export { createOnboardingState, type OnboardingAccountReader } from "./onboarding-state";
export { createReportingLocal, REPORTING_CONSENT_VERSION } from "./reporting-local";

export {createEncryptedLogReporting} from "./encrypted-log-reporting";

export {effectiveModelRouting} from './model-routing-defaults';
