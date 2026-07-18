import { and, eq, sql, type Db, type RequestContext } from "@creatoros/backend";
import { assets, assetFiles } from "@creatoros/backend";
import { encryptSecret, decryptSecret, isEncrypted } from "@creatoros/backend";
import {
  userPreferences,
  modelConfigurations,
  agentConfigurations,
  storageConfigs,
  skillConfigOverrides,
  skillConfigOverrideVersions,
} from "./settings.db-schema";

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
  // T-147 P2 本地加密 —— 注入 32B master key 后,model_configurations.secret_value
  // 在 putModel 写库前加密(AES-256-GCM,enc:v1: 前缀)、getModel/listModels 读出后解密
  // (透明:service/resolve 拿到明文,无感)。**缺省(不注入)= 明文路径**(向后兼容,
  // 现有集成测试/旧调用不变)。master key 来源见 secret-crypto.resolveMasterKey
  // (桌面 keychain via env / web-dev 降级)。装配处 persistence-client 传入。
  masterKey?: Buffer;
}

export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type ModelConfigurationRow = typeof modelConfigurations.$inferSelect;
export type AgentConfigurationRow = typeof agentConfigurations.$inferSelect;
export type StorageConfigRow = typeof storageConfigs.$inferSelect;
// T-040c — skill_config_overrides row (提示词/skill 服务端可配的持久层, SPEC 2026-07-02
// §4.1). Non user-scoped (提示词是产品级系统配置, SPEC §7 Open Q1 默认全局) — id 即 PK,
// so these ops are NOT ctx-filtered (unlike every other repo method here). Each column
// is nullable = 未配 → 装配期归一 undefined → `?? base` 回退内置模板.
export type SkillConfigOverrideRow = typeof skillConfigOverrides.$inferSelect;
export type SkillConfigOverrideVersionRow =
  typeof skillConfigOverrideVersions.$inferSelect;

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
  apiFormat?: "anthropic" | "openai_chat";
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
  listModels(ctx: RequestContext): Promise<ModelConfigurationRow[]>;
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

export function createSettingsRepository(
  db: Db,
  deps: RepoDeps,
): SettingsRepository {
  // T-147 P2 — 透明加解密收口。masterKey 缺省 = 无操作(明文路径,向后兼容)。
  //   encSecret: 写库前加密一个非空明文 secret;null/空 → 原样(不加密 NULL/空列)。
  //   decRow: 读出一行后就地解密其 secretValue(密文→明文;存量明文无前缀→透传)。
  const key = deps.masterKey;
  const encSecret = (plain: string): string =>
    key ? encryptSecret(plain, key) : plain;
  const decRow = (row: ModelConfigurationRow): ModelConfigurationRow => {
    if (!key || row.secretValue == null) return row;
    try {
      return { ...row, secretValue: decryptSecret(row.secretValue, key) };
    } catch (e) {
      // [T-171] master key 换了/丢了(keychain 重置 / 未签名 app 换签名)→ 密文解不开
      //   (AES-256-GCM auth tag 校验失败)。**绝不硬崩**——否则 getModel/listModels 抛错 →
      //   任何读模型配置的 SSR 页 500。降级:secretValue=null(视为未配 key),用户重填即恢复
      //   (重填用当前 master key 重新加密)。诚实:解不开的 key = 等于没配。
      console.warn(
        `[settings] model secret 解密失败(master key 不符?)capability=${row.capability} → 视为未配置`,
        e instanceof Error ? e.message : e,
      );
      return { ...row, secretValue: null };
    }
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
      // T-147 P2 — 读出即解密(密文→明文;存量明文透传)。
      return rows[0] ? decRow(rows[0]) : null;
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
      // T-147 P2 — 写库前加密(masterKey 缺省 = 明文,向后兼容)。存量明文列不受影响
      // (只有 provided 的新 secret 才加密写入)。
      const secretToStore = secretProvided ? encSecret(body.secret!) : null;
      const updateSet: Record<string, unknown> = {
        provider: body.provider,
        modelName: body.modelName,
        secretReference,
        settings,
        baseUrl,
        apiFormat,
        isDefault,
      };
      if (secretProvided) updateSet.secretValue = secretToStore;
      const inserted = await db
        .insert(modelConfigurations)
        .values({
          id: deps.nextId("model"),
          userId: ctx.userId,
          capability,
          provider: body.provider,
          modelName: body.modelName,
          secretReference,
          secretValue: secretToStore,
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
      // Decrypt on the way out so the caller (service→resolve) sees plaintext.
      return decRow(inserted[0]!);
    },

    async listModels(ctx) {
      const rows = await db
        .select()
        .from(modelConfigurations)
        .where(eq(modelConfigurations.userId, ctx.userId));
      // T-147 P2 — 每行读出即解密。
      return rows.map(decRow);
    },

    // [T-363] 导出用原始读 —— **不过 decRow**,secret_value 保持库中存储形态(密文/存量
    // 明文/NULL)。导出文件默认只含密文;明文只在「无 master key 的存量明文行」出现,
    // 由 service 层如实标注 secretForm 供 UI 警示。
    async listModelsRaw(ctx) {
      return db
        .select()
        .from(modelConfigurations)
        .where(eq(modelConfigurations.userId, ctx.userId));
    },

    // [T-363] 导入侧解包(与 decRow 同一把 key、同款「解不开不硬崩」姿态)。
    unwrapExportedSecret(stored) {
      if (!isEncrypted(stored)) return stored; // 明文(手编文件/存量明文导出)透传
      if (!key) return null; // 密文但本环境无 key → 诚实解不开
      try {
        return decryptSecret(stored, key);
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
