import * as fs from "node:fs/promises";
import type { RequestContext } from "@creatoros/backend";
import type {
  SettingsRepository,
  UserPreferenceRow,
  ModelConfigurationRow,
  AgentConfigurationRow,
  StorageConfigRow,
  SkillConfigOverrideRow,
  SkillConfigOverrideVersionRow,
  PreferencePatch,
  ModelPutBody,
  AgentCreateInput,
  StorageConfigPatch,
  SkillConfigOverridePutBody,
} from "./settings.repository";
import type {
  UserResource,
  UserPreferenceResource,
  ModelConfigurationResource,
  AgentConfigurationResource,
  StorageConfigResource,
  SkillConfigOverrideResource,
  SkillConfigOverrideVersionResource,
} from "./settings.schema";
import { resolveRootPath } from "@creatoros/backend/modules/assets";
import { rootPathLegalityReason } from "@creatoros/backend/modules/assets";
import { migrateStorageRoot } from "@creatoros/backend/modules/assets";
import {
  StorageValidationError,
  PromptValidationError,
  OwnershipError,
} from "./settings.errors";

// T-040c — the 18 registered skill ids (SPEC 2026-07-02, ai-worker BUILTIN_TEMPLATES).
// putPrompt validates its target id against the registered set (非法 id → 400). The
// AUTHORITATIVE source is ai-worker's registry (`hasTemplate`), injected into the
// service at composition time (persistence-client) so backend does NOT take a new
// dependency on ai-worker. This inline set is the FALLBACK used when no validator is
// injected (unit/contract tests run without the ai-worker wiring) — kept in sync with
// registry.ts:56 BUILTIN_TEMPLATES so the two agree on the legal id space.
const REGISTERED_SKILL_IDS: ReadonlySet<string> = new Set([
  "topic.generate",
  "script.draft",
  "planning.thesis",
  // [T-271] 制作封面链的结构化封面方案 skill(cover.brief)。
  "cover.brief",
  "planning.contract",
  "planning.outline",
  "platform.adapt",
  "review.insights",
  "calibration.diagnose",
  "calibration.score",
  "research.gather",
  "reconstruct.project",
  "positioning.generate",
  "topic.enrich",
  "material.match",
  "chatbox.topic",
  "chatbox.calibration",
  "chatbox.positioning",
  "chatbox.review",
]);

// SettingsService (foundation §5.3) — RequestContext-taking methods. Settings has
// NO §12 business state machine (plan §11: preferences/model/agent are mutable
// singletons/upserts, not lifecycle entities); the service is validation
// (delegated to the contract Zod on the transport edge) + repo orchestration +
// the AI-consumed read (resolveModelForCapability).
//
// The account read (`getAccount` → settings.get) is NOT owned by Settings —
// Settings does not own the `users` table. It is injected as an `accountReader`
// function (the Identity service's `getCurrentUser`, threaded at composition
// time) so there is NO cross-module repository import (foundation §1; modules
// import each other only via index.ts). The repo is supplied via a per-ctx
// factory (mirrors notifications/search), keeping the service db-agnostic.

// The AI-consumed model resolution (foundation §3; the worker's ClaudeAgentRunner
// reads it). Deterministic hard default per foundation §3.
export interface ResolvedModel {
  provider: string;
  modelName: string;
}

const HARD_DEFAULT_MODEL: ResolvedModel = {
  provider: "anthropic",
  modelName: "claude-opus-4-8",
};

// The AI-consumed model config (resolve.ts reads this) — carries the RAW secret
// (secretValue) so resolve can authenticate. Server-only; NEVER serialized to the
// client. The public DTO (toModelResource) masks the secret to `hasSecret`.
// resolve prefers secretValue, else resolves secretReference via env.
export interface ModelConfigInternal {
  provider: string;
  modelName: string;
  baseUrl: string | null;
  apiFormat: "anthropic" | "openai_chat";
  secretReference: string;
  secretValue: string | null;
  settings: Record<string, unknown>;
}

