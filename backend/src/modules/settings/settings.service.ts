import * as fs from "node:fs/promises";
import {isDeepStrictEqual} from 'node:util';
import {ConflictError} from '../execution/execution.errors';
import {ENDPOINTS,ErrorCode,modelRoutingPutSchema,modelRoutingResourceSchema,type ModelRoutingPut,type ModelRoutingResource} from '@creatoros/contract';
import type { RequestContext } from "@creatoros/backend";
import type {
  SettingsRepository,
  UserPreferenceRow,
  ModelConfigurationRow,
  AgentConfigurationRow,
  StorageConfigRow,
  AccountSkillOverlayRow,
  AccountSkillOverlayVersionRow,
  PreferencePatch,
  ModelPutBody,
  AgentCreateInput,
  StorageConfigPatch,
  AccountSkillOverlay,
} from "./settings.repository";
// [T-453] 认识 decRow 的解密失败 sentinel(值,不是 type),用于 toModelResource 打
//   `secretDecryptFailed` 标记 —— 让 UI 能区分「未配」vs「曾配但失效需重填」。
import { SECRET_DECRYPT_FAIL_SENTINEL } from "./settings.repository";
import type {
  UserResource,
  UserPreferenceResource,
  ModelConfigurationResource,
  AgentConfigurationResource,
  StorageConfigResource,
  AccountSkillOverlayResource,
  AccountSkillOverlayVersionResource,
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
  "script.storyboard.segment",
  "script.voiceover.compose",
  // [T-271] 制作封面链的结构化封面方案 skill(cover.brief)。
  "cover.brief",
  "planning.contract",
  "planning.outline",
  "platform.adapt",
  "review.insights",
  "calibration.diagnose",
  "calibration.score",
  "research.gather",
  "research.plan",
  "method.research",
  "method.positioning",
  "method.topic",
  "method.planning",
  "method.writing",
  "method.visual",
  "method.publishing",
  "method.review",
  "method.knowledge",
  "method.guide",
  "method.report",

  "reconstruct.project",
  "positioning.generate",
  "topic.enrich",
  "material.match",
  "chatbox.topic",
  "chatbox.calibration",
  "chatbox.positioning",
  "chatbox.review",
  "intelligence.topic-decompose",
  "intelligence.topic-from-decomposition",
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

type CompletionPolicyV1 = NonNullable<
  AccountSkillOverlayResource["official"]["completionPolicy"]
>;
export type AccountSkillOverlayPatch = NonNullable<
  AccountSkillOverlayResource["overlay"]
>;
type EditableField = AccountSkillOverlayResource["editableFields"][number];

export interface OfficialSkillBase {
  skillId: string;
  baseVersion: string;
  system: string;
  template: string;
  tools: string[];
  requiredFacets: string[];
  availableFacets: string[];
  outputSchema: Record<string, unknown> | null;
  completionPolicy: CompletionPolicyV1 | null;
  completionPolicyAdapter: { id: string; version: string } | null;
  editableFields: EditableField[];
  supportsCompletionPolicySchema?: (
    schema: Record<string, unknown> | null,
  ) => boolean;
}

export interface OfficialSkillProvider {
  get(skillId: string): OfficialSkillBase | null;
  list(): OfficialSkillBase[];
}

export interface AccountSkillOverlayPutInput {
  skillId: string;
  expectedRevision: number | null;
  patch: AccountSkillOverlayPatch;
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
  apiFormat: "anthropic" | "openai_chat" | "openai_responses";
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

export interface ChannelModelCredentialStatus {
  serviceId: string;
  hasSecret: boolean;
  updatedAt: string | null;
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
  getModelRouting(ctx:RequestContext):Promise<ModelRoutingResource>;
  putModelRouting(ctx:RequestContext,input:ModelRoutingPut):Promise<ModelRoutingResource>;
  patchPreferencesIfUnchanged(ctx:RequestContext,patch:PreferencePatch,expected:Partial<Omit<PreferencePatch,"assistantExecutionEngine"> & {assistantExecutionEngine:"pi"|"codex"|null}>):Promise<UserPreferenceResource>;
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
  getChannelModelCredential(
    ctx: RequestContext,
    scopeId: string,
    serviceId: string,
  ): Promise<string | null>;
  listChannelModelCredentials(
    ctx: RequestContext,
    scopeId: string,
  ): Promise<ChannelModelCredentialStatus[]>;
  setChannelModelCredential(
    ctx: RequestContext,
    scopeId: string,
    serviceId: string,
    secret: string,
  ): Promise<ChannelModelCredentialStatus>;
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
  ): Promise<AccountSkillOverlayResource[]>;
  getSkillConfigOverride(
    ctx: RequestContext,
    id: string,
  ): Promise<AccountSkillOverlayResource>;
  putSkillConfigOverride(
    ctx: RequestContext,
    body: AccountSkillOverlayPutInput,
  ): Promise<AccountSkillOverlayResource>;
  // [T-165] 版本历史 + 一键回滚。list = 某 skill 历史快照(最新在前);rollback = 取某历史
  // 版本重新生效(热更接线同 put,在 persistence-client 装配处)。
  listSkillConfigOverrideVersions(
    ctx: RequestContext,
    id: string,
  ): Promise<AccountSkillOverlayVersionResource[]>;
  rollbackSkillConfigOverride(
    ctx: RequestContext,
    id: string,
    versionId: string,
    expectedRevision: number,
  ): Promise<AccountSkillOverlayResource>;
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
    assistantExecutionEngine: row.assistantExecutionEngine === "codex" ? "codex" : row.assistantExecutionEngine === "pi" ? "pi" : null,
  };
}
function defaultPreferenceResource(ctx:RequestContext):UserPreferenceResource{return {id:`pref-${ctx.userId}`,userId:ctx.userId,defaultHome:'dashboard',defaultCreationMode:'guided',defaultVisibility:'private',autosaveEnabled:true,fileNamingRule:'{date}-{title}',analyticsEnabled:false,assistantExecutionEngine:null};}
export type PreferencesWritePort=<T>(ctx:RequestContext,write:(repo:Pick<SettingsRepository,'getPreferences'|'patchPreferences'|'setModelRouting'>)=>Promise<T>)=>Promise<T>;
export type ModelRoutingProjectionReader=(ctx:RequestContext,value:Pick<ModelRoutingResource,'choices'|'legacyExecutionEngine'>)=>Promise<Pick<ModelRoutingResource,'effectiveChoices'|'capabilities'>>;
export class ModelRoutingConflictError extends ConflictError {
  readonly details:{domainCode:'MODEL_ROUTING_CONFLICT';latestRevision:number};
  constructor(latestRevision:number){super('模型来源已在其它窗口修改，请刷新后再保存');this.details={domainCode:'MODEL_ROUTING_CONFLICT',latestRevision};}
}
export class ModelRoutingValidationError extends Error {
  readonly code=ErrorCode.ValidationError;
  readonly details={domainCode:'MODEL_ROUTE_UNSUPPORTED'} as const;
  constructor(){super('模型来源或版本不受支持，请按用途选择有效来源');}
}

