import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import {
  userPreferences,
  modelConfigurations,
  agentConfigurations,
} from "../schema/settings";
import { users } from "../schema/identity";

// Injected dependencies — mirrors project/knowledge RepoDeps so the repo stays
// deterministic (no Date.now / Math.random / fetch inside) and user-scoped. Every
// op resolves its owner from deps.userId (threaded from RequestContext).
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type CreationMode = "guided" | "flexible" | "freeform";
type Visibility = "private" | "unlisted" | "public";

type UserRow = typeof users.$inferSelect;
type PreferenceRow = typeof userPreferences.$inferSelect;
type ModelRow = typeof modelConfigurations.$inferSelect;
type AgentRow = typeof agentConfigurations.$inferSelect;

// USER_PREFERENCE has PK=user_id (no own id) — the DTO id is synthesized as
// "pref-"+userId (schema note). The repo returns this DTO shape, not the raw row.
export type PreferenceDto = Omit<PreferenceRow, "userId"> & {
  id: string;
  userId: string;
};

// getSettings returns the User resource (identity `users` minus passwordHash).
export type UserDto = Omit<UserRow, "passwordHash">;

// Defaults for a user's preference row the first time it is touched. Mirrors the
// schema column defaults; defaultHome/creationMode/visibility have no DB default
// so they are seeded here.
const DEFAULT_PREFERENCES = {
  defaultHome: "dashboard",
  defaultCreationMode: "guided" as CreationMode,
  defaultVisibility: "private" as Visibility,
  autosaveEnabled: true,
  fileNamingRule: "",
  analyticsEnabled: true,
} as const;

const toPreferenceDto = (row: PreferenceRow): PreferenceDto => ({
  id: `pref-${row.userId}`,
  userId: row.userId,
  defaultHome: row.defaultHome,
  defaultCreationMode: row.defaultCreationMode,
  defaultVisibility: row.defaultVisibility,
  autosaveEnabled: row.autosaveEnabled,
  fileNamingRule: row.fileNamingRule,
  analyticsEnabled: row.analyticsEnabled,
});

const toUserDto = (row: UserRow): UserDto => {
  const { passwordHash: _passwordHash, ...rest } = row;
  return rest;
};

export interface SettingsRepository {
  // GET /settings — the singleton settings view: the authenticated user.
  getSettings(): Promise<UserDto>;

  // Preferences (singleton per user, keyed by user_id).
  getPreferences(): Promise<PreferenceDto>;
  patchPreferences(patch: {
    defaultHome?: string;
    defaultCreationMode?: CreationMode;
    defaultVisibility?: Visibility;
    autosaveEnabled?: boolean;
    fileNamingRule?: string;
    analyticsEnabled?: boolean;
  }): Promise<PreferenceDto>;

  // Model configs — idempotent upsert keyed on (user_id, capability).
  listModels(): Promise<ModelRow[]>;
  putModel(
    capability: string,
    input: {
      provider: string;
      modelName: string;
      secretReference?: string;
      settings?: Record<string, unknown>;
      isDefault?: boolean;
    },
  ): Promise<ModelRow>;

  // Agent configs — create surface (Wave-1 ships create only).
  listAgents(): Promise<AgentRow[]>;
  getAgent(agentId: string): Promise<AgentRow>;
  createAgent(input: { name: string; agentType: string }): Promise<AgentRow>;

  // Seeds (idempotent) for fixtures.
  seedPreferences(rows: PreferenceRow[]): Promise<void>;
}

export function createSettingsRepository(
  db: Db,
  deps: RepoDeps,
): SettingsRepository {
  // Lazily ensures the caller's preference row exists, then returns it. The row
  // is keyed by deps.userId so it is owner-scoped by construction.
  async function ensurePreferences(): Promise<PreferenceRow> {
    const existing = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, deps.userId));
    if (existing[0]) return existing[0];

    const inserted = await db
      .insert(userPreferences)
      .values({ userId: deps.userId, ...DEFAULT_PREFERENCES })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return inserted[0];

    // Lost an insert race — re-read the now-present row.
    const reread = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, deps.userId));
    return reread[0]!;
  }

  // Owner-scoped read of an agent config: a row owned by another user is
  // invisible → the same "not found" surface project/knowledge repos use for
  // cross-user / missing rows.
  async function getAgent(agentId: string): Promise<AgentRow> {
    const rows = await db
      .select()
      .from(agentConfigurations)
      .where(
        and(
          eq(agentConfigurations.id, agentId),
          eq(agentConfigurations.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: agent not found: ${agentId}`);
    }
    return row;
  }

  return {
    async getSettings() {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, deps.userId));
      const row = rows[0];
      if (!row) {
        throw new Error(`OwnershipError: user not found: ${deps.userId}`);
      }
      return toUserDto(row);
    },

    async getPreferences() {
      return toPreferenceDto(await ensurePreferences());
    },

    async patchPreferences(patch) {
      await ensurePreferences();
      const set: Partial<PreferenceRow> = {};
      if (patch.defaultHome !== undefined) set.defaultHome = patch.defaultHome;
      if (patch.defaultCreationMode !== undefined)
        set.defaultCreationMode = patch.defaultCreationMode;
      if (patch.defaultVisibility !== undefined)
        set.defaultVisibility = patch.defaultVisibility;
      if (patch.autosaveEnabled !== undefined)
        set.autosaveEnabled = patch.autosaveEnabled;
      if (patch.fileNamingRule !== undefined)
        set.fileNamingRule = patch.fileNamingRule;
      if (patch.analyticsEnabled !== undefined)
        set.analyticsEnabled = patch.analyticsEnabled;

      const updated = await db
        .update(userPreferences)
        .set(set)
        .where(eq(userPreferences.userId, deps.userId))
        .returning();
      return toPreferenceDto(updated[0]!);
    },

    async listModels() {
      return db
        .select()
        .from(modelConfigurations)
        .where(eq(modelConfigurations.userId, deps.userId))
        .orderBy(asc(modelConfigurations.capability));
    },

    // Idempotent upsert keyed on (user_id, capability) — the
    // model_config_user_capability UNIQUE index drives ON CONFLICT DO UPDATE so a
    // repeat PUT for the same capability mutates the existing row in place.
    async putModel(capability, input) {
      const values = {
        id: deps.nextId("model"),
        userId: deps.userId,
        capability,
        provider: input.provider,
        modelName: input.modelName,
        secretReference: input.secretReference ?? "",
        settings: input.settings ?? {},
        isDefault: input.isDefault ?? false,
      };
      const upserted = await db
        .insert(modelConfigurations)
        .values(values)
        .onConflictDoUpdate({
          target: [modelConfigurations.userId, modelConfigurations.capability],
          set: {
            provider: values.provider,
            modelName: values.modelName,
            secretReference: values.secretReference,
            settings: values.settings,
            isDefault: values.isDefault,
          },
        })
        .returning();
      return upserted[0]!;
    },

    async listAgents() {
      return db
        .select()
        .from(agentConfigurations)
        .where(eq(agentConfigurations.userId, deps.userId))
        .orderBy(asc(agentConfigurations.createdAt));
    },

    getAgent,

    async createAgent({ name, agentType }) {
      const ts = deps.now();
      const inserted = await db
        .insert(agentConfigurations)
        .values({
          id: deps.nextId("agent"),
          userId: deps.userId,
          name,
          agentType,
          status: "active",
          capabilities: {},
          settings: {},
          secretReference: "",
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async seedPreferences(rows) {
      if (rows.length === 0) return;
      await db.insert(userPreferences).values(rows).onConflictDoNothing();
    },
  };
}
