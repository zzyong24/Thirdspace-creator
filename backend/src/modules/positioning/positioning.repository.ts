import {workspaceFilter,workspaceStamp} from "@creatoros/backend";
import { and, desc, eq, isNull, sql, type Db } from "@creatoros/backend";
import {
  creatorProfiles,
  positioningDiscoverySessions,
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
export type PositioningDiscoverySessionRow =
  typeof positioningDiscoverySessions.$inferSelect;

export interface DiscoveryAnswerInput {
  themeId: string;
  selectedOptionIds: string[];
  customText: string;
  skipped: boolean;
  updatedAt: string;
}

export interface DiscoveryWebReferenceInput {
  id: string;
  title: string;
  url: string;
  snippet: string;
  query: string;
  purpose: string;
  targetThemeId: string;
  market: "cn" | "global";
  language: "zh-CN" | "any";
  adopted: boolean;
}

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-332 S2 · ISO-02/03] 第二所有权维度,**必填 strict**:每号一套定位母版
  // (UNIQUE(user_id, account_id)),读门恒叠 eq(account_id),写路径盖章当前号。
  // 未选号在 service 入口 requireAccountId 即被拒(SPEC §4.2 引导态),无退化分支。
  accountId: string|null;
  groupId?:string|null;
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
  masterSnapshot?: PositioningMasterSnapshotInput | null;
}

export interface PositioningMasterSnapshotInput {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  facets: ProfileFacetsInput;
  downstreamRules: ProfileDownstreamRulesInput;
}

export interface RestoreMasterResultRow {
  profile: CreatorProfileRow;
  statement: PositioningStatementRow;
  restoredFromVersion: number;
}

export interface ConfirmDiscoveryCandidateInput {
  sessionId: string;
  candidateId: string;
  candidateRevision: number;
  expectedCurrentStatementId: string | null;
  idempotencyKey: string;
  proposal: InsertProfileInput & {
    oneLiner: string;
    keywords: string[];
    productAnchorIds: string[];
  };
}

export interface ConfirmDiscoveryCandidateResultRow {
  profile: CreatorProfileRow;
  statement: PositioningStatementRow;
  session: PositioningDiscoverySessionRow;
  replayed: boolean;
}

export interface PositioningRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedProfiles(rows: CreatorProfileRow[]): Promise<void>;
  seedStatements(rows: PositioningStatementRow[]): Promise<void>;

  // Profile reads/writes (mutable, one per user).
  getProfile(): Promise<CreatorProfileRow | undefined>;
  insertProfile(input: InsertProfileInput): Promise<CreatorProfileRow>;
  updateProfileRow(input: UpdateProfileInput): Promise<CreatorProfileRow>;
  archiveAndResetProfileRow(
    profileId: string,
    snapshot: PositioningMasterSnapshotInput,
  ): Promise<CreatorProfileRow>;
  restoreMasterFromStatement(
    statementId: string,
    snapshot: PositioningMasterSnapshotInput,
  ): Promise<RestoreMasterResultRow>;
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

  // 前采工作区：不是正式定位真相；全部读写仍按 user + account 双重收窄。
  getActiveDiscoverySession(): Promise<PositioningDiscoverySessionRow | undefined>;
  getDiscoverySession(sessionId: string): Promise<PositioningDiscoverySessionRow>;
  startDiscoverySession(input: {
    sourceMode: "optimize" | "pivot" | "scratch";
    inputManifest: {
      legacyProfileId: string | null;
      legacyStatementIds: string[];
      legacyWorkIds: string[];
    };
  }): Promise<PositioningDiscoverySessionRow>;
  updateDiscoveryAnswer(input: {
    sessionId: string;
    expectedRevision: number;
    answer: DiscoveryAnswerInput;
  }): Promise<PositioningDiscoverySessionRow | undefined>;
  replaceDiscoveryWebReferences(input: {
    sessionId: string;
    expectedRevision: number;
    references: DiscoveryWebReferenceInput[];
  }): Promise<PositioningDiscoverySessionRow | undefined>;
  setDiscoveryEvidence(input: {
    sessionId: string;
    evidenceId: string;
    adopted: boolean;
    expectedRevision: number;
  }): Promise<PositioningDiscoverySessionRow | undefined>;
  confirmDiscoveryCandidate(
    input: ConfirmDiscoveryCandidateInput,
  ): Promise<ConfirmDiscoveryCandidateResultRow | undefined>;
}

