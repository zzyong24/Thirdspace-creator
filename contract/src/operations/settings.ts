import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import {
  userResource,
  userPreferenceResource,
  modelConfigurationResource,
  storageConfigResource,
  accountSkillOverlayPatchResource,
  accountSkillOverlayResource,
  accountSkillOverlayVersionResource,
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
  // [T-051 2e] 偏好读 op —— patch 写了 user_preferences 但此前无读 op,设置页
  // 永远渲染 fixture 默认值(写真读假)。
  getPreferences: defineEndpoint({
    id: "settings.preferences.get",
    method: "GET",
    path: "/settings/preferences",
    response: userPreferenceResource,
    fr: ["FR-SETTINGS-PREFERENCES-GET"],
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
      apiFormat: z
        .enum(["anthropic", "openai_chat", "openai_responses"])
        .optional(),
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
  // [T-377] 测试连接:按 capability 用**现有解析链**(resolveLlmConfig / resolveMultimodalSpec
  // / resolveSearchSpec 等)解析已保存的配置,发一次最小真实调用 / 最便宜鉴权探测,诚实回
  // 「✓ 连通」或「✗ 失败:<真实原因人话>」。composition-only op(settings module transport 不认
  // 它,由 persistence-client 的 settingsWithModelTest 拦截 —— 解析器/adapter registry 都住组合根,
  // 同 projects.transcribe / scheduledJobs.runNow 约定)。
  testModelConnection: defineEndpoint({
    id: "settings.models.test",
    method: "POST",
    path: "/settings/models/:capability/test",
    params: z.object({ capability: z.string().min(1) }),
    response: z.object({
      ok: z.boolean(),
      provider: z.string(),
      model: z.string(),
      // 人话结果:成功=探测方式说明;失败=真实原因(未配置 / 鉴权失败 / 调用错误)。
      detail: z.string(),
      // [T-384] 三态:"warn" = 无法探测但也无法证伪配置(如部分 ASR 厂商/中转无 /v1/models
      // 端点回 404)—— 诚实中间态,非失败(此时 ok=true)。缺省按 ok 二态解释(ok→"ok",
      // !ok→"fail"),向后兼容。
      status: z.enum(["ok", "warn", "fail"]).optional(),
    }),
    fr: ["FR-SETTINGS-MODEL-TEST"],
  }),
  // [T-248 批C] settings.agents.create 已删 —— 孤 op(全仓无任何调用方,前端/mcp 均不触达)。
  // agentConfigurationResource 与 agent_configurations 表、backend service/repository 的
  // createAgentConfiguration 链保留(整组暂无其他 op 消费,仅契约面收敛;详见 BACKLOG T-248)。
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
  // T-040 提示词/skill 服务端可配 (SPEC 2026-07-02 §4.4). `list` 读全表 (供管理端总览),
  // `get` 读单个 skill 的覆盖 (未配 → 该 op 由 service 返回 404 via OwnershipError),
  // `put` upsert 一条覆盖 (id ∈ 已注册 18 个模板 — 非法 id 由 service 拒 →
  // ValidationError → 400; put 成功后 persistence-client 重套 override 进常驻 REGISTRY,
  // 热更, 不重启). Mirrors the listModels / putModel id/path/schema style.
  listPrompts: defineEndpoint({
    id: "settings.prompts.list",
    method: "GET",
    path: "/settings/prompts",
    response: z.array(accountSkillOverlayResource),
    fr: ["FR-SETTINGS-PROMPT-LIST"],
  }),
  getPrompt: defineEndpoint({
    id: "settings.prompts.get",
    method: "GET",
    path: "/settings/prompts/:id",
    params: z.object({ id: z.string().min(1) }),
    response: accountSkillOverlayResource,
    fr: ["FR-SETTINGS-PROMPT-GET"],
  }),
  putPrompt: defineEndpoint({
    id: "settings.prompts.put",
    method: "PUT",
    path: "/settings/prompts/:id",
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      expectedRevision: z.number().int().min(1).nullable(),
      patch: accountSkillOverlayPatchResource.refine(
        (patch) => Object.keys(patch).length > 0,
        "patch 至少包含一个字段",
      ),
    }),
    response: accountSkillOverlayResource,
    fr: ["FR-SETTINGS-PROMPT-UPSERT"],
  }),
  // [T-165] 版本历史 + 一键回滚。list = 某 skill 的历史版本快照(最新在前);rollback =
  // 把某历史版本重新生效为当前配置(回滚本身也记一条新版本,审计链不断)。put 后同款热更
  // (persistence-client 重套 override 进常驻 REGISTRY,不重启)。
  listPromptVersions: defineEndpoint({
    id: "settings.prompts.versions.list",
    method: "GET",
    path: "/settings/prompts/:id/versions",
    params: z.object({ id: z.string().min(1) }),
    response: z.array(accountSkillOverlayVersionResource),
    fr: ["FR-SETTINGS-PROMPT-VERSIONS-LIST"],
  }),
  rollbackPrompt: defineEndpoint({
    id: "settings.prompts.rollback",
    method: "POST",
    path: "/settings/prompts/:id/rollback",
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      versionId: z.string().min(1),
      expectedRevision: z.number().int().min(1),
    }),
    response: accountSkillOverlayResource,
    fr: ["FR-SETTINGS-PROMPT-ROLLBACK"],
  }),
} as const;
