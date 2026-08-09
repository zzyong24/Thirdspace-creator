import { and, eq, sql, type Db, type RequestContext } from "@creatoros/backend";
import { ErrorCode } from "@creatoros/contract";
import { assets, assetFiles } from "@creatoros/backend";
import { decryptSecret, encryptSecret, isEncrypted } from "@creatoros/backend";
import { randomBytes } from "node:crypto";
import {
  userPreferences,
  modelConfigurations,
  channelModelCredentials,
  agentConfigurations,
  storageConfigs,
  skillConfigOverrides,
  skillConfigOverrideVersions,
  accountSkillOverlays,
  accountSkillOverlayVersions,
} from "./settings.db-schema";
import {
  CHANNEL_CREDENTIAL_SERVICE,
  CredentialVaultUnavailableError,
  createMemoryCredentialVaultForTest,
  channelCredentialRef,
  storeCredentialVerified,
  type CredentialVault,
} from "./credential-vault";

// Settings repository (foundation §5.2) — user-scoped queries ONLY. Every method
// takes a RequestContext and filters/stamps on `ctx.userId` (foundation §1/§2,
// SPEC §10/§20). There is NO unscoped db.select/update/insert — a fetch under
// ctxB can never see ctxA's row.
//
// USER_PREFERENCE is keyed by user_id (one row per user); patchPreferences is an
// upsert (insert-with-defaults-over-patch, else update-the-provided-keys).
// MODEL_CONFIGURATION upserts on the (user_id, capability) unique index, so
// putModel is idempotent. AGENT_CONFIGURATION ships a create surface only (Wave 1).

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  /** 用户自填模型 Key 的本机 AES-GCM 密钥；由桌面受保护启动通道提供。 */
  masterKey?: Buffer;
  credentialVault?: CredentialVault;
  /** 兼容既有装配名；同一密钥也用于读取旧 enc:v1 密文。 */
  legacyMasterKey?: Buffer | null;
}

export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type ModelConfigurationRow = typeof modelConfigurations.$inferSelect;
export type ChannelModelCredentialRow = typeof channelModelCredentials.$inferSelect;
export type AgentConfigurationRow = typeof agentConfigurations.$inferSelect;
export type StorageConfigRow = typeof storageConfigs.$inferSelect;
// T-040c — skill_config_overrides row (提示词/skill 服务端可配的持久层, SPEC 2026-07-02
// §4.1). Non user-scoped (提示词是产品级系统配置, SPEC §7 Open Q1 默认全局) — id 即 PK,
// so these ops are NOT ctx-filtered (unlike every other repo method here). Each column
// is nullable = 未配 → 装配期归一 undefined → `?? base` 回退内置模板.
export type SkillConfigOverrideRow = typeof skillConfigOverrides.$inferSelect;
export type SkillConfigOverrideVersionRow =
  typeof skillConfigOverrideVersions.$inferSelect;
export type AccountSkillOverlayRow = typeof accountSkillOverlays.$inferSelect;
export type AccountSkillOverlayVersionRow =
  typeof accountSkillOverlayVersions.$inferSelect;

export type AccountSkillOverlay = Record<string, unknown>;

export interface AccountSkillOverlayPutBody {
  skillId: string;
  expectedRevision: number | null;
  observedBaseVersion: string;
  overlayVersion?: string | null;
  overlay: AccountSkillOverlay;
  updatedBy?: string;
}

export class SkillOverlayRevisionConflictError extends Error {
  readonly code = ErrorCode.ConflictError;
  readonly details: {
    domainCode: "SKILL_OVERLAY_REVISION_CONFLICT";
    latestRevision: number | null;
    latestUpdatedAt: string | null;
  };
  constructor(
    readonly latestRevision: number | null,
    readonly latestUpdatedAt: string | null,
  ) {
    super("Skill 覆盖已被其他请求修改，请刷新后重试");
    this.name = "SkillOverlayRevisionConflictError";
    this.details = {
      domainCode: "SKILL_OVERLAY_REVISION_CONFLICT",
      latestRevision,
      latestUpdatedAt,
    };
  }
}

export class SkillOverlayVersionNotFoundError extends Error {
  readonly code = ErrorCode.OwnershipError;
  readonly details = { domainCode: "SKILL_VERSION_NOT_FOUND" } as const;
  constructor() {
    super("Skill 覆盖历史版本不存在");
    this.name = "SkillOverlayVersionNotFoundError";
  }
}

