import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import {
  userResource,
  userPreferenceResource,
  modelConfigurationResource,
  agentConfigurationResource,
  storageConfigResource,
} from "../resources/settings";

// SPEC §13 "设置" group. `GET /settings` is the singleton settings view for the
// authenticated user (not a collection); the remaining operations mutate the
// user's preferences, per-capability model config, and agent configs.
export const settingsOperations = {
  getSettings: defineEndpoint({
    id: "settings.get",
    method: "GET",
    path: "/settings",
    response: userResource,
    fr: ["FR-SETTINGS-GET"],
  }),
  patchPreferences: defineEndpoint({
    id: "settings.preferences.patch",
    method: "PATCH",
    path: "/settings/preferences",
    body: z.object({
      defaultHome: z.string().optional(),
      defaultCreationMode: z
        .enum(["guided", "flexible", "freeform"])
        .optional(),
      defaultVisibility: z.enum(["private", "unlisted", "public"]).optional(),
      autosaveEnabled: z.boolean().optional(),
      fileNamingRule: z.string().optional(),
      analyticsEnabled: z.boolean().optional(),
    }),
    response: userPreferenceResource,
    fr: ["FR-SETTINGS-PREFERENCES-UPDATE"],
  }),
  putModel: defineEndpoint({
    id: "settings.models.put",
    method: "PUT",
    path: "/settings/models/:capability",
    params: z.object({ capability: z.string().min(1) }),
    body: z.object({
      provider: z.string().min(1),
      modelName: z.string().min(1),
      secretReference: z.string().optional(),
      baseUrl: z.string().optional(),
      apiFormat: z.enum(["anthropic", "openai_chat"]).optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
      isDefault: z.boolean().optional(),
      // Inline secret value — stored directly in the (local) DB. Absent or empty
      // string = keep the existing secret (a partial update never wipes it).
      secret: z.string().optional(),
    }),
    response: modelConfigurationResource,
    fr: ["FR-SETTINGS-MODEL-UPSERT"],
  }),
  listModels: defineEndpoint({
    id: "settings.models.list",
    method: "GET",
    path: "/settings/models",
    response: z.array(modelConfigurationResource),
    fr: ["FR-SETTINGS-MODEL-LIST"],
  }),
  createAgent: defineEndpoint({
    id: "settings.agents.create",
    method: "POST",
    path: "/settings/agents",
    body: z.object({
      name: z.string().min(1),
      agentType: z.string().min(1),
    }),
    response: agentConfigurationResource,
    fr: ["FR-SETTINGS-AGENT-CREATE"],
  }),
  // item B — media-storage binding. `getStorage` returns the resolved config +
  // real usage; `putStorage` updates the backend choice and/or media root path
  // (validated server-side: a non-writable / system-sensitive path is rejected).
  getStorage: defineEndpoint({
    id: "settings.storage.get",
    method: "GET",
    path: "/settings/storage",
    response: storageConfigResource,
    fr: ["FR-SETTINGS-STORAGE-GET"],
  }),
  putStorage: defineEndpoint({
    id: "settings.storage.put",
    method: "PUT",
    path: "/settings/storage",
    body: z.object({
      backend: z.enum(["local", "s3"]).optional(),
      rootPath: z.string().optional(),
    }),
    response: storageConfigResource,
    fr: ["FR-SETTINGS-STORAGE-UPDATE"],
  }),
} as const;
