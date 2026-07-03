import {
  and,
  asc,
  eq,
  desc,
  inArray,
  sql,
  type Db,
  // [T-079a] 战绩投影的只读跨表直查(SPEC §1)。仓内跨模块 seam 惯例是 service 层
  // port(reviews/analytics 的「按 projectId 取窗口」行级 seam),但战绩是全列表
  // grouped 只读统计——按 material-links/analytics 的「共享 schema 直查」惯例
  // (这些表的 canonical 定义本就住共享 infra @creatoros/backend,模块间无 DB FK,
  // 所有权由 user_id 过滤保证),在本 repo 只读 join,不 import 任何其他模块的
  // repository/service(G1 acceptance:无 modules/<other> import)。
  materialLinks,
  contentOutputs,
  publications,
} from "@creatoros/backend";
import {
  knowledgeItems,
  knowledgeRevisions,
  knowledgeRelations,
} from "./knowledge.db-schema";
import { OwnershipError, ConflictError } from "./knowledge.errors";

// Knowledge repository (foundation §5.2) — user-scoped queries ONLY. Every
// read/write filters on the owning item's `userId`; children (revisions/
// relations) inherit ownership via the parent `get` gate (foundation §1/§2,
// SPEC §10/§20). There is NO unscoped select/update.
//
// `userId` comes from RequestContext, passed per-call (NOT baked into deps):
// one repo instance serves all users; the service threads `ctx.userId`. The
// clock/id generator are injected (`deps`) for deterministic tests.
//
// §12 invariants enforced here:
//  - create mints revision #1 and sets currentRevisionId (items born `active`).
//  - createRevision appends the next revision (max+1), repoints
//    currentRevisionId, and NEVER UPDATE/DELETE an existing revision row.

export type KnowledgeItemRow = typeof knowledgeItems.$inferSelect;

// [T-079a] 战绩投影(SPEC §1):usedCount = 用料链(materialLinks,entity_type=
// 'knowledge')反查计数;usedInPublished = 所挂 projectId 存在 status='published'
// 的 publication(material_links.project_id → content_outputs → publications)。
// 只读派生值,非落库列;两条 grouped/inArray 查询一次算齐,无 N+1。
export type KnowledgeItemWithStats = KnowledgeItemRow & {
  usedCount: number;
  usedInPublished: boolean;
};
export type KnowledgeRevisionRow = typeof knowledgeRevisions.$inferSelect;
type KnowledgeRelationDbRow = typeof knowledgeRelations.$inferSelect;

// `strength` is stored as a decimal string; the repo parses it to Number so the
// DTO stays numeric (contract knowledgeRelationResource.strength is z.number()).
export type KnowledgeRelationRow = Omit<KnowledgeRelationDbRow, "strength"> & {
  strength: number;
};

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export interface KnowledgeRepository {
  seedKnowledge(rows: KnowledgeItemRow[]): Promise<void>;
  seedRevisions(rows: KnowledgeRevisionRow[]): Promise<void>;
  seedRelations(rows: KnowledgeRelationDbRow[]): Promise<void>;
  // [T-079a] list/get 返回带战绩投影的行(usedCount/usedInPublished);写路径的
  // 内部所有权门仍走轻量行读,不为门查询付统计成本。
  list(userId: string): Promise<KnowledgeItemWithStats[]>;
  get(userId: string, knowledgeId: string): Promise<KnowledgeItemWithStats>;
  getRevision(
    userId: string,
    revisionId: string,
  ): Promise<KnowledgeRevisionRow>;
  listRevisions(
    userId: string,
    knowledgeId: string,
  ): Promise<KnowledgeRevisionRow[]>;
  listRelations(
    userId: string,
    knowledgeId: string,
  ): Promise<KnowledgeRelationRow[]>;
  create(
    userId: string,
    input: {
      title: string;
      knowledgeType?: string;
      content?: string;
      // [T-079a] 可选出处(SPEC §1),缺省落库 NULL。
      sourceNote?: string | null;
    },
  ): Promise<KnowledgeItemWithStats>;
  createRevision(
    userId: string,
    knowledgeId: string,
    input: { content: string },
  ): Promise<KnowledgeRevisionRow>;
  createRelation(
    userId: string,
    sourceKnowledgeId: string,
    input: { targetKnowledgeId: string; relationType: string },
  ): Promise<KnowledgeRelationRow>;
  archive(userId: string, knowledgeId: string): Promise<KnowledgeItemWithStats>;
  removeRelation(
    userId: string,
    sourceKnowledgeId: string,
    input: { targetKnowledgeId: string; relationType: string },
  ): Promise<KnowledgeRelationRow>;
}

