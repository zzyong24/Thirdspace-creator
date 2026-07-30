import { and, desc, eq, sql, type Db } from "@creatoros/backend";
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
  // [T-332 S2 · ISO-02/03] 第二所有权维度,**必填 strict**:每号一套定位母版
  // (UNIQUE(user_id, account_id)),读门恒叠 eq(account_id),写路径盖章当前号。
  // 未选号在 service 入口 requireAccountId 即被拒(SPEC §4.2 引导态),无退化分支。
  accountId: string;
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
  // [T-231⑥] 修改原因(团队留痕);缺省/"" = 未填。行不可变,只在 INSERT 时写入。
  changeReason?: string;
}

export interface PositioningRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedProfiles(rows: CreatorProfileRow[]): Promise<void>;
  seedStatements(rows: PositioningStatementRow[]): Promise<void>;

  // Profile reads/writes (mutable, one per user).
  getProfile(): Promise<CreatorProfileRow | undefined>;
  insertProfile(input: InsertProfileInput): Promise<CreatorProfileRow>;
  updateProfileRow(input: UpdateProfileInput): Promise<CreatorProfileRow>;
  resetProfileRow(profileId: string): Promise<CreatorProfileRow>;
  clearStatusNoteIfMatches(
    profileId: string,
    expectedStatusNote: string,
  ): Promise<boolean>;

  // Statement reads (immutable version chain).
  listStatements(page: {
    limit: number;
    offset: number;
  }): Promise<{ rows: PositioningStatementRow[]; total: number }>;
  getStatement(statementId: string): Promise<PositioningStatementRow>;
  getCurrentStatement(
    profileId: string,
    statementVersionFloor: number,
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
        .where(
          and(
            eq(creatorProfiles.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠(每号一套母版)。
            eq(creatorProfiles.accountId, deps.accountId),
          ),
        );
      return rows[0];
    },

    async insertProfile(input) {
      const inserted = await db
        .insert(creatorProfiles)
        .values({
          id: deps.nextId("profile"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 每号一套定位母版:stamp 当前号(必填)。复合唯一
          // UNIQUE(user_id, account_id) —— 建第二号 profile 不撞第一号。
          accountId: deps.accountId,
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
        .where(
          and(
            eq(creatorProfiles.userId, deps.userId),
            // [T-332 S2 · ISO-02] 只更新当前号的母版(strict,无退化)。
            eq(creatorProfiles.accountId, deps.accountId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async resetProfileRow(profileId) {
      // 一个 UPDATE 同时清空可变母版并把当前最大不可变版本记为 floor，避免“先读 max、
      // 再更新 profile”之间插入新版本造成竞态。
      const versionFloor = sql<number>`COALESCE((
        SELECT MAX(${positioningStatements.versionNumber})
        FROM ${positioningStatements}
        WHERE ${positioningStatements.userId} = ${deps.userId}
          AND ${positioningStatements.accountId} = ${deps.accountId}
          AND ${positioningStatements.profileId} = ${profileId}
      ), 0)`;
      const updated = await db
        .update(creatorProfiles)
        .set({
          persona: "",
          field: "",
          audience: "",
          differentiation: "",
          capabilities: [],
          facets: {
            contentScope: "",
            avoid: "",
            corePain: "",
            coreValue: "",
            tone: "",
            statusNote: "",
          },
          downstreamRules: {
            topicRule: "",
            scriptRule: "",
            projectRule: "",
            forbidRule: "",
            expressionRule: "",
          },
          statementVersionFloor: versionFloor,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(creatorProfiles.id, profileId),
            eq(creatorProfiles.userId, deps.userId),
            eq(creatorProfiles.accountId, deps.accountId),
          ),
        )
        .returning();
      const row = updated[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: creator profile not found: ${profileId}`,
        );
      }
      return row;
    },

    async clearStatusNoteIfMatches(profileId, expectedStatusNote) {
      const updated = await db
        .update(creatorProfiles)
        .set({
          facets: sql`jsonb_set(${creatorProfiles.facets}, '{statusNote}', '""'::jsonb, true)`,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(creatorProfiles.id, profileId),
            eq(creatorProfiles.userId, deps.userId),
            eq(creatorProfiles.accountId, deps.accountId),
            // CAS：只清掉刚刚判定过的那一版；若用户并发修改，0 行更新，不覆盖新值。
            sql`${creatorProfiles.facets} ->> 'statusNote' = ${expectedStatusNote}`,
          ),
        )
        .returning({ id: creatorProfiles.id });
      return updated.length === 1;
    },

    async listStatements({ limit, offset }) {
      // [T-332 S2 · ISO-02] statement 承 profile 的号;读门 strict 恒叠。
      const scope = and(
        eq(positioningStatements.userId, deps.userId),
        eq(positioningStatements.accountId, deps.accountId),
      );
      const rows = await db
        .select()
        .from(positioningStatements)
        .where(scope)
        .orderBy(desc(positioningStatements.versionNumber))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: positioningStatements.id })
        .from(positioningStatements)
        .where(scope);
      return { rows, total: all.length };
    },

    async getStatement(statementId) {
      const rows = await db
        .select()
        .from(positioningStatements)
        .where(
          and(
            eq(positioningStatements.userId, deps.userId),
            // [T-332 S2 · §4.5 by-id 门] strict:跨号 statement 与未知 id 同样 404。
            eq(positioningStatements.accountId, deps.accountId),
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

    async getCurrentStatement(profileId, statementVersionFloor) {
      const rows = await db
        .select()
        .from(positioningStatements)
        .where(
          and(
            eq(positioningStatements.userId, deps.userId),
            eq(positioningStatements.accountId, deps.accountId),
            eq(positioningStatements.profileId, profileId),
            sql`${positioningStatements.versionNumber} > ${statementVersionFloor}`,
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
            eq(positioningStatements.accountId, deps.accountId),
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
          // [T-332 S2 · ISO-03] statement 承 profile 的号(stamp 当前号;必填)。
          accountId: deps.accountId,
          profileId: input.profileId,
          oneLiner: input.oneLiner,
          keywords: input.keywords,
          productAnchorIds: input.productAnchorIds,
          versionNumber: input.versionNumber,
          createdByType: input.createdByType,
          aiTaskId: input.aiTaskId,
          // [T-231⑥] 修改原因留痕落列(缺省 = "" 未填)。
          changeReason: input.changeReason ?? "",
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },
  };
}
