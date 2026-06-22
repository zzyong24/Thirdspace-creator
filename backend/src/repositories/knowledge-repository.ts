import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import {
  knowledgeItems,
  knowledgeRevisions,
  knowledgeRelations,
} from "../schema/knowledge";

// Injected dependencies — mirrors project-repository's RepoDeps so the repo stays
// deterministic (no Date.now / Math.random / fetch inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type KnowledgeType = "note" | "reference" | "inspiration" | "snippet" | "transcript";

type ItemRow = typeof knowledgeItems.$inferSelect;
type RevisionRow = typeof knowledgeRevisions.$inferSelect;
type RelationRow = typeof knowledgeRelations.$inferSelect;

// `strength` is stored as a decimal string (schema note) — Number()-parse on read
// so the DTO stays numeric (knowledgeRelationResource.strength is z.number()).
type RelationDto = Omit<RelationRow, "strength"> & { strength: number };

const toRelationDto = (row: RelationRow): RelationDto => ({
  ...row,
  strength: Number(row.strength),
});

export interface KnowledgeRepository {
  seedItems(rows: ItemRow[]): Promise<void>;
  list(): Promise<ItemRow[]>;
  get(knowledgeId: string): Promise<ItemRow>;
  create(input: {
    title: string;
    knowledgeType?: KnowledgeType;
    content?: string;
  }): Promise<ItemRow>;
  createRevision(
    knowledgeId: string,
    input: { content: string },
  ): Promise<RevisionRow>;
  listRevisions(knowledgeId: string): Promise<RevisionRow[]>;
  createRelation(
    knowledgeId: string,
    input: { targetKnowledgeId: string; relationType: string },
  ): Promise<RelationDto>;
}

export function createKnowledgeRepository(
  db: Db,
  deps: RepoDeps,
): KnowledgeRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project-repository uses for cross-user / missing rows.
  async function get(knowledgeId: string): Promise<ItemRow> {
    const rows = await db
      .select()
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.id, knowledgeId),
          eq(knowledgeItems.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: knowledge not found: ${knowledgeId}`);
    }
    return row;
  }

  return {
    async seedItems(rows) {
      if (rows.length === 0) return;
      await db.insert(knowledgeItems).values(rows).onConflictDoNothing();
    },

    async list() {
      return db
        .select()
        .from(knowledgeItems)
        .where(eq(knowledgeItems.userId, deps.userId))
        .orderBy(asc(knowledgeItems.createdAt));
    },

    get,

    // create mints the item AND its first revision (#1), then repoints
    // currentRevisionId at that revision. Append-only invariant starts here.
    async create({ title, knowledgeType, content }) {
      const ts = deps.now();
      const itemId = deps.nextId("knowledge");
      const revisionId = deps.nextId("revision");

      await db.insert(knowledgeRevisions).values({
        id: revisionId,
        knowledgeItemId: itemId,
        revisionNumber: 1,
        content: content ?? "",
        structuredData: {},
        createdAt: ts,
      });

      const inserted = await db
        .insert(knowledgeItems)
        .values({
          id: itemId,
          userId: deps.userId,
          currentRevisionId: revisionId,
          knowledgeType: knowledgeType ?? "note",
          title,
          sourceType: "manual",
          sourceUrl: null,
          sourceMetadata: {},
          status: "active",
          archivedAt: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    // An edit APPENDS a new revision with a monotonically increasing number and
    // repoints currentRevisionId. It NEVER updates an existing revision row.
    async createRevision(knowledgeId, { content }) {
      await get(knowledgeId); // ownership + existence gate
      const ts = deps.now();

      const latest = await db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.knowledgeItemId, knowledgeId))
        .orderBy(desc(knowledgeRevisions.revisionNumber))
        .limit(1);
      const nextNumber = (latest[0]?.revisionNumber ?? 0) + 1;

      const revisionId = deps.nextId("revision");
      const inserted = await db
        .insert(knowledgeRevisions)
        .values({
          id: revisionId,
          knowledgeItemId: knowledgeId,
          revisionNumber: nextNumber,
          content,
          structuredData: {},
          createdAt: ts,
        })
        .returning();

      // Repoint the item at the freshly appended revision; old rows untouched.
      await db
        .update(knowledgeItems)
        .set({ currentRevisionId: revisionId, updatedAt: ts })
        .where(eq(knowledgeItems.id, knowledgeId));

      return inserted[0]!;
    },

    async listRevisions(knowledgeId) {
      await get(knowledgeId); // ownership + existence gate
      return db
        .select()
        .from(knowledgeRevisions)
        .where(eq(knowledgeRevisions.knowledgeItemId, knowledgeId))
        .orderBy(asc(knowledgeRevisions.revisionNumber));
    },

    async createRelation(knowledgeId, { targetKnowledgeId, relationType }) {
      await get(knowledgeId); // caller must own the source item
      const inserted = await db
        .insert(knowledgeRelations)
        .values({
          id: deps.nextId("relation"),
          sourceKnowledgeId: knowledgeId,
          targetKnowledgeId,
          relationType,
          strength: "1",
          createdByType: "user",
        })
        .returning();
      return toRelationDto(inserted[0]!);
    },
  };
}
