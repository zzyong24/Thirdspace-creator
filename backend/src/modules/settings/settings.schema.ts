// Settings module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The contract is the single source of truth for the wire
// shape (contract/src/resources/settings.ts); the contract test validates the
// transport output against these exact schemas.
//
// Topology note (verified, same as notifications/search): the @creatoros/contract
// root barrel re-exports `ENDPOINTS` but NOT the resource files. Each settings
// resource is reachable as the `response` of its owning endpoint.
import { ENDPOINTS } from "@creatoros/contract";

// settings.get → userResource (the identity row, account card).
export const userResource = ENDPOINTS.getSettings.response;
export type UserResource = (typeof userResource)["_output"];

// settings.preferences.patch → userPreferenceResource.
export const userPreferenceResource = ENDPOINTS.patchPreferences.response;
export type UserPreferenceResource = (typeof userPreferenceResource)["_output"];

// settings.models.put → modelConfigurationResource.
export const modelConfigurationResource = ENDPOINTS.putModel.response;
export type ModelConfigurationResource =
  (typeof modelConfigurationResource)["_output"];

// settings.agents.create → agentConfigurationResource.
export const agentConfigurationResource = ENDPOINTS.createAgent.response;
export type AgentConfigurationResource =
  (typeof agentConfigurationResource)["_output"];

// settings.storage.get / put → storageConfigResource (item B).
export const storageConfigResource = ENDPOINTS.getStorage.response;
export type StorageConfigResource =
  (typeof storageConfigResource)["_output"];