function parseRelation(row: KnowledgeRelationDbRow): KnowledgeRelationRow {
  return { ...row, strength: Number(row.strength) };
}

export function createKnowledgeRepository(
  db: Db,
  deps: RepoDeps,
): KnowledgeRepository {
  // 轻量行读:写路径/子实体的所有权门用它(不付战绩统计成本)。
  async function getRow(
    userId: string,
    knowledgeId: string,
  ): Promise<KnowledgeItemRow> {
    const rows = await db
      .select()
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.id, knowledgeId),
          eq(knowledgeItems.userId, userId),
        ),
      );
    const row = rows[0];
    // Cross-user / unknown id is indistinguishable (foundation §2: 404, never
    // reveal existence) → OwnershipError.
    if (!row) throw new OwnershipError("Knowledge item not found");
    return row;
  }

  // [T-079a] 战绩投影:对一批行一次算齐 usedCount + usedInPublished(两条
  // grouped/inArray 查询,无 N+1)。usedCount = material_links(entity_type=
  // 'knowledge')反查计数;usedInPublished = 该知识所挂任一 projectId 下存在
  // status='published' 的 publication(project → content_outputs → publications,
  // publications 无 project_id 列,经 content_output 归属项目)。全程只读,
  // user_id 过滤保证所有权(见文件头 seam 注释)。
  async function attachStats(
    userId: string,
    rows: KnowledgeItemRow[],
  ): Promise<KnowledgeItemWithStats[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const scope = and(
      eq(materialLinks.userId, userId),
      eq(materialLinks.entityType, "knowledge"),
      inArray(materialLinks.entityId, ids),
    );
    const counts = await db
      .select({
        entityId: materialLinks.entityId,
        n: sql<number>`count(*)::int`,
      })
      .from(materialLinks)
      .where(scope)
      .groupBy(materialLinks.entityId);
    const published = await db
      .selectDistinct({ entityId: materialLinks.entityId })
      .from(materialLinks)
      .innerJoin(
        contentOutputs,
        eq(contentOutputs.projectId, materialLinks.projectId),
      )
      .innerJoin(
        publications,
        and(
          eq(publications.contentOutputId, contentOutputs.id),
          eq(publications.status, "published"),
        ),
      )
      .where(scope);
    const countBy = new Map(counts.map((c) => [c.entityId, c.n]));
    const publishedSet = new Set(published.map((p) => p.entityId));
    return rows.map((row) => ({
      ...row,
      usedCount: countBy.get(row.id) ?? 0,
      usedInPublished: publishedSet.has(row.id),
    }));
  }

  async function get(
    userId: string,
    knowledgeId: string,
  ): Promise<KnowledgeItemWithStats> {
    const row = await getRow(userId, knowledgeId);
    const [withStats] = await attachStats(userId, [row]);
    return withStats!;
  }

  return {
    async seedKnowledge(rows) {
      if (rows.length === 0) return;
      await db.insert(knowledgeItems).values(rows).onConflictDoNothing();
    },
    async seedRevisions(rows) {
      if (rows.length === 0) return;
      await db.insert(knowledgeRevisions).values(rows).onConflictDoNothing();
    },
    async seedRelations(rows) {
      if (rows.length === 0) return;
      await db.insert(knowledgeRelations).values(rows).onConflictDoNothing();
    },

    async list(userId) {
      const rows = await db
        .select()
        .from(knowledgeItems)
        .where(eq(knowledgeItems.userId, userId))
        .orderBy(asc(knowledgeItems.createdAt));
      // [T-079a] 列表带战绩投影(一次 grouped 查询,无 N+1)。
      return attachStats(userId, rows);
    },

    get,

    async getRevision(userId, revisionId) {
      const rows = await db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.id, revisionId));
      const rev = rows[0];
      if (!rev) throw new OwnershipError("Revision not found");
      // Ownership gate: the parent item must be owned by `userId` (throws if not).
      await getRow(userId, rev.knowledgeItemId);
      return rev;
    },

    async listRevisions(userId, knowledgeId) {
      // Ownership gate on the parent item (cross-user / unknown id → 404, no
      // leak). Newest revision first so the caller can read the current head
      // (highest revisionNumber) as rows[0] without re-querying the item.
      await getRow(userId, knowledgeId);
      return db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.knowledgeItemId, knowledgeId))
        .orderBy(desc(knowledgeRevisions.revisionNumber));
    },

    async listRelations(userId, knowledgeId) {
      // Ownership gate on the source item.
      await getRow(userId, knowledgeId);
      const rows = await db
        .select()
        .from(knowledgeRelations)
        .where(eq(knowledgeRelations.sourceKnowledgeId, knowledgeId));
      return rows.map(parseRelation);
    },

    async create(userId, input) {
      const now = deps.now();
      const itemId = deps.nextId("knowledge");
      const revId = deps.nextId("revision");

      // Insert the item first with currentRevisionId already pointing at the
      // about-to-be-inserted revision #1 (UoW: item + revision #1 atomically).
      await db.insert(knowledgeItems).values({
        id: itemId,
        userId,
        currentRevisionId: revId,
        knowledgeType: input.knowledgeType ?? "note",
        title: input.title,
        sourceType: "manual",
        sourceUrl: null,
        sourceMetadata: {},
        status: "active",
        archivedAt: null,
        // [T-079a] 出处一等公民:create 透传,缺省 NULL。
        sourceNote: input.sourceNote ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(knowledgeRevisions).values({
        id: revId,
        knowledgeItemId: itemId,
        revisionNumber: 1,
        content: input.content ?? "",
        structuredData: {},
        createdAt: now,
      });
      return get(userId, itemId);
    },

    async createRevision(userId, knowledgeId, input) {
      // Ownership gate: a cross-user / unknown id throws before any write.
      await getRow(userId, knowledgeId);

      // Allocate the next revision number (max+1, starting at 1). Append-only:
      // we never UPDATE/DELETE an existing revision.
      const existing = await db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.knowledgeItemId, knowledgeId))
        .orderBy(desc(knowledgeRevisions.revisionNumber));
      const nextNumber = (existing[0]?.revisionNumber ?? 0) + 1;

      const now = deps.now();
      const revId = deps.nextId("revision");
      await db.insert(knowledgeRevisions).values({
        id: revId,
        knowledgeItemId: knowledgeId,
        revisionNumber: nextNumber,
        content: input.content,
        structuredData: {},
        createdAt: now,
      });
      // Repoint the item's currentRevisionId + bump updatedAt (the item itself is
      // re-stamped; the prior revision rows are untouched).
      await db
        .update(knowledgeItems)
        .set({ currentRevisionId: revId, updatedAt: now })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      const rows = await db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.id, revId));
      return rows[0]!;
    },

    async createRelation(userId, sourceKnowledgeId, input) {
      // Reject a self-link before touching ownership (cheap guard first).
      if (sourceKnowledgeId === input.targetKnowledgeId) {
        throw new ConflictError("Cannot link a knowledge item to itself");
      }
      // Both ends must be owned (cross-user link → OwnershipError, no leak).
      await getRow(userId, sourceKnowledgeId);
      await getRow(userId, input.targetKnowledgeId);

      const relId = deps.nextId("relation");
      await db.insert(knowledgeRelations).values({
        id: relId,
        sourceKnowledgeId,
        targetKnowledgeId: input.targetKnowledgeId,
        relationType: input.relationType,
        strength: "1",
        createdByType: "user",
      });
      const rows = await db
        .select()
        .from(knowledgeRelations)
        .where(eq(knowledgeRelations.id, relId));
      return parseRelation(rows[0]!);
    },

    async archive(userId, knowledgeId) {
      // Ownership gate (cross-user / unknown id → 404, no leak). The §12-style
      // status transition (active → archived) is enforced by the SERVICE; the
      // repo only stamps the new status + archivedAt + updatedAt. Re-read scoped
      // so a cross-user update surfaces as a no-op (WHERE matched 0 rows).
      await getRow(userId, knowledgeId);
      const now = deps.now();
      await db
        .update(knowledgeItems)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(knowledgeItems.id, knowledgeId),
            eq(knowledgeItems.userId, userId),
          ),
        );
      return get(userId, knowledgeId);
    },

    async removeRelation(userId, sourceKnowledgeId, input) {
      // Ownership gate on the source item (the only end we need to own to drop
      // an outgoing relation; cross-user / unknown id → 404, no leak).
      await getRow(userId, sourceKnowledgeId);
      // Capture the row we're about to delete so the op can echo the removed
      // relation back (mirrors the create op's return shape). A missing relation
      // is a 404 (OwnershipError) — never reveal whether it ever existed.
      const existing = await db
        .select()
        .from(knowledgeRelations)
        .where(
          and(
            eq(knowledgeRelations.sourceKnowledgeId, sourceKnowledgeId),
            eq(knowledgeRelations.targetKnowledgeId, input.targetKnowledgeId),
            eq(knowledgeRelations.relationType, input.relationType),
          ),
        );
      const row = existing[0];
      if (!row) throw new OwnershipError("Relation not found");
      await db
        .delete(knowledgeRelations)
        .where(eq(knowledgeRelations.id, row.id));
      return parseRelation(row);
    },
  };
}