// ── [T-363] 模型配置导出/导入(设置页兜底:重置/换机后一键找回)────────────────────
//
// 导出:secret_value 保持库中**存储形态**(enc:v1: 密文优先;仅无 master key 的存量明文
// 行才是明文)——导出动作本身不解密、不落明文盘。secretForm 如实标注文件里密钥的形态,
// UI 据此警示「文件含密钥,注意保管」。
// 导入:走**既有 service 写路径** setModelConfiguration(按 (user_id, capability) upsert
// 覆盖);enc 密文先经 repo.unwrapExportedSecret 解包(解不开 = 跨机器/换 key → 该行配置
// 照导、密钥诚实标 unrecoverable 提示重填,绝不塞进库里假装可用)。
export interface ModelConfigExportRow {
  capability: string;
  provider: string;
  modelName: string;
  secretReference: string;
  /** 库中存储形态(enc:v1: 密文 / 存量明文 / null=未配 key)。 */
  secretValue: string | null;
  settings: Record<string, unknown>;
  baseUrl: string | null;
  apiFormat: string;
  isDefault: boolean;
}

export interface ModelConfigExportFile {
  kind: "creatoros.model-config-export";
  version: 1;
  exportedAt: string;
  /** 文件内密钥形态:encrypted=全密文;plaintext=含明文;mixed=两者都有;none=无密钥。 */
  secretForm: "encrypted" | "plaintext" | "mixed" | "none";
  models: ModelConfigExportRow[];
}

export type ModelConfigImportSecretOutcome =
  | "imported" // 密钥解包成功并随配置写入
  | "kept-existing" // 文件行无密钥 → putModel 语义保留库中已存密钥
  | "unrecoverable"; // 密文解不开(跨机器/换 key)→ 配置照导,密钥请重填

export interface ModelConfigImportRowResult {
  capability: string;
  ok: boolean;
  secret: ModelConfigImportSecretOutcome | null; // ok=false 时为 null
  message?: string;
}

export interface ModelConfigImportReport {
  total: number;
  imported: number;
  failed: number;
  rows: ModelConfigImportRowResult[];
}

/** 导入文件校验失败(结构/版本不对)→ 400。 */
export class ModelConfigImportError extends Error {
  readonly code = "ValidationError";
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigImportError";
  }
}

/** Reads the authenticated user's account row (Identity's getCurrentUser). */
export type AccountReader = (ctx: RequestContext) => Promise<UserResource>;

/**
 * The editable account-profile fields (`PATCH /me`). Every key optional — only
 * the provided keys are written. Settings does NOT own `users`, so the write is
 * injected (Identity's updateProfile), mirroring the read-side `accountReader`.
 */
export interface AccountProfilePatch {
  displayName?: string;
  locale?: string;
}

/** Writes the authenticated user's profile (Identity's updateProfile). */
export type AccountWriter = (
  ctx: RequestContext,
  patch: AccountProfilePatch,
) => Promise<UserResource>;