function toModelResource(
  row: ModelConfigurationRow,
): ModelConfigurationResource {
  // [T-453] decRow 把解密失败的 secret_value 标记为 sentinel;这里透给 UI。
  const decryptFailed = row.secretValue === SECRET_DECRYPT_FAIL_SENTINEL;
  return {
    id: row.id,
    userId: row.userId,
    capability: row.capability,
    provider: row.provider,
    modelName: row.modelName,
    secretReference: row.secretReference,
    baseUrl: row.baseUrl ?? null,
    apiFormat:
      (row.apiFormat as
        | "anthropic"
        | "openai_chat"
        | "openai_responses") ?? "anthropic",
    settings: (row.settings as Record<string, unknown>) ?? {},
    isDefault: row.isDefault,
    // Masked: a usable secret is configured (stored value OR env-ref). The raw
    // secret value is NEVER serialized — only this boolean.
    // [T-453] sentinel 视为「没有可用 secret」——保住 hasSecret 语义(能不能真用),
    //   `secretDecryptFailed` 单独透出以让 UI 区分「未配」vs「曾配但失效」。
    hasSecret: decryptFailed
      ? Boolean(row.secretReference && row.secretReference.length > 0)
      : Boolean(row.secretValue && row.secretValue.length > 0) ||
        Boolean(row.secretReference && row.secretReference.length > 0),
    secretDecryptFailed: decryptFailed ? true : undefined,
  };
}