export function createPositioningRepository(
  db: Db,
  deps: RepoDeps,
): PositioningRepository {
  const snapshotFromProfileRow = (
    row: CreatorProfileRow,
  ): PositioningMasterSnapshotInput => ({
    persona: row.persona,
    field: row.field,
    audience: row.audience,
    differentiation: row.differentiation,
    capabilities: (row.capabilities ?? []) as string[],
    facets: (row.facets ?? {}) as ProfileFacetsInput,
    downstreamRules: (row.downstreamRules ?? {}) as ProfileDownstreamRulesInput,
  });
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    }
    return value;
  };
  const sameSnapshot = (left: unknown, right: unknown): boolean =>
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
  const loadDiscoverySession = async (
    sessionId: string,
  ): Promise<PositioningDiscoverySessionRow> => {
    const rows = await db
      .select()
      .from(positioningDiscoverySessions)
      .where(
        and(
          eq(positioningDiscoverySessions.id, sessionId),
          eq(positioningDiscoverySessions.userId, deps.userId),
          workspaceFilter(positioningDiscoverySessions,deps),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new OwnershipError(
        `OwnershipError: positioning discovery session not found: ${sessionId}`,
      );
    }
    return rows[0];
  };

  // SEMANTIC_BOUNDARY_ALLOW: 当前陈述由用户明确选择的 ID 决定，不进行语义匹配。
  async function readCurrent(handle:Db,profile:CreatorProfileRow):Promise<PositioningStatementRow|undefined> {
    const rows=await handle.select().from(positioningStatements).where(and(
      eq(positioningStatements.userId,deps.userId),workspaceFilter(positioningStatements,deps),eq(positioningStatements.profileId,profile.id),
      profile.currentStatementId!==null?eq(positioningStatements.id,profile.currentStatementId):sql`${positioningStatements.versionNumber} > ${profile.statementVersionFloor}`,
    )).orderBy(desc(positioningStatements.versionNumber)).limit(1);
    // 有指针却找不到 owned 陈述时返回空，禁止悄悄改选别的版本。
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
      const rows = await db
        .select()
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠(每号一套母版)。
            workspaceFilter(creatorProfiles,deps),
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
          ...workspaceStamp(deps),
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
            workspaceFilter(creatorProfiles,deps),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async archiveAndResetProfileRow(profileId, snapshot) {
      return db.transaction(async (tx) => {
        const profileRows = await tx
          .select()
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              eq(creatorProfiles.userId, deps.userId),
              workspaceFilter(creatorProfiles,deps),
            ),
          );
        const profile = profileRows[0];
        if (!profile) {
          throw new OwnershipError(
            `OwnershipError: creator profile not found: ${profileId}`,
          );
        }

        const current = await readCurrent(tx as unknown as Db,profile);
        if (current) {
          if (current.masterSnapshot == null) {
            // 只写一次补齐旧版元数据；不改陈述正文、关键词、锚点或版本号。
            await tx
              .update(positioningStatements)
              .set({ masterSnapshot: snapshot })
              .where(
                and(
                  eq(positioningStatements.id, current.id),
                  eq(positioningStatements.userId, deps.userId),
                  workspaceFilter(positioningStatements,deps),
                  isNull(positioningStatements.masterSnapshot),
                ),
              );
          } else if (!sameSnapshot(current.masterSnapshot, snapshot)) {
            // 陈述保存后 profile 又被编辑：追加一条重置前备份，绝不改写旧版本的历史含义。
            const maxRows = await tx
              .select({ versionNumber: positioningStatements.versionNumber })
              .from(positioningStatements)
              .where(
                and(
                  eq(positioningStatements.userId, deps.userId),
                  workspaceFilter(positioningStatements,deps),
                  eq(positioningStatements.profileId, profileId),
                ),
              )
              .orderBy(desc(positioningStatements.versionNumber))
              .limit(1);
            await tx.insert(positioningStatements).values({
              id: deps.nextId("posstmt"),
              userId: deps.userId,
              ...workspaceStamp(deps),
              profileId,
              oneLiner: current.oneLiner,
              keywords: current.keywords,
              productAnchorIds: current.productAnchorIds,
              versionNumber: (maxRows[0]?.versionNumber ?? 0) + 1,
              createdByType: "human",
              aiTaskId: null,
              changeReason: `重置前自动备份（基于 v${current.versionNumber}）`,
              masterSnapshot: snapshot,
              createdAt: deps.now(),
            });
          }
        }

        // 在同一事务中推进 floor，保证刚补的快照/备份也被划入旧母版历史。
        const versionFloor = sql<number>`COALESCE((
          SELECT MAX(${positioningStatements.versionNumber})
          FROM ${positioningStatements}
          WHERE ${positioningStatements.userId} = ${deps.userId}
            AND ${workspaceFilter(positioningStatements,deps)}
            AND ${positioningStatements.profileId} = ${profileId}
        ), 0)`;
        const updated = await tx
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
            currentStatementId: null,
            updatedAt: deps.now(),
          })
          .where(
            and(
              eq(creatorProfiles.id, profileId),
              eq(creatorProfiles.userId, deps.userId),
              workspaceFilter(creatorProfiles,deps),
            ),
          )
          .returning();
        return updated[0]!;
      });
    },

    async restoreMasterFromStatement(statementId, snapshot) {
      return db.transaction(async (tx) => {
        const sourceRows = await tx
          .select()
          .from(positioningStatements)
          .where(
            and(
              eq(positioningStatements.id, statementId),
              eq(positioningStatements.userId, deps.userId),
              workspaceFilter(positioningStatements,deps),
            ),
          );
        const source = sourceRows[0];
        if (!source) {
          throw new OwnershipError(
            `OwnershipError: positioning statement not found: ${statementId}`,
          );
        }
        const profileRows = await tx
          .select()
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.id, source.profileId),
              eq(creatorProfiles.userId, deps.userId),
              workspaceFilter(creatorProfiles,deps),
            ),
          );
        const profile = profileRows[0];
        if (!profile) {
          throw new OwnershipError(
            `OwnershipError: creator profile not found: ${source.profileId}`,
          );
        }

        const restoredProfiles = await tx
          .update(creatorProfiles)
          .set({
            currentStatementId: source.id,
            persona: snapshot.persona,
            field: snapshot.field,
            audience: snapshot.audience,
            differentiation: snapshot.differentiation,
            capabilities: snapshot.capabilities,
            facets: snapshot.facets,
            downstreamRules: snapshot.downstreamRules,
            updatedAt: deps.now(),
          })
          .where(
            and(
              eq(creatorProfiles.id, profile.id),
              eq(creatorProfiles.userId, deps.userId),
              workspaceFilter(creatorProfiles,deps),
            ),
          )
          .returning();
        return {
          profile: restoredProfiles[0]!,
          statement: source,
          restoredFromVersion: source.versionNumber,
        };
      });
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
            workspaceFilter(creatorProfiles,deps),
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
        workspaceFilter(positioningStatements,deps),
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
            workspaceFilter(positioningStatements,deps),
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

    async getCurrentStatement(profileId, _statementVersionFloor) {
      const [profile]=await db.select().from(creatorProfiles).where(and(eq(creatorProfiles.id,profileId),eq(creatorProfiles.userId,deps.userId),workspaceFilter(creatorProfiles,deps))).limit(1);
      return profile?readCurrent(db,profile):undefined;
    },

    async maxVersionNumber(profileId) {
      const rows = await db
        .select({ versionNumber: positioningStatements.versionNumber })
        .from(positioningStatements)
        .where(
          and(
            eq(positioningStatements.userId, deps.userId),
            workspaceFilter(positioningStatements,deps),
            eq(positioningStatements.profileId, profileId),
          ),
        )
        .orderBy(desc(positioningStatements.versionNumber))
        .limit(1);
      return rows[0]?.versionNumber ?? 0;
    },

    async insertStatement(input) {
      return db.transaction(async tx=>{
      const inserted = await tx
        .insert(positioningStatements)
        .values({
          id: deps.nextId("posstmt"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] statement 承 profile 的号(stamp 当前号;必填)。
          ...workspaceStamp(deps),
          profileId: input.profileId,
          oneLiner: input.oneLiner,
          keywords: input.keywords,
          productAnchorIds: input.productAnchorIds,
          versionNumber: input.versionNumber,
          createdByType: input.createdByType,
          aiTaskId: input.aiTaskId,
          // [T-231⑥] 修改原因留痕落列(缺省 = "" 未填)。
          changeReason: input.changeReason ?? "",
          masterSnapshot: input.masterSnapshot ?? null,
          createdAt: deps.now(),
        })
        .returning();
      await tx.update(creatorProfiles).set({currentStatementId:inserted[0]!.id,updatedAt:deps.now()}).where(and(eq(creatorProfiles.id,input.profileId),eq(creatorProfiles.userId,deps.userId),workspaceFilter(creatorProfiles,deps)));
      return inserted[0]!;
      });
    },

    async getActiveDiscoverySession() {
      const rows = await db
        .select()
        .from(positioningDiscoverySessions)
        .where(
          and(
            eq(positioningDiscoverySessions.userId, deps.userId),
            workspaceFilter(positioningDiscoverySessions,deps),
            sql`${positioningDiscoverySessions.status} IN ('draft', 'ready')`,
          ),
        )
        .orderBy(desc(positioningDiscoverySessions.updatedAt))
        .limit(1);
      return rows[0];
    },

    async getDiscoverySession(sessionId) {
      return loadDiscoverySession(sessionId);
    },

    async startDiscoverySession(input) {
      return db.transaction(async (tx) => {
        const now = deps.now();
        await tx
          .update(positioningDiscoverySessions)
          .set({ status: "abandoned", updatedAt: now })
          .where(
            and(
              eq(positioningDiscoverySessions.userId, deps.userId),
              workspaceFilter(positioningDiscoverySessions,deps),
              sql`${positioningDiscoverySessions.status} IN ('draft', 'ready')`,
            ),
          );
        const rows = await tx
          .insert(positioningDiscoverySessions)
          .values({
            id: deps.nextId("posdisc"),
            userId: deps.userId,
            ...workspaceStamp(deps),
            sourceMode: input.sourceMode,
            status: "draft",
            answers: [],
            webReferences: [],
            inputManifest: input.inputManifest,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return rows[0]!;
      });
    },

    async updateDiscoveryAnswer(input) {
      const current = await loadDiscoverySession(input.sessionId);
      if (current.revision !== input.expectedRevision) return undefined;
      const answers = ((current.answers ?? []) as DiscoveryAnswerInput[]).filter(
        (answer) => answer.themeId !== input.answer.themeId,
      );
      answers.push(input.answer);
      const answeredThemeCount = new Set(answers.map((answer) => answer.themeId)).size;
      const rows = await db
        .update(positioningDiscoverySessions)
        .set({
          answers,
          status: answeredThemeCount >= 6 ? "ready" : "draft",
          revision: current.revision + 1,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(positioningDiscoverySessions.id, input.sessionId),
            eq(positioningDiscoverySessions.userId, deps.userId),
            workspaceFilter(positioningDiscoverySessions,deps),
            eq(positioningDiscoverySessions.revision, input.expectedRevision),
            sql`${positioningDiscoverySessions.status} IN ('draft', 'ready')`,
          ),
        )
        .returning();
      return rows[0];
    },

    async replaceDiscoveryWebReferences(input) {
      const current = await loadDiscoverySession(input.sessionId);
      if (current.revision !== input.expectedRevision) return undefined;
      const previous = (current.webReferences ?? []) as DiscoveryWebReferenceInput[];
      // 二次搜索只替换上一批“未采用候选”；用户已经明确采用的证据继续保留。
      const byUrl = new Map(
        previous
          .filter((item) => item.adopted)
          .map((item) => [item.url, item] as const),
      );
      for (const item of input.references) {
        if (!byUrl.has(item.url)) byUrl.set(item.url, item);
      }
      const rows = await db
        .update(positioningDiscoverySessions)
        .set({
          webReferences: [...byUrl.values()],
          revision: current.revision + 1,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(positioningDiscoverySessions.id, input.sessionId),
            eq(positioningDiscoverySessions.userId, deps.userId),
            workspaceFilter(positioningDiscoverySessions,deps),
            eq(positioningDiscoverySessions.revision, input.expectedRevision),
            sql`${positioningDiscoverySessions.status} IN ('draft', 'ready')`,
          ),
        )
        .returning();
      return rows[0];
    },

    async setDiscoveryEvidence(input) {
      const current = await loadDiscoverySession(input.sessionId);
      if (current.revision !== input.expectedRevision) return undefined;
      let found = false;
      const references = (
        (current.webReferences ?? []) as DiscoveryWebReferenceInput[]
      ).map((item) => {
        if (item.id !== input.evidenceId) return item;
        found = true;
        return { ...item, adopted: input.adopted };
      });
      if (!found) {
        throw new OwnershipError(
          `OwnershipError: discovery evidence not found: ${input.evidenceId}`,
        );
      }
      const rows = await db
        .update(positioningDiscoverySessions)
        .set({
          webReferences: references,
          revision: current.revision + 1,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(positioningDiscoverySessions.id, input.sessionId),
            eq(positioningDiscoverySessions.userId, deps.userId),
            workspaceFilter(positioningDiscoverySessions,deps),
            eq(positioningDiscoverySessions.revision, input.expectedRevision),
            sql`${positioningDiscoverySessions.status} IN ('draft', 'ready')`,
          ),
        )
        .returning();
      return rows[0];
    },

    async confirmDiscoveryCandidate(input) {
      return db.transaction(async (tx) => {
        const sessionRows = await tx
          .select()
          .from(positioningDiscoverySessions)
          .where(
            and(
              eq(positioningDiscoverySessions.id, input.sessionId),
              eq(positioningDiscoverySessions.userId, deps.userId),
              workspaceFilter(positioningDiscoverySessions,deps),
            ),
          )
          .limit(1);
        const session = sessionRows[0];
        if (!session) {
          throw new OwnershipError(
            `OwnershipError: positioning discovery session not found: ${input.sessionId}`,
          );
        }

        // 网络重试或重复点击：同一幂等键、或同一候选，都返回第一次成功的同一版本。
        if (
          session.status === "adopted" &&
          (session.confirmIdempotencyKey === input.idempotencyKey ||
            session.adoptedCandidateId === input.candidateId) &&
          session.adoptedStatementId
        ) {
          const statementRows = await tx
            .select()
            .from(positioningStatements)
            .where(
              and(
                eq(positioningStatements.id, session.adoptedStatementId),
                eq(positioningStatements.userId, deps.userId),
                workspaceFilter(positioningStatements,deps),
              ),
            )
            .limit(1);
          const statement = statementRows[0];
          if (!statement) return undefined;
          const profileRows = await tx
            .select()
            .from(creatorProfiles)
            .where(
              and(
                eq(creatorProfiles.id, statement.profileId),
                eq(creatorProfiles.userId, deps.userId),
                workspaceFilter(creatorProfiles,deps),
              ),
            )
            .limit(1);
          if (!profileRows[0]) return undefined;
          return {
            profile: profileRows[0],
            statement,
            session,
            replayed: true,
          };
        }

        if (
          (session.status !== "draft" && session.status !== "ready") ||
          session.revision !== input.candidateRevision
        ) {
          return undefined;
        }

        const profileRows = await tx
          .select()
          .from(creatorProfiles)
          .where(
            and(
              eq(creatorProfiles.userId, deps.userId),
              workspaceFilter(creatorProfiles,deps),
            ),
          )
          .limit(1);
        const existingProfile = profileRows[0];
        const current = existingProfile?await readCurrent(tx as unknown as Db,existingProfile):undefined;
        if (
          (current?.id ?? null) !== input.expectedCurrentStatementId
        ) {
          return undefined;
        }

        const statementId = deps.nextId("posstmt");
        const claimedRows = await tx
          .update(positioningDiscoverySessions)
          .set({
            status: "adopted",
            adoptedCandidateId: input.candidateId,
            adoptedStatementId: statementId,
            confirmIdempotencyKey: input.idempotencyKey,
            revision: session.revision + 1,
            updatedAt: deps.now(),
          })
          .where(
            and(
              eq(positioningDiscoverySessions.id, input.sessionId),
              eq(positioningDiscoverySessions.userId, deps.userId),
              workspaceFilter(positioningDiscoverySessions,deps),
              eq(positioningDiscoverySessions.revision, input.candidateRevision),
              sql`${positioningDiscoverySessions.status} IN ('draft', 'ready')`,
            ),
          )
          .returning();
        if (!claimedRows[0]) return undefined;

        const profile = existingProfile
          ? (
              await tx
                .update(creatorProfiles)
                .set({
                  currentStatementId: statementId,
                  persona: input.proposal.persona,
                  field: input.proposal.field,
                  audience: input.proposal.audience,
                  differentiation: input.proposal.differentiation,
                  capabilities: input.proposal.capabilities,
                  facets: input.proposal.facets,
                  downstreamRules: input.proposal.downstreamRules,
                  updatedAt: deps.now(),
                })
                .where(
                  and(
                    eq(creatorProfiles.id, existingProfile.id),
                    eq(creatorProfiles.userId, deps.userId),
                    workspaceFilter(creatorProfiles,deps),
                  ),
                )
                .returning()
            )[0]!
          : (
              await tx
                .insert(creatorProfiles)
                .values({
                  id: deps.nextId("profile"),
                  userId: deps.userId,
                  ...workspaceStamp(deps),
                  currentStatementId: statementId,
                  persona: input.proposal.persona,
                  field: input.proposal.field,
                  audience: input.proposal.audience,
                  differentiation: input.proposal.differentiation,
                  capabilities: input.proposal.capabilities,
                  facets: input.proposal.facets,
                  downstreamRules: input.proposal.downstreamRules,
                  createdAt: deps.now(),
                  updatedAt: deps.now(),
                })
                .returning()
            )[0]!;

        const maxRows = await tx
          .select({ versionNumber: positioningStatements.versionNumber })
          .from(positioningStatements)
          .where(
            and(
              eq(positioningStatements.userId, deps.userId),
              workspaceFilter(positioningStatements,deps),
              eq(positioningStatements.profileId, profile.id),
            ),
          )
          .orderBy(desc(positioningStatements.versionNumber))
          .limit(1);
        const statementRows = await tx
          .insert(positioningStatements)
          .values({
            id: statementId,
            userId: deps.userId,
            ...workspaceStamp(deps),
            profileId: profile.id,
            oneLiner: input.proposal.oneLiner,
            keywords: input.proposal.keywords,
            productAnchorIds: input.proposal.productAnchorIds,
            versionNumber: (maxRows[0]?.versionNumber ?? 0) + 1,
            createdByType: "ai",
            aiTaskId: null,
            changeReason: "定位前采采纳",
            masterSnapshot: {
              persona: input.proposal.persona,
              field: input.proposal.field,
              audience: input.proposal.audience,
              differentiation: input.proposal.differentiation,
              capabilities: input.proposal.capabilities,
              facets: input.proposal.facets,
              downstreamRules: input.proposal.downstreamRules,
            },
            createdAt: deps.now(),
          })
          .returning();
        return {
          profile,
          statement: statementRows[0]!,
          session: claimedRows[0],
          replayed: false,
        };
      });
    },
  };
}