export interface SettingsService {
  getAccount(ctx: RequestContext): Promise<UserResource>;
  updateAccount(
    ctx: RequestContext,
    patch: AccountProfilePatch,
  ): Promise<UserResource>;
  updatePreferences(
    ctx: RequestContext,
    patch: PreferencePatch,
  ): Promise<UserPreferenceResource>;
  // [T-051 2e] 偏好读(设置页初值);无行时返回默认值(与 patch 的 upsert 默认一致)。
  getPreferences(ctx: RequestContext): Promise<UserPreferenceResource>;
  setModelConfiguration(
    ctx: RequestContext,
    capability: string,
    body: ModelPutBody,
  ): Promise<ModelConfigurationResource>;
  resolveModelForCapability(
    ctx: RequestContext,
    capability: string,
  ): Promise<ResolvedModel>;
  getModelConfig(
    ctx: RequestContext,
    capability: string,
  ): Promise<ModelConfigInternal | null>;
  listModelConfigs(
    ctx: RequestContext,
  ): Promise<ModelConfigurationResource[]>;
  // [T-363] 模型配置导出/导入(见上方类型注释;导入走 setModelConfiguration 既有写路径)。
  exportModelConfigs(ctx: RequestContext): Promise<ModelConfigExportFile>;
  importModelConfigs(
    ctx: RequestContext,
    file: unknown,
  ): Promise<ModelConfigImportReport>;
  createAgentConfiguration(
    ctx: RequestContext,
    input: AgentCreateInput,
  ): Promise<AgentConfigurationResource>;
  // T-040c 提示词/skill 服务端可配 —— list全表 / get单个 / put upsert (SPEC §4.4).
  // 全局配置 (非 user-scoped): 提示词是产品级系统配置. put 校验 id ∈ 已注册 18 个模板
  // (非法 → PromptValidationError → 400). get 未命中 → OwnershipError → 404. 热更接线
  // (put 成功后重套 override 进常驻 REGISTRY) 在 persistence-client 装配处做, 不在 service.
  listSkillConfigOverrides(
    ctx: RequestContext,
  ): Promise<SkillConfigOverrideResource[]>;
  getSkillConfigOverride(
    ctx: RequestContext,
    id: string,
  ): Promise<SkillConfigOverrideResource>;
  putSkillConfigOverride(
    ctx: RequestContext,
    body: SkillConfigOverridePutBody,
  ): Promise<SkillConfigOverrideResource>;
  // [T-165] 版本历史 + 一键回滚。list = 某 skill 历史快照(最新在前);rollback = 取某历史
  // 版本重新生效(热更接线同 put,在 persistence-client 装配处)。
  listSkillConfigOverrideVersions(
    ctx: RequestContext,
    id: string,
  ): Promise<SkillConfigOverrideVersionResource[]>;
  rollbackSkillConfigOverride(
    ctx: RequestContext,
    id: string,
    versionId: string,
  ): Promise<SkillConfigOverrideResource>;
  // item B — read the resolved storage config + real usage.
  getStorage(ctx: RequestContext): Promise<StorageConfigResource>;
  // item B — update the backend choice / media root (validated: an illegal /
  // non-writable path throws StorageValidationError, never silently accepted).
  updateStorage(
    ctx: RequestContext,
    patch: StorageConfigPatch,
  ): Promise<StorageConfigResource>;
  // item B — resolve the absolute media root for the ctx user (the per-ctx
  // storage-adapter factory + the blob route both call this so uploads land at
  // and are served from the same on-disk location). Settings only computes the
  // path string — it never touches the storage port itself (SPEC §15).
  resolveStorageRoot(ctx: RequestContext): Promise<string>;
  // item B — the resolved backend ('local' | 's3') for the ctx user (the per-ctx
  // factory uses it to choose the adapter).
  resolveStorageBackend(ctx: RequestContext): Promise<"local" | "s3">;
}

// USER_PREFERENCE is keyed by user_id (no own id column), but the DTO requires an
// `id`. Synthesize a stable, deterministic id from the user id (plan §31).
function toPreferenceResource(
  ctx: RequestContext,
  row: UserPreferenceRow,
): UserPreferenceResource {
  return {
    id: `pref-${ctx.userId}`,
    userId: row.userId,
    defaultHome: row.defaultHome,
    defaultCreationMode:
      row.defaultCreationMode as UserPreferenceResource["defaultCreationMode"],
    defaultVisibility:
      row.defaultVisibility as UserPreferenceResource["defaultVisibility"],
    autosaveEnabled: row.autosaveEnabled,
    fileNamingRule: row.fileNamingRule,
    analyticsEnabled: row.analyticsEnabled,
  };
}

function toModelResource(
  row: ModelConfigurationRow,
): ModelConfigurationResource {
  return {
    id: row.id,
    userId: row.userId,
    capability: row.capability,
    provider: row.provider,
    modelName: row.modelName,
    secretReference: row.secretReference,
    baseUrl: row.baseUrl ?? null,
    apiFormat: (row.apiFormat as "anthropic" | "openai_chat") ?? "anthropic",
    settings: (row.settings as Record<string, unknown>) ?? {},
    isDefault: row.isDefault,
    // Masked: a usable secret is configured (stored value OR env-ref). The raw
    // secret value is NEVER serialized — only this boolean.
    hasSecret:
      Boolean(row.secretValue && row.secretValue.length > 0) ||
      Boolean(row.secretReference && row.secretReference.length > 0),
  };
}

// Server-only projection for resolve.ts — carries the RAW secret. Never serialize.
function toModelInternal(row: ModelConfigurationRow): ModelConfigInternal {
  return {
    provider: row.provider,
    modelName: row.modelName,
    baseUrl: row.baseUrl ?? null,
    apiFormat: (row.apiFormat as "anthropic" | "openai_chat") ?? "anthropic",
    secretReference: row.secretReference,
    secretValue: row.secretValue ?? null,
    settings: (row.settings as Record<string, unknown>) ?? {},
  };
}