// item B — the editable storage-config fields (every key optional; only provided
// keys are written on the user_id-PK upsert).
export interface StorageConfigPatch {
  backend?: "local" | "s3";
  rootPath?: string;
}

// item B — one { assetType, bytes } pair from the usage aggregation (the real
// SUM(file_size) per asset_type for the ctx user).
export interface AssetTypeUsage {
  assetType: string;
  bytes: number;
}

// The contract PATCH body — every key optional; only provided keys are written.
export interface PreferencePatch {
  defaultHome?: string;
  defaultCreationMode?: "guided" | "flexible" | "freeform";
  defaultVisibility?: "private" | "unlisted" | "public";
  autosaveEnabled?: boolean;
  fileNamingRule?: string;
  analyticsEnabled?: boolean;
}

export interface ModelPutBody {
  provider: string;
  modelName: string;
  secretReference?: string;
  // Inline secret value — stored directly in the (local) db. Absent/empty = keep
  // the existing stored key (a partial update never wipes it).
  secret?: string;
  baseUrl?: string;
  apiFormat?: "anthropic" | "openai_chat" | "openai_responses";
  settings?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface AgentCreateInput {
  name: string;
  agentType: string;
}

// T-040c — the skill_config_overrides upsert body. Only `id` is required; every
// override field is optional (absent = leave that column as-is on update, NULL on a
// first insert). Text fields override system/template正文; jsonb fields carry
// string[] whitelists / a JSON Schema object. version is a plain audit marker
// (the repo bumps it deterministically on each write; see putSkillConfigOverride).
export interface SkillConfigOverridePutBody {
  id: string;
  system?: string;
  template?: string;
  tools?: readonly string[];
  requiredFacets?: readonly string[];
  outputSchema?: Record<string, unknown>;
  // Explicit version marker. Absent → the repo auto-increments (prev+1, or "1" on a
  // first write). Provided → written verbatim (an管理端 can pin a version label).
  version?: string;
  // Who performed the write (user id / "system"). Absent → ctx.userId, else "system".
  updatedBy?: string;
}

export interface SettingsRepository {
  getPreferences(ctx: RequestContext): Promise<UserPreferenceRow | null>;
  patchPreferences(
    ctx: RequestContext,
    patch: PreferencePatch,
  ): Promise<UserPreferenceRow>;
  getModel(
    ctx: RequestContext,
    capability: string,
  ): Promise<ModelConfigurationRow | null>;
  putModel(
    ctx: RequestContext,
    capability: string,
    body: ModelPutBody,
  ): Promise<ModelConfigurationRow>;
  /** @deprecated T-739 后不再重绑旧用户模型 Keychain 引用；调用恒定要求重新填写。 */
  bindExistingModelCredential(
    ctx: RequestContext,
    capability: string,
    keyringRef: string,
  ): Promise<void>;
  listModels(ctx: RequestContext): Promise<ModelConfigurationRow[]>;
  getChannelModelCredential(
    ctx: RequestContext,
    scopeId: string,
    serviceId: string,
  ): Promise<string | null>;
  putChannelModelCredential(
    ctx: RequestContext,
    scopeId: string,
    serviceId: string,
    secret: string,
    serviceType?: "user_input" | "activation_managed" | "local_selection",
  ): Promise<ChannelModelCredentialRow>;
  listChannelModelCredentials(
    ctx: RequestContext,
    scopeId: string,
  ): Promise<ChannelModelCredentialRow[]>;
  // [T-363] 导出用原始读:secret_value 保持**库中存储形态**(enc:v1: 密文 / 存量明文 /
  // NULL),**不解密** —— 导出文件里的密钥默认就是密文,不落明文盘。
  listModelsRaw(ctx: RequestContext): Promise<ModelConfigurationRow[]>;
  // [T-363] 导入侧解包:enc:v1: 密文 → 用本机 master key 解密(解不开 = 跨机器/换 key,
  // 返回 null,调用方诚实提示重填);明文 → 原样透传(允许手编导出文件)。
  unwrapExportedSecret(stored: string): string | null;
  getStorageConfig(ctx: RequestContext): Promise<StorageConfigRow | null>;
  putStorageConfig(
    ctx: RequestContext,
    patch: StorageConfigPatch,
  ): Promise<StorageConfigRow>;
  // Real usage: SUM(asset_files.file_size) grouped by asset.asset_type, scoped to
  // the ctx user (joins asset_files → assets on the user-owned root).
  sumUsageByAssetType(ctx: RequestContext): Promise<AssetTypeUsage[]>;
  createAgent(
    ctx: RequestContext,
    input: AgentCreateInput,
  ): Promise<AgentConfigurationRow>;
  // T-040c — skill_config_overrides read/write. NOT ctx-scoped (global product
  // config, PK=id): list全表, get by id, put = upsert ON CONFLICT(id) DO UPDATE
  // with version++ + updated_at/by. ctx is threaded only for the updated_by
  // default (ctx.userId) — the rows themselves carry no user_id.
  listSkillConfigOverrides(): Promise<SkillConfigOverrideRow[]>;
  getSkillConfigOverride(id: string): Promise<SkillConfigOverrideRow | null>;
  putSkillConfigOverride(
    ctx: RequestContext,
    body: SkillConfigOverridePutBody,
  ): Promise<SkillConfigOverrideRow>;
  // [T-165] 版本历史:putSkillConfigOverride 每次 upsert 追加一条快照(见其实现)。
  // listSkillConfigOverrideVersions = 按记录时刻倒序列某 skill 的历史版本(最新在前)。
  listSkillConfigOverrideVersions(
    id: string,
  ): Promise<SkillConfigOverrideVersionRow[]>;
  // rollbackSkillConfigOverride = 取某历史版本快照,重新 put 为当前配置(回滚本身也留一条
  // 新版本 → 审计链不断)。versionId 不存在 / 不属于该 override → 抛错(诚实,不静默)。
  rollbackSkillConfigOverride(
    ctx: RequestContext,
    id: string,
    versionId: string,
  ): Promise<SkillConfigOverrideRow>;
  listAccountSkillOverlays(
    ctx: RequestContext,
    skillIds?: readonly string[],
  ): Promise<AccountSkillOverlayRow[]>;
  getAccountSkillOverlay(
    ctx: RequestContext,
    skillId: string,
  ): Promise<AccountSkillOverlayRow | null>;
  putAccountSkillOverlay(
    ctx: RequestContext,
    body: AccountSkillOverlayPutBody,
  ): Promise<AccountSkillOverlayRow>;
  listAccountSkillOverlayVersions(
    ctx: RequestContext,
    skillId: string,
  ): Promise<AccountSkillOverlayVersionRow[]>;
  rollbackAccountSkillOverlay(
    ctx: RequestContext,
    body: {
      skillId: string;
      versionId: string;
      expectedRevision: number;
      observedBaseVersion: string;
      updatedBy?: string;
    },
  ): Promise<AccountSkillOverlayRow>;
  seedPreferences(rows: UserPreferenceRow[]): Promise<void>;
  seedModels(rows: ModelConfigurationRow[]): Promise<void>;
  seedAgents(rows: AgentConfigurationRow[]): Promise<void>;
}

// Schema-default values for a USER_PREFERENCE row when the first PATCH must
// insert. Mirrors the DDL defaults; the patch overrides any provided key.
const PREFERENCE_DEFAULTS = {
  defaultHome: "dashboard",
  defaultCreationMode: "guided",
  defaultVisibility: "private",
  autosaveEnabled: true,
  fileNamingRule: "",
  analyticsEnabled: false, // 默认关(PROTECTION.md §4 遥测零收集)
} as const;

// Strip undefined values from a patch so an `update().set({})` never clobbers a
// column with `undefined` and only the provided keys are written.
function definedOnly(patch: PreferencePatch): Partial<PreferencePatch> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<PreferencePatch>;
}

