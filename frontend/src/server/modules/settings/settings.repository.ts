import { and, eq, type Db, type RequestContext } from "@creatoros/backend";
import {
  userPreferences,
  modelConfigurations,
  agentConfigurations,
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
  createAgent(
    ctx: RequestContext,
    input: AgentCreateInput,
  ): Promise<AgentConfigurationRow>;
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