function toAgentResource(
  row: AgentConfigurationRow,
): AgentConfigurationResource {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    agentType: row.agentType,
    status: row.status,
    capabilities: (row.capabilities as Record<string, unknown>) ?? {},
    settings: (row.settings as Record<string, unknown>) ?? {},
    secretReference: row.secretReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// T-040c — DB row → SkillConfigOverride DTO. jsonb columns come back as unknown;
// narrow tools/requiredFacets to string[] (non-string items dropped) and
// outputSchema to an object (else null). Every override field is nullable = 未配.
function toSkillConfigOverrideResource(
  row: SkillConfigOverrideRow,
): SkillConfigOverrideResource {
  const toStringArray = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    return v.filter((x): x is string => typeof x === "string");
  };
  const toObject = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  return {
    id: row.id,
    version: row.version ?? null,
    system: row.system ?? null,
    template: row.template ?? null,
    tools: toStringArray(row.tools),
    requiredFacets: toStringArray(row.requiredFacets),
    outputSchema: toObject(row.outputSchema),
    updatedBy: row.updatedBy ?? null,
    updatedAt: row.updatedAt,
  };
}

// [T-165] 版本快照行 → DTO(同款 jsonb 归一)。
function toSkillConfigOverrideVersionResource(
  row: SkillConfigOverrideVersionRow,
): SkillConfigOverrideVersionResource {
  const toStringArray = (v: unknown): string[] | null =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : null;
  const toObject = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  return {
    id: row.id,
    overrideId: row.overrideId,
    version: row.version ?? null,
    system: row.system ?? null,
    template: row.template ?? null,
    tools: toStringArray(row.tools),
    requiredFacets: toStringArray(row.requiredFacets),
    outputSchema: toObject(row.outputSchema),
    updatedBy: row.updatedBy ?? null,
    createdAt: row.createdAt,
  };
}

