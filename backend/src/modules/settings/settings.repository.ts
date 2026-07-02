import { and, eq, sql, type Db, type RequestContext } from "@creatoros/backend";
import { assets, assetFiles } from "@creatoros/backend";
import {
  userPreferences,
  modelConfigurations,
  agentConfigurations,
  storageConfigs,
  skillConfigOverrides,
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
  analyticsEnabled: true,
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
      return rows[0] ?? null;
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
      const updateSet: Record<string, unknown> = {
        provider: body.provider,
        modelName: body.modelName,
        secretReference,
        settings,
        baseUrl,
        apiFormat,
        isDefault,
      };
      if (secretProvided) updateSet.secretValue = body.secret;
      const inserted = await db
        .insert(modelConfigurations)
        .values({
          id: deps.nextId("model"),
          userId: ctx.userId,
          capability,
          provider: body.provider,
          modelName: body.modelName,
          secretReference,
          secretValue: secretProvided ? body.secret! : null,
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
      return inserted[0]!;
    },

    async listModels(ctx) {
      return db
        .select()
        .from(modelConfigurations)
        .where(eq(modelConfigurations.userId, ctx.userId));
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
      return inserted[0]!;
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
