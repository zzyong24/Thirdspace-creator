import { and, asc, eq, desc, type Db } from "@creatoros/backend";
import {
  artifacts,
  artifactVersions,
  artifactRelations,
  scriptSections,
  timelineSegments,
} from "./artifacts.db-schema";
import { OwnershipError } from "./artifacts.errors";

// Artifacts repository (foundation §5.2) — user-scoped queries ONLY. `user_id`
// lives on the owned-root row (`artifacts`); every read/write of an artifact row
// filters `eq(artifacts.userId, deps.userId)`. The single ownership gate is the
// private `requireArtifact(artifactId)` — every child-table method calls it
// first, so child rows (versions / relations / structured tables) are never
// reachable cross-user (foundation §2, SPEC §14: cross-user → OwnershipError 404,
// never 403).
//
// `userId` is baked into `deps` (one repo instance per ctx) — the service builds
// a fresh repo per request via `repoFor(ctx)`. The clock/id generator are
// injected for deterministic tests.
//
// data-model §9 invariants enforced here:
//  - create mints version #1 and sets currentVersionId (born `drafting`).
//  - createVersion appends the next version (max+1), repoints currentVersionId,
//    and NEVER UPDATE/DELETE an existing artifact_versions row (rule 6).
//  - restore only moves currentVersionId to an existing immutable version. It
//    never mutates that version and never manufactures a duplicate revision.

export type ArtifactRow = typeof artifacts.$inferSelect;
export type ArtifactVersionRow = typeof artifactVersions.$inferSelect;
export type ArtifactRelationRow = typeof artifactRelations.$inferSelect;
export type ScriptSectionRow = typeof scriptSections.$inferSelect;
export type TimelineSegmentRow = typeof timelineSegments.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner — baked in; the service mints one repo per ctx
  // [T-332 S2 · ISO-02/03] 第二属主维度,**必填 strict**:owned-root(artifacts)读点
  // 恒叠 `eq(artifacts.accountId, …)`,create 盖章当前号。未选号在 service 入口
  // requireAccountId 即被拒(SPEC §4.2 引导态)。子表(versions / relations /
  // script_sections / timeline_segments)经 requireArtifact 父锚门透传继承号维。
  accountId: string;
}

export interface StructuredContent {
  scriptSections?: Array<{
    parentSectionId?: string | null;
    sectionType: string;
    title?: string;
    content?: string;
    position?: number;
    startSeconds?: number | null;
    endSeconds?: number | null;
  }>;
  timelineSegments?: Array<{
    scriptSectionId?: string | null;
    title?: string;
    position?: number;
    startMs?: number;
    endMs?: number;
    productionData?: Record<string, unknown>;
  }>;
}

export interface ArtifactRepository {
  seedArtifacts(rows: ArtifactRow[]): Promise<void>;
  seedVersions(rows: ArtifactVersionRow[]): Promise<void>;
  seedRelations(rows: ArtifactRelationRow[]): Promise<void>;
  listByProject(projectId: string): Promise<ArtifactRow[]>;
  requireArtifact(artifactId: string): Promise<ArtifactRow>;
  create(input: {
    projectId: string;
    title: string;
    artifactType: string;
    stage: string;
    contentOutputId?: string | null;
    origin?: "user" | "reconstructed";
  }): Promise<ArtifactRow>;
  createVersion(
    artifactId: string,
    input: {
      contentText?: string;
      changeSummary?: string;
      contentData?: Record<string, unknown>;
      createdByType?: string;
      aiTaskId?: string | null;
      origin?: "user" | "reconstructed";
    },
  ): Promise<ArtifactVersionRow>;
  listVersions(artifactId: string): Promise<ArtifactVersionRow[]>;
  getVersion(versionId: string): Promise<ArtifactVersionRow>;
  restore(artifactId: string, versionId: string): Promise<ArtifactRow>;
  createRelation(
    sourceArtifactId: string,
    input: { targetArtifactId: string; relationType: string },
  ): Promise<ArtifactRelationRow>;
  replaceStructuredContent(
    artifactVersionId: string,
    payload: StructuredContent,
  ): Promise<void>;
  getScriptSections(artifactVersionId: string): Promise<ScriptSectionRow[]>;
}

// F1 origin lifecycle resolver (T-030-D4, SPEC §4.5). Pure — decides the parent
// artifact's `origin` when a NEW current version is minted.
//   - explicit `requested` (auto-fill passes 'reconstructed') wins.
//   - otherwise a user-authored version (createdByType !== 'ai') flips a
//     'reconstructed' artifact back to 'user' (the user edited/confirmed the AI
//     reconstruction → §7 边界② "方视为确认"). Non-reconstructed origins are left
//     as-is; an AI-authored version never confirms, so origin is untouched.
export function resolveNextOrigin(
  current: string | null,
  requested: "user" | "reconstructed" | undefined,
  createdByType: string | undefined,
): string | null {
  if (requested !== undefined) return requested;
  const isUserAuthored = (createdByType ?? "user") !== "ai";
  if (isUserAuthored && current === "reconstructed") return "user";
  return current;
}