export function createSettingsService(
  repoForCtx: (ctx: RequestContext) => SettingsRepository,
  accountReader: AccountReader,
  accountWriter: AccountWriter,
  // T-040c — skill id validator for putPrompt. The AUTHORITATIVE source is
  // ai-worker's registry (hasTemplate), injected here at composition time so backend
  // takes no dependency on ai-worker. When absent (unit/contract tests), fall back to
  // the inline REGISTERED_SKILL_IDS set (kept in sync with BUILTIN_TEMPLATES).
  isValidSkillId?: (id: string) => boolean,
  // [T-196] 存储目录迁移函数可注入(默认真实现)。单测传 no-op stub → 不碰真实文件系统
  //   (原来直接 import 的 migrateStorageRoot 在测试里会对真机 ~/CreatorOS/media 做 copy/delete,
  //   曾把用户真实封面从 media 搬去 custom+删 media,并是那条 flaky 测试的根源)。
  migrate: typeof migrateStorageRoot = migrateStorageRoot,
): SettingsService {
  const skillIdValid = isValidSkillId ?? ((id: string) => REGISTERED_SKILL_IDS.has(id));
  // [T-363] 具名对象(而非直接 return 字面量):importModelConfigs 复用 service 自身的
  // setModelConfiguration 既有写路径(upsert on (user_id, capability))。
  const service: SettingsService = {
    async getAccount(ctx) {
      // Delegated to Identity (injected). Settings does not own `users`.
      return accountReader(ctx);
    },

    async updateAccount(ctx, patch) {
      // Delegated to Identity (injected) — the same boundary as the read.
      // Settings owns NO `users` repo; the profile write lives in Identity.
      return accountWriter(ctx, patch);
    },

    async updatePreferences(ctx, patch) {
      const row = await repoForCtx(ctx).patchPreferences(ctx, patch);
      return toPreferenceResource(ctx, row);
    },

    async getPreferences(ctx) {
      const row = await repoForCtx(ctx).getPreferences(ctx);
      if (row) return toPreferenceResource(ctx, row);
      // 用户还没改过任何偏好 → 返回默认值(不落库;首次 patch 才 upsert)。
      return {
        id: `pref-${ctx.userId}`,
        userId: ctx.userId,
        defaultHome: "dashboard",
        defaultCreationMode: "guided",
        defaultVisibility: "private",
        autosaveEnabled: true,
        fileNamingRule: "{date}-{title}",
        analyticsEnabled: false, // 默认关(PROTECTION.md §4 遥测零收集)
      };
    },

    async setModelConfiguration(ctx, capability, body) {
      const row = await repoForCtx(ctx).putModel(ctx, capability, body);
      return toModelResource(row);
    },

    async resolveModelForCapability(ctx, capability) {
      const repo = repoForCtx(ctx);
      // 1) exact capability match.
      const exact = await repo.getModel(ctx, capability);
      if (exact) return { provider: exact.provider, modelName: exact.modelName };
      // 2) the user's `isDefault` row (any capability).
      const all = await repo.listModels(ctx);
      const fallback = all.find((m) => m.isDefault);
      if (fallback) {
        return { provider: fallback.provider, modelName: fallback.modelName };
      }
      // 3) deterministic hard default (foundation §3).
      return { ...HARD_DEFAULT_MODEL };
    },

    async getModelConfig(ctx, capability) {
      const row = await repoForCtx(ctx).getModel(ctx, capability);
      return row ? toModelInternal(row) : null;
    },

    async listModelConfigs(ctx) {
      const rows = await repoForCtx(ctx).listModels(ctx);
      return rows.map(toModelResource);
    },

    // [T-363] 导出:原始读(不解密),密钥保持库中存储形态;secretForm 如实标注。
    async exportModelConfigs(ctx) {
      const rows = await repoForCtx(ctx).listModelsRaw(ctx);
      const models: ModelConfigExportRow[] = rows.map((row) => ({
        capability: row.capability,
        provider: row.provider,
        modelName: row.modelName,
        secretReference: row.secretReference,
        secretValue: row.secretValue ?? null,
        settings: (row.settings as Record<string, unknown>) ?? {},
        baseUrl: row.baseUrl ?? null,
        apiFormat: (row.apiFormat as string) ?? "anthropic",
        isDefault: row.isDefault,
      }));
      const secrets = models
        .map((m) => m.secretValue)
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      const encCount = secrets.filter((v) => v.startsWith("enc:v1:")).length;
      const secretForm: ModelConfigExportFile["secretForm"] =
        secrets.length === 0
          ? "none"
          : encCount === secrets.length
            ? "encrypted"
            : encCount === 0
              ? "plaintext"
              : "mixed";
      return {
        kind: "creatoros.model-config-export",
        version: 1,
        exportedAt: new Date().toISOString(),
        secretForm,
        models,
      };
    },

    // [T-363] 导入:结构校验 → 逐行走 setModelConfiguration 既有写路径(capability 冲突
    // 即覆盖);密钥先解包,解不开 → 配置照导 + 该行诚实标 unrecoverable(提示重填)。
    async importModelConfigs(ctx, file) {
      const parsed = parseModelConfigExportFile(file);
      const repo = repoForCtx(ctx);
      const rows: ModelConfigImportRowResult[] = [];
      for (const m of parsed.models) {
        try {
          let secret: string | undefined;
          let secretOutcome: ModelConfigImportSecretOutcome = "kept-existing";
          if (typeof m.secretValue === "string" && m.secretValue.length > 0) {
            const plain = repo.unwrapExportedSecret(m.secretValue);
            if (plain === null) {
              secretOutcome = "unrecoverable";
            } else {
              secret = plain;
              secretOutcome = "imported";
            }
          }
          await service.setModelConfiguration(ctx, m.capability, {
            provider: m.provider,
            modelName: m.modelName,
            secretReference: m.secretReference,
            secret, // undefined = 保留库中已存密钥(putModel 既有语义)
            baseUrl: m.baseUrl ?? undefined,
            apiFormat:
              m.apiFormat === "openai_chat" ? "openai_chat" : "anthropic",
            settings: m.settings,
            isDefault: m.isDefault,
          });
          rows.push({
            capability: m.capability,
            ok: true,
            secret: secretOutcome,
            ...(secretOutcome === "unrecoverable"
              ? {
                  message:
                    "密钥无法解密(可能来自另一台机器或密钥已更换),配置已导入,请重新填写密钥",
                }
              : {}),
          });
        } catch (err) {
          rows.push({
            capability: m.capability,
            ok: false,
            secret: null,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return {
        total: rows.length,
        imported: rows.filter((r) => r.ok).length,
        failed: rows.filter((r) => !r.ok).length,
        rows,
      };
    },

    async createAgentConfiguration(ctx, input) {
      const row = await repoForCtx(ctx).createAgent(ctx, input);
      return toAgentResource(row);
    },

    async listSkillConfigOverrides(ctx) {
      const rows = await repoForCtx(ctx).listSkillConfigOverrides();
      return rows.map(toSkillConfigOverrideResource);
    },

    async getSkillConfigOverride(ctx, id) {
      const row = await repoForCtx(ctx).getSkillConfigOverride(id);
      // Not-configured → 404 (OwnershipError maps to 404; there is no separate
      // NotFound class here, and a missing override is honestly "no such row").
      if (!row) {
        throw new OwnershipError(`skill config override 未配置: ${id}`);
      }
      return toSkillConfigOverrideResource(row);
    },

    async putSkillConfigOverride(ctx, body) {
      // Validate the target id BEFORE writing: an id outside the 18 registered
      // templates is a bad request (→400), NOT silently persisted (SPEC §4.4). The
      // validator is the injected ai-worker registry (authoritative) or the inline
      // fallback set.
      if (!skillIdValid(body.id)) {
        throw new PromptValidationError(
          `未知 skill id "${body.id}" — 只能覆盖已注册的 18 个模板之一`,
        );
      }
      const row = await repoForCtx(ctx).putSkillConfigOverride(ctx, body);
      return toSkillConfigOverrideResource(row);
    },

    async listSkillConfigOverrideVersions(ctx, id) {
      const rows =
        await repoForCtx(ctx).listSkillConfigOverrideVersions(id);
      return rows.map(toSkillConfigOverrideVersionResource);
    },

    async rollbackSkillConfigOverride(ctx, id, versionId) {
      // 同 put 的 id 合法性门(回滚只针对已注册 skill 的历史)。
      if (!skillIdValid(id)) {
        throw new PromptValidationError(
          `未知 skill id "${id}" — 只能回滚已注册的 18 个模板之一`,
        );
      }
      // 错版 id / 不属于该 skill → repo 抛错;这里让它冒泡(400/500 由 dispatch 映射)。
      const row = await repoForCtx(ctx).rollbackSkillConfigOverride(
        ctx,
        id,
        versionId,
      );
      return toSkillConfigOverrideResource(row);
    },

    async resolveStorageRoot(ctx) {
      const row = await repoForCtx(ctx).getStorageConfig(ctx);
      return resolveRootPath(row?.rootPath);
    },

    async resolveStorageBackend(ctx) {
      const row = await repoForCtx(ctx).getStorageConfig(ctx);
      return (row?.backend as "local" | "s3") ?? "local";
    },

    async getStorage(ctx) {
      const repo = repoForCtx(ctx);
      const row = await repo.getStorageConfig(ctx);
      const usage = await repo.sumUsageByAssetType(ctx);
      return buildStorageResource(row, usage);
    },

    async updateStorage(ctx, patch) {
      // Validate the proposed rootPath (when provided) BEFORE persisting: reject
      // an illegal shape (system dir / fs root / empty) and probe writability via
      // mkdir -p. A failure throws StorageValidationError (→400), never silently
      // accepts a bad path.
      if (patch.rootPath !== undefined) {
        const resolved = resolveRootPath(patch.rootPath);
        const reason = rootPathLegalityReason(resolved);
        if (reason) throw new StorageValidationError(reason);
        try {
          await fs.mkdir(resolved, { recursive: true });
          // Probe writability with a throwaway file (removed immediately).
          const probe = `${resolved}/.creatoros-write-probe`;
          await fs.writeFile(probe, "");
          await fs.rm(probe, { force: true });
        } catch {
          throw new StorageValidationError(
            `media root is not writable: ${resolved}`,
          );
        }
      }
      const repo = repoForCtx(ctx);

      // [T-162] 改存储目录 → 内置文件迁移(旧 → 新),防历史 blob 404。
      //   copy-verify-swap-delete:先拷旧树到新 + 校验(migrateStorageRoot,抛错即不 persist,
      //   旧目录原封、系统仍可读旧 blob)→ persist 新 rootPath → best-effort 删旧目录。
      //   仅 local backend 迁移(S3↔S3 跨桶 out-of-scope);同路径/空旧目录自动 skip。
      //   storageKey 相对 root → DB 不改,只搬物理文件。
      let oldRootToPrune: string | null = null;
      if (patch.rootPath !== undefined) {
        const current = await repo.getStorageConfig(ctx);
        const effectiveBackend = patch.backend ?? current?.backend ?? "local";
        if (effectiveBackend === "local") {
          const oldResolved = resolveRootPath(current?.rootPath);
          const newResolved = resolveRootPath(patch.rootPath);
          const migration = await migrate(oldResolved, newResolved);
          if (!migration.skipped) {
            // 拷贝 + 校验已通过 → persist 后再删旧目录(删失败只留孤儿,不裂功能)。
            oldRootToPrune = oldResolved;
          }
        }
      }

      const row = await repo.putStorageConfig(ctx, patch);

      if (oldRootToPrune) {
        void fs.rm(oldRootToPrune, { recursive: true, force: true }).catch(() => {
          // best-effort:旧目录删不掉只留孤儿文件,不影响新目录读写。
        });
      }

      const usage = await repo.sumUsageByAssetType(ctx);
      return buildStorageResource(row, usage);
    },
  };
  return service;
}

// [T-363] 导入文件的结构校验(宽容:多余字段忽略;缺必填/形状不对 → ModelConfigImportError
// → 400,绝不半吞)。settings/baseUrl 等可缺省;capability/provider/modelName 必须非空串。
function parseModelConfigExportFile(file: unknown): {
  models: ModelConfigExportRow[];
} {
  if (typeof file !== "object" || file === null) {
    throw new ModelConfigImportError("导入内容不是 JSON 对象");
  }
  const o = file as Record<string, unknown>;
  if (o.kind !== "creatoros.model-config-export") {
    throw new ModelConfigImportError(
      "不是 CreatorOS 模型配置导出文件(kind 不匹配)",
    );
  }
  if (o.version !== 1) {
    throw new ModelConfigImportError(`不支持的导出文件版本:${String(o.version)}`);
  }
  if (!Array.isArray(o.models)) {
    throw new ModelConfigImportError("导出文件缺少 models 数组");
  }
  const models: ModelConfigExportRow[] = [];
  for (const [i, raw] of o.models.entries()) {
    if (typeof raw !== "object" || raw === null) {
      throw new ModelConfigImportError(`models[${i}] 不是对象`);
    }
    const r = raw as Record<string, unknown>;
    const str = (k: string): string | null =>
      typeof r[k] === "string" && (r[k] as string).trim().length > 0
        ? (r[k] as string).trim()
        : null;
    const capability = str("capability");
    const provider = str("provider");
    const modelName = str("modelName");
    if (!capability || !provider || !modelName) {
      throw new ModelConfigImportError(
        `models[${i}] 缺必填字段(capability/provider/modelName)`,
      );
    }
    models.push({
      capability,
      provider,
      modelName,
      secretReference: typeof r.secretReference === "string" ? r.secretReference : "",
      secretValue: typeof r.secretValue === "string" ? r.secretValue : null,
      settings:
        typeof r.settings === "object" && r.settings !== null && !Array.isArray(r.settings)
          ? (r.settings as Record<string, unknown>)
          : {},
      baseUrl: typeof r.baseUrl === "string" && r.baseUrl.length > 0 ? r.baseUrl : null,
      apiFormat: typeof r.apiFormat === "string" ? r.apiFormat : "anthropic",
      isDefault: r.isDefault === true,
    });
  }
  return { models };
}

// Asset types surfaced in the StorageUsageCard breakdown (stable order). The
// usage query only returns types with files; the resource fills missing ones with
// 0 so the card always shows the same rows.
const STORAGE_BREAKDOWN_TYPES = [
  "video",
  "image",
  "audio",
  "document",
  "subtitle",
] as const;

// Build the storage DTO from the (possibly absent) config row + the real usage
// rows. `totalBytes` is the capacity of the disk that holds the resolved root
// (fs.statfs); 0 when it can't be read. `usedBytes` is the SUM across types.
async function buildStorageResource(
  row: StorageConfigRow | null,
  usage: { assetType: string; bytes: number }[],
): Promise<StorageConfigResource> {
  const rootPath = resolveRootPath(row?.rootPath);
  const backend = (row?.backend as "local" | "s3") ?? "local";
  const byType = new Map(usage.map((u) => [u.assetType, u.bytes]));
  const breakdown = STORAGE_BREAKDOWN_TYPES.map((assetType) => ({
    assetType,
    bytes: byType.get(assetType) ?? 0,
  }));
  const usedBytes = breakdown.reduce((sum, b) => sum + b.bytes, 0);
  let totalBytes = 0;
  try {
    const stat = await fs.statfs(rootPath);
    totalBytes = Number(stat.blocks) * Number(stat.bsize);
  } catch {
    // Disk capacity unavailable (path missing on a fresh install / platform
    // without statfs) → 0; the card shows used without a hard cap.
    totalBytes = 0;
  }
  return { backend, rootPath, usedBytes, totalBytes, breakdown };
}
