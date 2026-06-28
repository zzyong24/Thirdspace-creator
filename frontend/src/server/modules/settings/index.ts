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
  type SettingsService,
  type AccountReader,
  type AccountWriter,
  type AccountProfilePatch,
  type ResolvedModel,
} from "./settings.service";

export {
  createSettingsRepository,
  type SettingsRepository,
  type RepoDeps,
  type UserPreferenceRow,
  type ModelConfigurationRow,
  type AgentConfigurationRow,
  type StorageConfigRow,
  type PreferencePatch,
  type ModelPutBody,
  type AgentCreateInput,
  type StorageConfigPatch,
} from "./settings.repository";

export {
  createSettingsTransport,
  SETTINGS_OP_IDS,
} from "./settings.transport";

export { SETTINGS_DDL } from "./settings.db-schema";

export { OwnershipError, StorageValidationError } from "./settings.errors";

export {
  userResource,
  userPreferenceResource,
  modelConfigurationResource,
  agentConfigurationResource,
  storageConfigResource,
  type UserResource,
  type UserPreferenceResource,
  type ModelConfigurationResource,
  type AgentConfigurationResource,
  type StorageConfigResource,
} from "./settings.schema";