// Server-only projection for resolve.ts — carries the RAW secret. Never serialize.
function toModelInternal(row: ModelConfigurationRow): ModelConfigInternal {
  return {
    provider: row.provider,
    modelName: row.modelName,
    baseUrl: row.baseUrl ?? null,
    apiFormat:
      (row.apiFormat as
        | "anthropic"
        | "openai_chat"
        | "openai_responses") ?? "anthropic",
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

function normalizeOverlay(value: unknown): AccountSkillOverlayPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as AccountSkillOverlayPatch) };
}

function mergeOverlay(
  current: AccountSkillOverlayPatch,
  patch: AccountSkillOverlayPatch,
): AccountSkillOverlayPatch {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as AccountSkillOverlayPatch;
}

function placeholdersOf(template: string): string[] {
  return [...template.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)].map(
    (match) => match[1]!,
  );
}

function compatibilityErrors(
  base: OfficialSkillBase,
  overlay: AccountSkillOverlayPatch,
): AccountSkillOverlayResource["compatibilityErrors"] {
  const errors: AccountSkillOverlayResource["compatibilityErrors"] = [];
  const editable = new Set(base.editableFields);
  for (const key of Object.keys(overlay) as EditableField[]) {
    if (!editable.has(key)) {
      errors.push({
        code: "FIELD_NOT_EDITABLE",
        path: key,
        message: `当前官方 Skill 不允许覆盖 ${key}`,
      });
    }
  }
  if (overlay.tools) {
    const officialTools = new Set(base.tools);
    for (const tool of overlay.tools) {
      if (!officialTools.has(tool)) {
        errors.push({
          code: "TOOL_REMOVED",
          path: "tools",
          message: `工具 ${tool} 不在官方白名单`,
        });
      }
    }
  }
  const available = new Set(base.availableFacets);
  const facets = [
    ...(overlay.requiredFacets ?? []),
    ...placeholdersOf(overlay.template ?? base.template),
  ];
  for (const facet of new Set(facets)) {
    if (!available.has(facet)) {
      errors.push({
        code: "REQUIRED_FACET_INVALID",
        path: "requiredFacets",
        message: `上下文字段 ${facet} 没有官方 reader`,
      });
    }
  }
  const policy = overlay.completionPolicy ?? base.completionPolicy;
  const schema = overlay.outputSchema ?? base.outputSchema;
  if (
    policy &&
    (!base.completionPolicyAdapter ||
      !base.supportsCompletionPolicySchema?.(schema))
  ) {
    errors.push({
      code: "COMPLETION_POLICY_UNSUPPORTED",
      path: "completionPolicy",
      message: "当前 Skill/schema 无法提取完整性校验段落",
    });
  }
  return errors;
}

function editableValues(
  base: OfficialSkillBase,
  overlay: AccountSkillOverlayPatch,
): AccountSkillOverlayResource["effective"] {
  return {
    system: overlay.system ?? base.system,
    template: overlay.template ?? base.template,
    tools: overlay.tools ?? base.tools,
    requiredFacets: overlay.requiredFacets ?? base.requiredFacets,
    outputSchema: overlay.outputSchema ?? base.outputSchema,
    completionPolicy: overlay.completionPolicy ?? base.completionPolicy,
  };
}