// 旧 API 兼容标记仍由 resolve/UI 识别。T-731 后 repository 遇到 Keychain 缺失或旧密文
// 未迁移会直接抛出明确错误、fail closed，不再把可逆解密失败伪装成空配置。
export const SECRET_DECRYPT_FAIL_SENTINEL = "dec-fail:v1";

export function isDecryptFailSentinel(v: string | null | undefined): boolean {
  return v === SECRET_DECRYPT_FAIL_SENTINEL;
}

// 仅让没有显式提供加密依赖的旧自动化夹具继续工作；每进程随机，不进入桌面/开发生产路径。
const TEST_LOCAL_MODEL_SECRET_KEY = randomBytes(32);

export function createSettingsRepository(
  db: Db,
  deps: RepoDeps,
): SettingsRepository {
  const requireAccount = (ctx: RequestContext): string => {
    const accountId = ctx.accountId?.trim();
    if (!accountId) throw new Error("ACCOUNT_REQUIRED");
    return accountId;
  };
  const latestAccountSkillOverlay = async (
    ctx: RequestContext,
    skillId: string,
  ): Promise<AccountSkillOverlayRow | null> => {
    const accountId = requireAccount(ctx);
    const rows = await db
      .select()
      .from(accountSkillOverlays)
      .where(
        and(
          eq(accountSkillOverlays.userId, ctx.userId),
          eq(accountSkillOverlays.accountId, accountId),
          eq(accountSkillOverlays.skillId, skillId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  };
  const localSecretKey = Object.prototype.hasOwnProperty.call(
    deps,
    "legacyMasterKey",
  )
    ? (deps.legacyMasterKey ?? null)
    : (deps.masterKey ??
      (process.env.NODE_ENV === "test" || process.env.VITEST
        ? TEST_LOCAL_MODEL_SECRET_KEY
        : null));
  const configuredVault =
    deps.credentialVault ??
    (process.env.NODE_ENV === "test" || process.env.VITEST
      ? createMemoryCredentialVaultForTest()
      : undefined);
  const requireVault = (): CredentialVault => {
    if (!configuredVault) throw new CredentialVaultUnavailableError();
    return configuredVault;
  };
  const decRow = async (
    row: ModelConfigurationRow,
  ): Promise<ModelConfigurationRow> => {
    if (row.secretValue) {
      if (!localSecretKey) {
        return { ...row, secretValue: SECRET_DECRYPT_FAIL_SENTINEL };
      }
      try {
        return {
          ...row,
          secretValue: decryptSecret(row.secretValue, localSecretKey),
        };
      } catch {
        return { ...row, secretValue: SECRET_DECRYPT_FAIL_SENTINEL };
      }
    }
    // DEC-SEC-043：旧版本曾把用户模型 Key 写进 sidecar Keychain service。
    // 这里故意不读、不删该条目，避免启动/设置/模型调用再次弹系统密码框；用户重填后
    // putModel 会用本地密文覆盖数据库引用。
    if (row.keyringRef && row.credentialMigrationState === "keyring_v1") {
      return { ...row, secretValue: SECRET_DECRYPT_FAIL_SENTINEL };
    }
    return row;
  };
  return {
    async getPreferences(ctx) {
      const rows = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, ctx.userId))
        .limit(1);
      return rows[0] ?? null;
    },

    async patchPreferences(ctx, patch) {
      const existing = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, ctx.userId))
        .limit(1);

      const provided = definedOnly(patch);

      if (existing.length === 0) {
        // No row yet → insert defaults overlaid with the provided keys.
        const inserted = await db
          .insert(userPreferences)
          .values({
            userId: ctx.userId,
            ...PREFERENCE_DEFAULTS,
            ...provided,
          })
          .returning();
        return inserted[0]!;
      }

      // Row exists → update only the provided keys, leave the rest untouched.
      if (Object.keys(provided).length === 0) return existing[0]!;
      const updated = await db
        .update(userPreferences)
        .set(provided)
        .where(eq(userPreferences.userId, ctx.userId))
        .returning();
      return updated[0]!;
    },

    async getModel(ctx, capability) {
      const rows = await db
        .select()
        .from(modelConfigurations)
        .where(
          and(
            eq(modelConfigurations.userId, ctx.userId),
            eq(modelConfigurations.capability, capability),
          ),
        )
        .limit(1);
      return rows[0] ? await decRow(rows[0]) : null;
    },

    async putModel(ctx, capability, body) {
      const secretReference = body.secretReference ?? "";
      const settings = body.settings ?? {};
      const isDefault = body.isDefault ?? false;
      const baseUrl = body.baseUrl ?? null;
      const apiFormat = body.apiFormat ?? "anthropic";
      // Only a non-empty `secret` is a write; absent/empty preserves the stored
      // value on update (and inserts NULL on a first create). The upsert `set`
      // therefore excludes secretValue unless provided — a partial update
      // (provider/model only) never clobbers an existing stored key.
      const secretProvided =
        typeof body.secret === "string" && body.secret.length > 0;
      let encryptedSecret: string | null = null;
      if (secretProvided) {
        if (!localSecretKey) {
          throw new Error("本机加密密钥不可用，未保存模型密钥");
        }
        encryptedSecret = encryptSecret(body.secret!, localSecretKey);
        if (decryptSecret(encryptedSecret, localSecretKey) !== body.secret) {
          throw new Error("本机模型密钥加密后核对失败，未保存模型密钥");
        }
      }
      const updateSet: Record<string, unknown> = {
        provider: body.provider,
        modelName: body.modelName,
        secretReference,
        settings,
        baseUrl,
        apiFormat,
        isDefault,
      };
      if (secretProvided) {
        updateSet.secretValue = encryptedSecret;
        updateSet.keyringRef = null;
        updateSet.credentialMigrationState = "encrypted_v1";
        updateSet.rotatedAt = deps.now();
      }
      const inserted = await db
        .insert(modelConfigurations)
        .values({
          id: deps.nextId("model"),
          userId: ctx.userId,
          capability,
          provider: body.provider,
          modelName: body.modelName,
          secretReference,
          secretValue: encryptedSecret,
          keyringRef: null,
          credentialMigrationState: secretProvided ? "encrypted_v1" : "not_required",
          rotatedAt: secretProvided ? deps.now() : null,
          settings,
          baseUrl,
          apiFormat,
          isDefault,
        })
        .onConflictDoUpdate({
          target: [modelConfigurations.userId, modelConfigurations.capability],
          set: updateSet,
        })
        .returning();
      return decRow(inserted[0]!);
    },

    async listModels(ctx) {
      const rows = await db
        .select()
        .from(modelConfigurations)
        .where(eq(modelConfigurations.userId, ctx.userId));
      return Promise.all(rows.map(decRow));
    },

    async bindExistingModelCredential() {
      throw new Error("旧系统钥匙串模型密钥不再自动读取，请重新填写模型密钥");
    },

    async getChannelModelCredential(ctx, scopeId, serviceId) {
      const rows = await db
        .select()
        .from(channelModelCredentials)
        .where(
          and(
            eq(channelModelCredentials.userId, ctx.userId),
            eq(channelModelCredentials.scopeId, scopeId),
            eq(channelModelCredentials.serviceId, serviceId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      if (
        row.credentialStatus !== "ready" ||
        row.migrationState !== "keyring_v1" ||
        !row.keyringRef
      ) {
        throw new CredentialVaultUnavailableError("受管凭据尚未迁入系统钥匙串，受管能力已停止");
      }
      const secret = await requireVault().get(CHANNEL_CREDENTIAL_SERVICE, row.keyringRef);
      if (secret === null) {
        throw new CredentialVaultUnavailableError("系统钥匙串中的受管凭据不存在，受管能力已停止");
      }
      return secret;
    },

    async putChannelModelCredential(
      ctx,
      scopeId,
      serviceId,
      secret,
      serviceType = "user_input",
    ) {
      const plain = secret.trim();
      if (!plain) throw new Error("channel model credential secret is required");
      const ref = channelCredentialRef(scopeId, serviceId);
      const keyVault = requireVault();
      const previous = await keyVault.get(CHANNEL_CREDENTIAL_SERVICE, ref);
      await storeCredentialVerified(
        keyVault,
        CHANNEL_CREDENTIAL_SERVICE,
        ref,
        plain,
      );
      try {
        const rows = await db
          .insert(channelModelCredentials)
          .values({
            userId: ctx.userId,
            scopeId,
            serviceId,
            encryptedSecret: null,
            keyringRef: ref,
            serviceType,
            credentialStatus: "ready",
            migrationState: "keyring_v1",
            rotatedAt: deps.now(),
            updatedAt: deps.now(),
          })
          .onConflictDoUpdate({
            target: [
              channelModelCredentials.userId,
              channelModelCredentials.scopeId,
              channelModelCredentials.serviceId,
            ],
            set: {
              encryptedSecret: null,
              keyringRef: ref,
              serviceType,
              credentialStatus: "ready",
              migrationState: "keyring_v1",
              rotatedAt: deps.now(),
              updatedAt: deps.now(),
            },
          })
          .returning();
        return rows[0]!;
      } catch (error) {
        if (previous === null) {
          await keyVault.delete(CHANNEL_CREDENTIAL_SERVICE, ref).catch(() => {});
        } else {
          await keyVault.set(CHANNEL_CREDENTIAL_SERVICE, ref, previous).catch(() => {});
        }
        throw error;
      }
    },

    async listChannelModelCredentials(ctx, scopeId) {
      return db
        .select()
        .from(channelModelCredentials)
        .where(
          and(
            eq(channelModelCredentials.userId, ctx.userId),
            eq(channelModelCredentials.scopeId, scopeId),
          ),
        );
    },

    // 导出用原始读 —— **不过 decRow/不访问 Keychain**。用户自填模型 Key 只以 enc:v1
    // 密文形态进入导出；存量 keyring-only 行没有可导出的密钥，要求用户重新填写。
    async listModelsRaw(ctx) {
      return db
        .select()
        .from(modelConfigurations)
        .where(eq(modelConfigurations.userId, ctx.userId));
    },

    // 解包同机 enc:v1 导出；成功后 putModel 会用新 IV 重新加密落本地数据库。
    unwrapExportedSecret(stored) {
      if (!isEncrypted(stored)) return stored; // 明文(手编文件/存量明文导出)透传
      if (!localSecretKey) return null; // 密文但本环境无本机 key → 诚实解不开
      try {
        return decryptSecret(stored, localSecretKey);
      } catch {
        // auth tag 校验失败 = 非本机导出(master key 不符)→ null,调用方提示重填。
        return null;
      }
    },

    async getStorageConfig(ctx) {
      const rows = await db
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.userId, ctx.userId))
        .limit(1);
      return rows[0] ?? null;
    },

    async putStorageConfig(ctx, patch) {
      const now = deps.now();
      // user_id-PK upsert: insert defaults overlaid with the provided keys, or on
      // conflict update ONLY the provided keys (a partial patch never clobbers the
      // other column). `created_at` is preserved on update (excluded from `set`).
      const backend = patch.backend;
      const rootPath = patch.rootPath;
      const updateSet: Record<string, unknown> = { updatedAt: now };
      if (backend !== undefined) updateSet.backend = backend;
      if (rootPath !== undefined) updateSet.rootPath = rootPath;
      const inserted = await db
        .insert(storageConfigs)
        .values({
          userId: ctx.userId,
          backend: backend ?? "local",
          rootPath: rootPath ?? "",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: storageConfigs.userId,
          set: updateSet,
        })
        .returning();
      return inserted[0]!;
    },

    async sumUsageByAssetType(ctx) {
      const rows = await db
        .select({
          assetType: assets.assetType,
          bytes: sql<number>`COALESCE(SUM(${assetFiles.fileSize}), 0)`,
        })
        .from(assetFiles)
        .innerJoin(assets, eq(assetFiles.assetId, assets.id))
        .where(eq(assets.userId, ctx.userId))
        .groupBy(assets.assetType);
      // pglite/pg may return the SUM as a string; Number() it defensively.
      return rows.map((r) => ({
        assetType: r.assetType,
        bytes: Number(r.bytes) || 0,
      }));
    },

    async createAgent(ctx, input) {
      const now = deps.now();
      const inserted = await db
        .insert(agentConfigurations)
        .values({
          id: deps.nextId("agent"),
          userId: ctx.userId,
          name: input.name,
          agentType: input.agentType,
          status: "active",
          capabilities: {},
          settings: {},
          secretReference: "",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return inserted[0]!;
    },

    async listSkillConfigOverrides() {
      // NOT ctx-scoped: global product config (id is the PK, no user_id column).
      return db.select().from(skillConfigOverrides);
    },

    async getSkillConfigOverride(id) {
      const rows = await db
        .select()
        .from(skillConfigOverrides)
        .where(eq(skillConfigOverrides.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async putSkillConfigOverride(ctx, body) {
      const now = deps.now();
      const updatedBy = body.updatedBy ?? ctx.userId ?? "system";
      // Compute the next version deterministically from the current row (若无 → "1",
      // else parse-and-increment; 非数字 version → 从 1 重开). This is a plain audit
      // marker, not an optimistic-lock token — a single-writer local db.
      const existing = await db
        .select({ version: skillConfigOverrides.version })
        .from(skillConfigOverrides)
        .where(eq(skillConfigOverrides.id, body.id))
        .limit(1);
      const prevVersion = existing[0]?.version;
      const prevNum = prevVersion ? Number.parseInt(prevVersion, 10) : 0;
      // Provided version wins (explicit label); else auto-increment prev+1.
      const nextVersion =
        body.version !== undefined && body.version.trim()
          ? body.version
          : String((Number.isFinite(prevNum) && prevNum > 0 ? prevNum : 0) + 1);

      // Only provided override fields are written; absent ones become NULL on a
      // first insert and are excluded from the UPDATE `set` (so a partial put never
      // clobbers a column the caller didn't touch). jsonb columns take the object /
      // string[] directly (undefined → not written).
      const tools = body.tools !== undefined ? [...body.tools] : undefined;
      const requiredFacets =
        body.requiredFacets !== undefined ? [...body.requiredFacets] : undefined;
      const updateSet: Record<string, unknown> = {
        version: nextVersion,
        updatedBy,
        updatedAt: now,
      };
      if (body.system !== undefined) updateSet.system = body.system;
      if (body.template !== undefined) updateSet.template = body.template;
      if (tools !== undefined) updateSet.tools = tools;
      if (requiredFacets !== undefined) updateSet.requiredFacets = requiredFacets;
      if (body.outputSchema !== undefined)
        updateSet.outputSchema = body.outputSchema;

      const inserted = await db
        .insert(skillConfigOverrides)
        .values({
          id: body.id,
          version: nextVersion,
          system: body.system ?? null,
          template: body.template ?? null,
          tools: tools ?? null,
          requiredFacets: requiredFacets ?? null,
          outputSchema: body.outputSchema ?? null,
          updatedBy,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: skillConfigOverrides.id,
          set: updateSet,
        })
        .returning();
      const row = inserted[0]!;
      // [T-165] 追加本次生效配置的版本快照(不覆盖历史,供一键回滚)。快照取**写后**的当前
      // 行状态(含 onConflict 合并后的完整字段),createdAt = 该次 updatedAt(同源、便于按序排)。
      await db.insert(skillConfigOverrideVersions).values({
        id: deps.nextId("skover"),
        overrideId: row.id,
        version: row.version,
        system: row.system,
        template: row.template,
        tools: row.tools,
        requiredFacets: row.requiredFacets,
        outputSchema: row.outputSchema,
        updatedBy: row.updatedBy,
        createdAt: row.updatedAt,
      });
      return row;
    },

    async listSkillConfigOverrideVersions(id) {
      const rows = await db
        .select()
        .from(skillConfigOverrideVersions)
        .where(eq(skillConfigOverrideVersions.overrideId, id));
      // 最新在前:主 createdAt 倒序;次 version 数值倒序(putSkillConfigOverride 的 version 单调
      // 递增 → 版本号即插入序)。**不靠 text id 字典序兜底** —— 那在 id 数字跨位(如 c-9→c-10)会
      // 错排,且固定测试时钟下 createdAt 同刻会暴露它。version 数值排序稳、时钟无关。
      return rows.sort((a, b) => {
        if (a.createdAt !== b.createdAt)
          return a.createdAt < b.createdAt ? 1 : -1;
        const na = Number(a.version);
        const nb = Number(b.version);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb)
          return nb - na;
        return 0;
      });
    },

    async rollbackSkillConfigOverride(ctx, id, versionId) {
      // 取目标历史版本快照(须存在且属于该 override —— 诚实,不静默回滚到错的东西)。
      const snap = await db
        .select()
        .from(skillConfigOverrideVersions)
        .where(
          and(
            eq(skillConfigOverrideVersions.id, versionId),
            eq(skillConfigOverrideVersions.overrideId, id),
          ),
        )
        .limit(1);
      const target = snap[0];
      if (!target) {
        throw new Error(
          `rollbackSkillConfigOverride: 版本 ${versionId} 不存在或不属于 skill "${id}"`,
        );
      }
      // 重新 put 快照字段为当前配置 —— 复用 putSkillConfigOverride(version++ + 自身再记一条
      // 版本快照 = 回滚也进历史,审计链不断)。jsonb 列存 unknown,归一回 body 形状。
      return this.putSkillConfigOverride(ctx, {
        id,
        system: target.system ?? undefined,
        template: target.template ?? undefined,
        tools: Array.isArray(target.tools)
          ? (target.tools as string[])
          : undefined,
        requiredFacets: Array.isArray(target.requiredFacets)
          ? (target.requiredFacets as string[])
          : undefined,
        outputSchema:
          target.outputSchema && typeof target.outputSchema === "object"
            ? (target.outputSchema as Record<string, unknown>)
            : undefined,
      });
    },

    async listAccountSkillOverlays(ctx, skillIds) {
      const accountId = requireAccount(ctx);
      const rows = await db
        .select()
        .from(accountSkillOverlays)
        .where(
          and(
            eq(accountSkillOverlays.userId, ctx.userId),
            eq(accountSkillOverlays.accountId, accountId),
          ),
        );
      const wanted = skillIds ? new Set(skillIds) : null;
      return rows
        .filter((row) => !wanted || wanted.has(row.skillId))
        .sort((a, b) => a.skillId.localeCompare(b.skillId));
    },

    async getAccountSkillOverlay(ctx, skillId) {
      return latestAccountSkillOverlay(ctx, skillId);
    },

    async putAccountSkillOverlay(ctx, body) {
      const accountId = requireAccount(ctx);
      const now = deps.now();
      const updatedBy = body.updatedBy ?? ctx.userId;

      try {
        return await db.transaction(async (tx) => {
          let row: AccountSkillOverlayRow | undefined;
          if (body.expectedRevision === null) {
            const inserted = await tx
              .insert(accountSkillOverlays)
              .values({
                id: deps.nextId("skoverlay"),
                userId: ctx.userId,
                accountId,
                skillId: body.skillId,
                rowRevision: 1,
                observedBaseVersion: body.observedBaseVersion,
                overlayVersion: body.overlayVersion ?? null,
                overlay: body.overlay,
                updatedBy,
                createdAt: now,
                updatedAt: now,
              })
              .onConflictDoNothing({
                target: [
                  accountSkillOverlays.userId,
                  accountSkillOverlays.accountId,
                  accountSkillOverlays.skillId,
                ],
              })
              .returning();
            row = inserted[0];
          } else {
            const updated = await tx
              .update(accountSkillOverlays)
              .set({
                rowRevision: body.expectedRevision + 1,
                observedBaseVersion: body.observedBaseVersion,
                overlayVersion: body.overlayVersion ?? null,
                overlay: body.overlay,
                updatedBy,
                updatedAt: now,
              })
              .where(
                and(
                  eq(accountSkillOverlays.userId, ctx.userId),
                  eq(accountSkillOverlays.accountId, accountId),
                  eq(accountSkillOverlays.skillId, body.skillId),
                  eq(
                    accountSkillOverlays.rowRevision,
                    body.expectedRevision,
                  ),
                ),
              )
              .returning();
            row = updated[0];
          }
          if (!row) {
            const latest = await tx
              .select({
                rowRevision: accountSkillOverlays.rowRevision,
                updatedAt: accountSkillOverlays.updatedAt,
              })
              .from(accountSkillOverlays)
              .where(
                and(
                  eq(accountSkillOverlays.userId, ctx.userId),
                  eq(accountSkillOverlays.accountId, accountId),
                  eq(accountSkillOverlays.skillId, body.skillId),
                ),
              )
              .limit(1);
            throw new SkillOverlayRevisionConflictError(
              latest[0]?.rowRevision ?? null,
              latest[0]?.updatedAt ?? null,
            );
          }
          await tx.insert(accountSkillOverlayVersions).values({
            id: deps.nextId("skoverlayv"),
            overlayId: row.id,
            userId: row.userId,
            accountId: row.accountId,
            skillId: row.skillId,
            rowRevision: row.rowRevision,
            observedBaseVersion: row.observedBaseVersion,
            overlayVersion: row.overlayVersion,
            overlay: row.overlay,
            updatedBy: row.updatedBy,
            createdAt: row.updatedAt,
          });
          return row;
        });
      } catch (error) {
        if (error instanceof SkillOverlayRevisionConflictError) throw error;
        throw error;
      }
    },

    async listAccountSkillOverlayVersions(ctx, skillId) {
      const accountId = requireAccount(ctx);
      const rows = await db
        .select()
        .from(accountSkillOverlayVersions)
        .where(
          and(
            eq(accountSkillOverlayVersions.userId, ctx.userId),
            eq(accountSkillOverlayVersions.accountId, accountId),
            eq(accountSkillOverlayVersions.skillId, skillId),
          ),
        );
      return rows.sort((a, b) => b.rowRevision - a.rowRevision);
    },

    async rollbackAccountSkillOverlay(ctx, body) {
      const accountId = requireAccount(ctx);
      const rows = await db
        .select()
        .from(accountSkillOverlayVersions)
        .where(
          and(
            eq(accountSkillOverlayVersions.id, body.versionId),
            eq(accountSkillOverlayVersions.userId, ctx.userId),
            eq(accountSkillOverlayVersions.accountId, accountId),
            eq(accountSkillOverlayVersions.skillId, body.skillId),
          ),
        )
        .limit(1);
      const target = rows[0];
      if (!target) throw new SkillOverlayVersionNotFoundError();
      return this.putAccountSkillOverlay(ctx, {
        skillId: body.skillId,
        expectedRevision: body.expectedRevision,
        observedBaseVersion: body.observedBaseVersion,
        overlayVersion: target.overlayVersion,
        overlay: target.overlay as AccountSkillOverlay,
        updatedBy: body.updatedBy,
      });
    },

    async seedPreferences(rows) {
      if (rows.length === 0) return;
      await db.insert(userPreferences).values(rows).onConflictDoNothing();
    },

    async seedModels(rows) {
      if (rows.length === 0) return;
      await db.insert(modelConfigurations).values(rows).onConflictDoNothing();
    },

    async seedAgents(rows) {
      if (rows.length === 0) return;
      await db.insert(agentConfigurations).values(rows).onConflictDoNothing();
    },
  };
}