export function createArtifactRepository(
  db: Db,
  deps: RepoDeps,
): ArtifactRepository {
  const userId = deps.userId;

  // [T-332 S2 · ISO-02] 按号隔离条件门:strict 恒开(无「null → 退化全量」分支)。
  // 所有 owned-root 读/更新点复用它;子表经 requireArtifact 透传继承。
  const accountGate = eq(artifacts.accountId, deps.accountId);

  async function requireArtifact(artifactId: string): Promise<ArtifactRow> {
    const rows = await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, artifactId),
          eq(artifacts.userId, userId),
          accountGate,
        ),
      );
    const row = rows[0];
    // Cross-user / unknown id is indistinguishable (foundation §2: 404, never
    // reveal existence) → OwnershipError.
    if (!row) throw new OwnershipError("Artifact not found");
    return row;
  }

  // Allocate the next version number for an artifact (max+1, starting at 1).
  async function nextVersionNumber(artifactId: string): Promise<number> {
    const existing = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.versionNumber));
    return (existing[0]?.versionNumber ?? 0) + 1;
  }

  async function insertVersion(
    artifactId: string,
    versionNumber: number,
    input: {
      contentText?: string;
      changeSummary?: string;
      contentData?: Record<string, unknown>;
      createdByType?: string;
      aiTaskId?: string | null;
    },
  ): Promise<ArtifactVersionRow> {
    const now = deps.now();
    const versionId = deps.nextId("artifactversion");
    await db.insert(artifactVersions).values({
      id: versionId,
      artifactId,
      versionNumber,
      contentText: input.contentText ?? "",
      contentData: input.contentData ?? {},
      changeSummary: input.changeSummary ?? "",
      createdByType: input.createdByType ?? "user",
      aiTaskId: input.aiTaskId ?? null,
      createdAt: now,
    });
    const rows = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.id, versionId));
    return rows[0]!;
  }

  return {
    async seedArtifacts(rows) {
      if (rows.length === 0) return;
      await db.insert(artifacts).values(rows).onConflictDoNothing();
    },
    async seedVersions(rows) {
      if (rows.length === 0) return;
      await db.insert(artifactVersions).values(rows).onConflictDoNothing();
    },
    async seedRelations(rows) {
      if (rows.length === 0) return;
      await db.insert(artifactRelations).values(rows).onConflictDoNothing();
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(artifacts)
        .where(
          and(
            eq(artifacts.userId, userId),
            eq(artifacts.projectId, projectId),
            accountGate,
          ),
        )
        .orderBy(asc(artifacts.createdAt));
    },

    requireArtifact,

    async create(input) {
      const now = deps.now();
      const artifactId = deps.nextId("artifact");

      // Insert the artifact first (currentVersionId null), then mint version #1
      // and repoint currentVersionId — one UoW (artifact + version #1 atomically).
      await db.insert(artifacts).values({
        id: artifactId,
        userId,
        // [T-332 S2 · ISO-03] create stamp:落库把行归到当前号(必填,列 NOT NULL)。
        accountId: deps.accountId,
        projectId: input.projectId,
        contentOutputId: input.contentOutputId ?? null,
        currentVersionId: null,
        stage: input.stage,
        artifactType: input.artifactType,
        title: input.title,
        status: "drafting",
        archivedAt: null,
        // F1 (T-030-D4, SPEC §4.5): provenance. Default null ≡ 'user'; auto-fill
        // (reconstruct.project) passes 'reconstructed' as the §5 原则3/§9 铁律2
        // audit tag for AI-history-reconstructed artifacts.
        origin: input.origin ?? null,
        createdAt: now,
        updatedAt: now,
      });
      const version = await insertVersion(artifactId, 1, {
        contentText: "",
        changeSummary: "初稿",
      });
      await db
        .update(artifacts)
        .set({ currentVersionId: version.id, updatedAt: now })
        .where(
          and(
            eq(artifacts.id, artifactId),
            eq(artifacts.userId, userId),
            accountGate,
          ),
        );
      return requireArtifact(artifactId);
    },

    async createVersion(artifactId, input) {
      // Ownership gate: a cross-user / unknown id throws before any write.
      const artifact = await requireArtifact(artifactId);
      const versionNumber = await nextVersionNumber(artifactId);
      const version = await insertVersion(artifactId, versionNumber, input);
      // Promotion is a parent-row pointer move; the version itself is never
      // mutated (append-only, data-model §9 rule 6).
      //
      // F1 origin lifecycle (T-030-D4, SPEC §4.5): the version carries content,
      // the ROOT row carries `origin` (provenance of the CURRENT content). On a
      // new current version we resolve the parent's origin:
      //   - explicit `input.origin` → set it (auto-fill passes 'reconstructed').
      //   - omitted + user-authored version (createdByType !== 'ai') that lands
      //     on a 'reconstructed' artifact → FLIP to 'user' (the user edited/
      //     confirmed the AI reconstruction; §7 边界② "方视为确认").
      //   - omitted + AI version → leave origin untouched (AI edits don't confirm).
      const nextOrigin = resolveNextOrigin(
        artifact.origin,
        input.origin,
        input.createdByType,
      );
      await db
        .update(artifacts)
        .set({
          currentVersionId: version.id,
          origin: nextOrigin,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(artifacts.id, artifactId),
            eq(artifacts.userId, userId),
            accountGate,
          ),
        );
      return version;
    },

    async listVersions(artifactId) {
      await requireArtifact(artifactId);
      return db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.artifactId, artifactId))
        .orderBy(asc(artifactVersions.versionNumber));
    },

    async getVersion(versionId) {
      const rows = await db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.id, versionId));
      const row = rows[0];
      if (!row) throw new OwnershipError("Version not found");
      // Ownership gate: the parent artifact must be owned (throws if not).
      await requireArtifact(row.artifactId);
      return row;
    },

    async restore(artifactId, versionId) {
      const artifact = await requireArtifact(artifactId);
      // Load the target version and assert it belongs to THIS artifact (rule 7).
      const targetRows = await db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.id, versionId));
      const target = targetRows[0];
      if (!target || target.artifactId !== artifactId) {
        throw new OwnershipError("Version not found for this artifact");
      }

      // A restore is a selection of an existing immutable snapshot, not an edit.
      // Move the current pointer directly so browsing/restoring never creates
      // vN+1 noise. A later real save still appends max+1 as usual.
      if (artifact.currentVersionId === target.id) return artifact;
      await db
        .update(artifacts)
        .set({ currentVersionId: target.id, updatedAt: deps.now() })
        .where(
          and(
            eq(artifacts.id, artifactId),
            eq(artifacts.userId, userId),
            accountGate,
          ),
        );
      return requireArtifact(artifactId);
    },

    async createRelation(sourceArtifactId, input) {
      // Both ends must be owned (cross-user link → OwnershipError, no leak).
      await requireArtifact(sourceArtifactId);
      await requireArtifact(input.targetArtifactId);

      const relId = deps.nextId("artifactrelation");
      await db.insert(artifactRelations).values({
        id: relId,
        sourceArtifactId,
        targetArtifactId: input.targetArtifactId,
        relationType: input.relationType,
        createdAt: deps.now(),
      });
      const rows = await db
        .select()
        .from(artifactRelations)
        .where(eq(artifactRelations.id, relId));
      return rows[0]!;
    },

    async replaceStructuredContent(artifactVersionId, payload) {
      // Internal — only ever called when minting a NEW version (the service
      // guards that). Delete-then-insert the structured rows for this version id;
      // version-scoped, so the immutable-plan rule holds (we mutate the just-made
      // version's structured children, never a prior live one).
      // [T-055f] thesis_nodes 退役(迁移 0015 DROP;宪法 §4 修正案)。
      if (payload.scriptSections) {
        await db
          .delete(scriptSections)
          .where(eq(scriptSections.artifactVersionId, artifactVersionId));
        if (payload.scriptSections.length > 0) {
          await db.insert(scriptSections).values(
            payload.scriptSections.map((s) => ({
              id: deps.nextId("scriptsection"),
              artifactVersionId,
              parentSectionId: s.parentSectionId ?? null,
              sectionType: s.sectionType,
              title: s.title ?? "",
              content: s.content ?? "",
              position: s.position ?? 0,
              startSeconds: s.startSeconds ?? null,
              endSeconds: s.endSeconds ?? null,
            })),
          );
        }
      }
      // [T-055f] evidence_links 退役(迁移 0015 DROP)。
      if (payload.timelineSegments) {
        await db
          .delete(timelineSegments)
          .where(eq(timelineSegments.artifactVersionId, artifactVersionId));
        if (payload.timelineSegments.length > 0) {
          await db.insert(timelineSegments).values(
            payload.timelineSegments.map((t) => ({
              id: deps.nextId("timelinesegment"),
              artifactVersionId,
              scriptSectionId: t.scriptSectionId ?? null,
              title: t.title ?? "",
              position: t.position ?? 0,
              startMs: t.startMs ?? 0,
              endMs: t.endMs ?? 0,
              productionData: t.productionData ?? {},
            })),
          );
        }
      }
    },

    async getScriptSections(artifactVersionId) {
      // [T-332 S2 · §4.5 父锚继承核验] 子表无 user_id/account_id,读前必经父锚门:
      // version → 父 artifact requireArtifact(user + account strict)。跨用户/跨号/未知
      // version id 一律 OwnershipError 404,不再依赖「调用方先 getArtifact」的口头约定。
      const versionRows = await db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.id, artifactVersionId));
      const version = versionRows[0];
      if (!version) throw new OwnershipError("Version not found");
      await requireArtifact(version.artifactId);
      return db
        .select()
        .from(scriptSections)
        .where(eq(scriptSections.artifactVersionId, artifactVersionId))
        .orderBy(asc(scriptSections.position));
    },

  };
}
