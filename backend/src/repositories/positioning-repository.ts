import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import { creatorProfiles, positioningStatements } from "../schema/positioning";

// Injected dependencies — mirrors project-/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped. userId is threaded from RequestContext and stamped at write time.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type CreatorProfileType = "human" | "ai";

type ProfileRow = typeof creatorProfiles.$inferSelect;
type StatementRow = typeof positioningStatements.$inferSelect;

export interface PositioningRepository {
  seedProfiles(rows: ProfileRow[]): Promise<void>;
  seedStatements(rows: StatementRow[]): Promise<void>;
  // CreatorProfile — account-scoped, one per user (UNIQUE user_id, OQ1).
  getProfile(): Promise<ProfileRow>;
  upsertProfile(input: {
    persona?: string;
    field?: string;
    audience?: string;
    differentiation?: string;
    capabilities?: string[];
  }): Promise<ProfileRow>;
  // PositioningStatement — immutable version chain (ArtifactVersion-style).
  listStatements(): Promise<StatementRow[]>;
  getStatement(statementId: string): Promise<StatementRow>;
  createStatement(input: {
    oneLiner: string;
    keywords: string[];
    productAnchorIds?: string[];
    createdByType?: CreatorProfileType;
    aiTaskId?: string | null;
  }): Promise<StatementRow>;
  // TODO(positioning.gate.evaluate): the gate is an advisory value-object
  // computation (no table — PositioningGateResultResource). It belongs in the
  // service layer (it scores a subject against a statement), so it is intentionally
  // deferred from the repository surface.
}

export function createPositioningRepository(
  db: Db,
  deps: RepoDeps,
): PositioningRepository {
  // Owner-scoped read of the single CreatorProfile (one per user). A profile owned
  // by another user is invisible → same "not found" surface the reference repos use
  // for cross-user / missing rows.
  async function getProfileRow(): Promise<ProfileRow | undefined> {
    const rows = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, deps.userId))
      .limit(1);
    return rows[0];
  }

  return {
    async seedProfiles(rows) {
      if (rows.length === 0) return;
      await db.insert(creatorProfiles).values(rows).onConflictDoNothing();
    },

    async seedStatements(rows) {
      if (rows.length === 0) return;
      await db.insert(positioningStatements).values(rows).onConflictDoNothing();
    },

    async getProfile() {
      const row = await getProfileRow();
      if (!row) {
        throw new Error(
          `OwnershipError: creator profile not found for user: ${deps.userId}`,
        );
      }
      return row;
    },

    // Idempotent upsert keyed on the UNIQUE (user_id) constraint: a second call for
    // the same user UPDATES the existing profile rather than minting a duplicate.
    async upsertProfile(input) {
      const ts = deps.now();
      const existing = await getProfileRow();

      if (existing) {
        const set: Partial<ProfileRow> = { updatedAt: ts };
        if (input.persona !== undefined) set.persona = input.persona;
        if (input.field !== undefined) set.field = input.field;
        if (input.audience !== undefined) set.audience = input.audience;
        if (input.differentiation !== undefined)
          set.differentiation = input.differentiation;
        if (input.capabilities !== undefined)
          set.capabilities = input.capabilities;
        const updated = await db
          .update(creatorProfiles)
          .set(set)
          .where(eq(creatorProfiles.userId, deps.userId))
          .returning();
        return updated[0]!;
      }

      const inserted = await db
        .insert(creatorProfiles)
        .values({
          id: deps.nextId("creator-profile"),
          userId: deps.userId,
          persona: input.persona ?? "",
          field: input.field ?? "",
          audience: input.audience ?? "",
          differentiation: input.differentiation ?? "",
          capabilities: input.capabilities ?? [],
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async listStatements() {
      return db
        .select()
        .from(positioningStatements)
        .where(eq(positioningStatements.userId, deps.userId))
        .orderBy(desc(positioningStatements.versionNumber));
    },

    async getStatement(statementId) {
      const rows = await db
        .select()
        .from(positioningStatements)
        .where(
          and(
            eq(positioningStatements.id, statementId),
            eq(positioningStatements.userId, deps.userId),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new Error(
          `OwnershipError: positioning statement not found: ${statementId}`,
        );
      }
      return row;
    },

    // Append-only version chain: a new statement is a NEW row with
    // version_number = max(version_number for this profile) + 1. Existing rows are
    // NEVER updated or deleted (immutability invariant, schema §"Immutability").
    // The profile must exist + be owned by the caller (the profile is the chain key).
    async createStatement(input) {
      const profile = await this.getProfile(); // ownership + existence gate
      const ts = deps.now();

      const latest = await db
        .select()
        .from(positioningStatements)
        .where(eq(positioningStatements.profileId, profile.id))
        .orderBy(desc(positioningStatements.versionNumber))
        .limit(1);
      const nextVersion = (latest[0]?.versionNumber ?? 0) + 1;

      const inserted = await db
        .insert(positioningStatements)
        .values({
          id: deps.nextId("positioning-statement"),
          userId: deps.userId,
          profileId: profile.id,
          oneLiner: input.oneLiner,
          keywords: input.keywords,
          productAnchorIds: input.productAnchorIds ?? [],
          versionNumber: nextVersion,
          createdByType: input.createdByType ?? "human",
          aiTaskId: input.aiTaskId ?? null,
          createdAt: ts,
        })
        .returning();
      return inserted[0]!;
    },
  };
}
