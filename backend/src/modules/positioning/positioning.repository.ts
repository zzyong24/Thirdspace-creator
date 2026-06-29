import { and, desc, eq, type Db } from "@creatoros/backend";
import {
  creatorProfiles,
  positioningStatements,
} from "./positioning.db-schema";
import { OwnershipError } from "./positioning.errors";

// Positioning repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the learnings/reviews repos): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. A
// getStatement(id) throws OwnershipError when the scoped select returns empty —
// never revealing cross-user existence (foundation §2: 404 not 403).
//
// Immutability is enforced at the data-access layer: the repository exposes
// `insertStatement` ONLY — there is NO updateStatement / deleteStatement (the
// append-only version chain, mirroring Artifacts' ArtifactVersion). Profiles ARE
// mutable (upsert), so the profile reads expose insert + update.

export type CreatorProfileRow = typeof creatorProfiles.$inferSelect;
export type PositioningStatementRow =
  typeof positioningStatements.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

// The richer facets + downstream rules (定位中心重建) — persisted as ONE jsonb each.
// Stored as plain objects (string fields); the service/mapper own the key set.
export interface ProfileFacetsInput {
  contentScope: string;
  avoid: string;
  corePain: string;
  coreValue: string;
  tone: string;
  statusNote: string;
}

export interface ProfileDownstreamRulesInput {
  topicRule: string;
  scriptRule: string;
  projectRule: string;
  forbidRule: string;
  expressionRule: string;
}

export interface InsertProfileInput {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  facets: ProfileFacetsInput;
  downstreamRules: ProfileDownstreamRulesInput;
}

export interface UpdateProfileInput {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  facets: ProfileFacetsInput;
  downstreamRules: ProfileDownstreamRulesInput;
}

export interface InsertStatementInput {
  profileId: string;
  oneLiner: string;
  keywords: string[];
  productAnchorIds: string[];
  versionNumber: number;
  createdByType: string;
  aiTaskId: string | null;
}

export interface PositioningRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedProfiles(rows: CreatorProfileRow[]): Promise<void>;
  seedStatements(rows: PositioningStatementRow[]): Promise<void>;

  // Profile reads/writes (mutable, one per user).
  getProfile(): Promise<CreatorProfileRow | undefined>;
  insertProfile(input: InsertProfileInput): Promise<CreatorProfileRow>;
  updateProfileRow(input: UpdateProfileInput): Promise<CreatorProfileRow>;

  // Statement reads (immutable version chain).
  listStatements(page: {
    limit: number;
    offset: number;
  }): Promise<{ rows: PositioningStatementRow[]; total: number }>;
  getStatement(statementId: string): Promise<PositioningStatementRow>;
  getCurrentStatement(
    profileId: string,
  ): Promise<PositioningStatementRow | undefined>;
  maxVersionNumber(profileId: string): Promise<number>;

  // Statement write — INSERT ONLY (no update/delete; immutability guard).
  insertStatement(
    input: InsertStatementInput,
  ): Promise<PositioningStatementRow>;
}

export function createPositioningRepository(
  db: Db,
  deps: RepoDeps,
): PositioningRepository {
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
      const rows = await db
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, deps.userId));
      return rows[0];
    },

    async insertProfile(input) {
      const inserted = await db
        .insert(creatorProfiles)
        .values({
          id: deps.nextId("profile"),
          userId: deps.userId,
          persona: input.persona,
          field: input.field,
          audience: input.audience,
          differentiation: input.differentiation,
          capabilities: input.capabilities,
          facets: input.facets,
          downstreamRules: input.downstreamRules,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async updateProfileRow(input) {
      const updated = await db
        .update(creatorProfiles)
        .set({
          persona: input.persona,
          field: input.field,
          audience: input.audience,
          differentiation: input.differentiation,
          capabilities: input.capabilities,
          facets: input.facets,
          downstreamRules: input.downstreamRules,
          updatedAt: deps.now(),
        })
        .where(eq(creatorProfiles.userId, deps.userId))
        .returning();
      return updated[0]!;
    },

    async listStatements({ limit, offset }) {
      const rows = await db
        .select()
        .from(positioningStatements)
        .where(eq(positioningStatements.userId, deps.userId))
        .orderBy(desc(positioningStatements.versionNumber))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: positioningStatements.id })
        .from(positioningStatements)
        .where(eq(positioningStatements.userId, deps.userId));
      return { rows, total: all.length };
    },

    async getStatement(statementId) {
      const rows = await db
        .select()
        .from(positioningStatements)
        .where(
          and(
            eq(positioningStatements.userId, deps.userId),
            eq(positioningStatements.id, statementId),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: positioning statement not found: ${statementId}`,
        );
      }
      return row;
    },

    async getCurrentStatement(profileId) {
      const rows = await db
        .select()
        .from(positioningStatements)
        .where(
          and(
            eq(positioningStatements.userId, deps.userId),
            eq(positioningStatements.profileId, profileId),
          ),
        )
        .orderBy(desc(positioningStatements.versionNumber))
        .limit(1);
      return rows[0];
    },

    async maxVersionNumber(profileId) {
      const rows = await db
        .select({ versionNumber: positioningStatements.versionNumber })
        .from(positioningStatements)
        .where(
          and(
            eq(positioningStatements.userId, deps.userId),
            eq(positioningStatements.profileId, profileId),
          ),
        )
        .orderBy(desc(positioningStatements.versionNumber))
        .limit(1);
      return rows[0]?.versionNumber ?? 0;
    },

    async insertStatement(input) {
      const inserted = await db
        .insert(positioningStatements)
        .values({
          id: deps.nextId("posstmt"),
          userId: deps.userId,
          profileId: input.profileId,
          oneLiner: input.oneLiner,
          keywords: input.keywords,
          productAnchorIds: input.productAnchorIds,
          versionNumber: input.versionNumber,
          createdByType: input.createdByType,
          aiTaskId: input.aiTaskId,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },
  };
}