function overlayView(
  ctx: RequestContext,
  base: OfficialSkillBase,
  row: AccountSkillOverlayRow | null,
): AccountSkillOverlayResource {
  const overlay = row ? normalizeOverlay(row.overlay) : {};
  const errors = compatibilityErrors(base, overlay);
  return {
    skillId: base.skillId,
    accountId:ctx.groupId?null:row?.accountId ?? ctx.accountId ?? null,groupId:row?.groupId??ctx.groupId??null,
    baseVersion: base.baseVersion,
    editableFields: [...base.editableFields],
    completionPolicySupported: Boolean(base.completionPolicyAdapter),
    official: editableValues(base, {}),
    effective: editableValues(base, overlay),
    compatibility: errors.length === 0 ? "compatible" : "incompatible",
    compatibilityErrors: errors,
    rowRevision: row?.rowRevision ?? null,
    validatedBaseVersion: row?.observedBaseVersion ?? null,
    overlayVersion: row?.overlayVersion ?? null,
    overlay: row ? overlay : null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export function createSettingsService(
  repoForCtx: (ctx: RequestContext) => SettingsRepository,
  accountReader: AccountReader,
  accountWriter: AccountWriter,
  officialSkillsOrValidator?: OfficialSkillProvider | ((id: string) => boolean),
  // [T-196] 存储目录迁移函数可注入(默认真实现)。单测传 no-op stub → 不碰真实文件系统
  //   (原来直接 import 的 migrateStorageRoot 在测试里会对真机 ~/CreatorOS/media 做 copy/delete,
  //   曾把用户真实封面从 media 搬去 custom+删 media,并是那条 flaky 测试的根源)。
  migrate: typeof migrateStorageRoot = migrateStorageRoot,
  withPreferencesWrite?:PreferencesWritePort,
  readModelRoutingProjection?:ModelRoutingProjectionReader,
): SettingsService {
  const routingResource=async(ctx:RequestContext,row:UserPreferenceRow|null):Promise<ModelRoutingResource>=>{
    const choices=row?.modelRouting??null;
    const legacyExecutionEngine=row?.assistantExecutionEngine==='pi'||row?.assistantExecutionEngine==='codex'?row.assistantExecutionEngine:null;
    const projection=readModelRoutingProjection?await readModelRoutingProjection(ctx,{choices,legacyExecutionEngine}):{effectiveChoices:choices??{},capabilities:[]};
    return modelRoutingResourceSchema.parse({schemaVersion:1,revision:row?.modelRoutingRevision??0,choices,legacyExecutionEngine,...projection});
  };
  const fallbackBase = (id: string): OfficialSkillBase => ({
    skillId: id,
    baseVersion: "builtin",
    system: "",
    template: "",
    tools: [],
    requiredFacets: [],
    availableFacets: [],
    outputSchema: null,
    completionPolicy: null,
    completionPolicyAdapter: null,
    editableFields: [
      "system",
      "template",
      "tools",
      "requiredFacets",
      "outputSchema",
      "completionPolicy",
    ],
  });
  const legacyValidator =
    typeof officialSkillsOrValidator === "function"
      ? officialSkillsOrValidator
      : (id: string) => REGISTERED_SKILL_IDS.has(id);
  const officialSkills: OfficialSkillProvider =
    typeof officialSkillsOrValidator === "object" && officialSkillsOrValidator
      ? officialSkillsOrValidator
      : {
          get: (id) => (legacyValidator(id) ? fallbackBase(id) : null),
          list: () =>
            [...REGISTERED_SKILL_IDS].filter(legacyValidator).map(fallbackBase),
        };
  // [T-363] 具名对象(而非直接 return 字面量):importModelConfigs 复用 service 自身的
  // setModelConfiguration 既有写路径(upsert on (user_id, capability))。
  const service: SettingsService = {
    async getModelRouting(ctx){return routingResource(ctx,await repoForCtx(ctx).getPreferences(ctx));},
    async putModelRouting(ctx,raw){
      const parsed=modelRoutingPutSchema.safeParse(raw);
      if(!parsed.success)throw new ModelRoutingValidationError();
      if(!withPreferencesWrite)throw new ConflictError('偏好写锁尚未装配，请从原设置入口保存');
      const input=parsed.data;
      const row=await withPreferencesWrite(ctx,async repo=>{
        const current=await repo.getPreferences(ctx);
        if((current?.modelRoutingRevision??0)!==input.expectedRevision)throw new ModelRoutingConflictError(current?.modelRoutingRevision??0);
        const written=await repo.setModelRouting(ctx,input.choices,input.expectedRevision);
        if(!written)throw new ModelRoutingConflictError((await repo.getPreferences(ctx))?.modelRoutingRevision??0);
        return written;
      });
      return routingResource(ctx,row);
    },
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
      const {initializeAssistantExecutionEngine,...input}=ENDPOINTS.patchPreferences.body.parse(patch);
      const write=async(repo:Pick<SettingsRepository,'getPreferences'|'patchPreferences'>)=>{
        if(initializeAssistantExecutionEngine){
          const row=await repo.getPreferences(ctx);
          if(row?.assistantExecutionEngine!=null)return toPreferenceResource(ctx,row);
        }
        return toPreferenceResource(ctx,await repo.patchPreferences(ctx,input));
      };
      if(initializeAssistantExecutionEngine&&!withPreferencesWrite)throw new ConflictError('偏好写锁尚未装配');
      return withPreferencesWrite?withPreferencesWrite(ctx,write):write(repoForCtx(ctx));
    },
    async patchPreferencesIfUnchanged(ctx,patch,expected){
      if(!withPreferencesWrite)throw new ConflictError('偏好写锁尚未装配，请从原设置入口保存');
      const {initializeAssistantExecutionEngine,...input}=ENDPOINTS.patchPreferences.body.parse(patch);
      if(initializeAssistantExecutionEngine)throw new ConflictError('首次迁移须经原偏好入口');
      const keys=Object.keys(input) as (Exclude<keyof PreferencePatch,"initializeAssistantExecutionEngine">)[];
      if(!keys.length||!isDeepStrictEqual(Object.keys(expected).sort(),Object.keys(input).sort()))throw new ConflictError('偏好候选需要完整的受改字段前值');
      return withPreferencesWrite(ctx,async repo=>{
        const row=await repo.getPreferences(ctx),current=row?toPreferenceResource(ctx,row):defaultPreferenceResource(ctx);
        if(keys.some(key=>!isDeepStrictEqual(current[key],expected[key])))throw new ConflictError('偏好已改变，请重新读取并确认；现有设置未被覆盖');
        return toPreferenceResource(ctx,await repo.patchPreferences(ctx,input));
      });
    },

    async getPreferences(ctx) {
      const row = await repoForCtx(ctx).getPreferences(ctx);
      if (row) return toPreferenceResource(ctx, row);
      // 用户还没改过任何偏好 → 返回默认值(不落库;首次 patch 才 upsert)。
      return defaultPreferenceResource(ctx);
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

    async getChannelModelCredential(ctx, scopeId, serviceId) {
      return repoForCtx(ctx).getChannelModelCredential(ctx, scopeId, serviceId);
    },

    async listChannelModelCredentials(ctx, scopeId) {
      const rows = await repoForCtx(ctx).listChannelModelCredentials(ctx, scopeId);
      return rows.map((row) => ({
        serviceId: row.serviceId,
        hasSecret: true,
        updatedAt: row.updatedAt,
      }));
    },

    async setChannelModelCredential(ctx, scopeId, serviceId, secret) {
      const row = await repoForCtx(ctx).putChannelModelCredential(
        ctx,
        scopeId,
        serviceId,
        secret,
      );
      return { serviceId: row.serviceId, hasSecret: true, updatedAt: row.updatedAt };
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
              m.apiFormat === "openai_chat" ||
              m.apiFormat === "openai_responses"
                ? m.apiFormat
                : "anthropic",
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
      // Official Skills are shipped with the runtime and are not account-owned.
      // A fresh channel install may not have a selected account yet; in that
      // state there is simply no account overlay to merge. Mutating and
      // single-overlay operations remain account-scoped below.
      const rows = ctx.groupId?.trim()||ctx.accountId?.trim()
        ? await repoForCtx(ctx).listAccountSkillOverlays(ctx)
        : [];
      const bySkill = new Map(rows.map((row) => [row.skillId, row]));
      return officialSkills
        .list()
        .sort((a, b) => a.skillId.localeCompare(b.skillId))
        .map((base) => overlayView(ctx, base, bySkill.get(base.skillId) ?? null));
    },

    async getSkillConfigOverride(ctx, id) {
      const base = officialSkills.get(id);
      if (!base) throw new OwnershipError(`skill 未注册: ${id}`);
      const row = await repoForCtx(ctx).getAccountSkillOverlay(ctx, id);
      return overlayView(ctx, base, row);
    },

    async putSkillConfigOverride(ctx, body) {
      const base = officialSkills.get(body.skillId);
      if (!base) throw new OwnershipError(`skill 未注册: ${body.skillId}`);
      const repo = repoForCtx(ctx);
      const current = await repo.getAccountSkillOverlay(ctx, body.skillId);
      const next = mergeOverlay(
        current ? normalizeOverlay(current.overlay) : {},
        body.patch,
      );
      const errors = compatibilityErrors(base, next);
      if (errors.length > 0) {
        throw new PromptValidationError(
          `Skill 增量与当前官方基座不兼容: ${errors.map((e) => e.message).join("；")}`,
        );
      }
      const nextRevision =
        body.expectedRevision === null ? 1 : body.expectedRevision + 1;
      const row = await repo.putAccountSkillOverlay(ctx, {
        skillId: body.skillId,
        expectedRevision: body.expectedRevision,
        observedBaseVersion: base.baseVersion,
        overlayVersion: String(nextRevision),
        overlay: next as AccountSkillOverlay,
      });
      return overlayView(ctx, base, row);
    },

    async listSkillConfigOverrideVersions(ctx, id) {
      const base = officialSkills.get(id);
      if (!base) throw new OwnershipError(`skill 未注册: ${id}`);
      const rows = await repoForCtx(ctx).listAccountSkillOverlayVersions(ctx, id);
      return rows.map(
        (row): AccountSkillOverlayVersionResource => {
          const overlay = normalizeOverlay(row.overlay);
          const errors = compatibilityErrors(base, overlay);
          return {
            id: row.id,
            skillId: row.skillId,
            accountId: row.accountId,groupId:row.groupId,
            rowRevision: row.rowRevision,
            observedBaseVersion: row.observedBaseVersion,
            overlayVersion: row.overlayVersion,
            overlay,
            savedCompatibility: "compatible",
            currentCompatibility:
              errors.length === 0 ? "compatible" : "incompatible",
            currentCompatibilityErrors: errors,
            updatedBy: row.updatedBy,
            createdAt: row.createdAt,
          };
        },
      );
    },

    async rollbackSkillConfigOverride(ctx, id, versionId, expectedRevision) {
      const base = officialSkills.get(id);
      if (!base) throw new OwnershipError(`skill 未注册: ${id}`);
      const repo = repoForCtx(ctx);
      const versions = await repo.listAccountSkillOverlayVersions(ctx, id);
      const target = versions.find((row) => row.id === versionId);
      if (!target) throw new OwnershipError(`skill 历史版本不存在: ${versionId}`);
      const errors = compatibilityErrors(base, normalizeOverlay(target.overlay));
      if (errors.length > 0) {
        throw new PromptValidationError(
          `历史增量与当前官方基座不兼容: ${errors.map((e) => e.message).join("；")}`,
        );
      }
      const row = await repo.rollbackAccountSkillOverlay(ctx, {
        skillId: id,
        versionId,
        expectedRevision,
        observedBaseVersion: base.baseVersion,
      });
      return overlayView(ctx, base, row);
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
// → 400,绝不半吞)。capability 非空;provider/modelName 须为字符串，空串是既有继承占位。
function parseModelConfigExportFile(file: unknown): {
  models: ModelConfigExportRow[];
} {
  if (typeof file !== "object" || file === null) {
    throw new ModelConfigImportError("导入内容不是 JSON 对象");
  }
  const o = file as Record<string, unknown>;
  if (o.kind !== "creatoros.model-config-export") {
    throw new ModelConfigImportError(
      "不是受支持的模型配置导出文件(kind 不匹配)",
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
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ModelConfigImportError(`models[${i}] 不是对象`);
    }
    const r = raw as Record<string, unknown>;
    const str = (k: string): string | null =>
      typeof r[k] === "string" && (r[k] as string).trim().length > 0
        ? (r[k] as string).trim()
        : null;
    const capability = str("capability");
    const provider = typeof r.provider === "string" ? r.provider.trim() : null;
    const modelName = typeof r.modelName === "string" ? r.modelName.trim() : null;
    if (!capability || provider === null || modelName === null) {
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
