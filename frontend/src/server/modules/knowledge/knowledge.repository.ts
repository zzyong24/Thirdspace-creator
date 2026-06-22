import { and, asc, eq, desc, type Db } from "@creatoros/backend";
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
  list(userId: string): Promise<KnowledgeItemRow[]>;
  get(userId: string, knowledgeId: string): Promise<KnowledgeItemRow>;
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
    input: { title: string; knowledgeType?: string; content?: string },
  ): Promise<KnowledgeItemRow>;
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
}

function parseRelation(row: KnowledgeRelationDbRow): KnowledgeRelationRow {
  return { ...row, strength: Number(row.strength) };
}

export function createKnowledgeRepository(
  db: Db,
  deps: RepoDeps,
): KnowledgeRepository {
  async function get(
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
      return db
        .select()
        .from(knowledgeItems)
        .where(eq(knowledgeItems.userId, userId))
        .orderBy(asc(knowledgeItems.createdAt));
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
      await get(userId, rev.knowledgeItemId);
      return rev;
    },

    async listRevisions(userId, knowledgeId) {
      // Ownership gate on the parent item (cross-user / unknown id → 404, no
      // leak). Newest revision first so the caller can read the current head
      // (highest revisionNumber) as rows[0] without re-querying the item.
      await get(userId, knowledgeId);
      return db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.knowledgeItemId, knowledgeId))
        .orderBy(desc(knowledgeRevisions.revisionNumber));
    },

    async listRelations(userId, knowledgeId) {
      // Ownership gate on the source item.
      await get(userId, knowledgeId);
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
      await get(userId, knowledgeId);

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
      await get(userId, sourceKnowledgeId);
      await get(userId, input.targetKnowledgeId);

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
  };
}
