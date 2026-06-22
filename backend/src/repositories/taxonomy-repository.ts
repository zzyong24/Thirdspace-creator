import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import { tags, entityTags } from "../schema/taxonomy";

// Injected dependencies — mirrors project/knowledge RepoDeps so the repo stays
// deterministic (no Date.now / Math.random / fetch inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type TagEntityType =
  | "project"
  | "artifact"
  | "knowledge"
  | "asset"
  | "learning"
  | "publication";

type TagRow = typeof tags.$inferSelect;
type EntityTagRow = typeof entityTags.$inferSelect;

export interface TaxonomyRepository {
  seedTags(rows: TagRow[]): Promise<void>;
  // createTag — mint (or return existing) tag; UNIQUE(user,name) makes it idempotent.
  createTag(input: {
    name: string;
    color?: string;
    kind?: string;
  }): Promise<TagRow>;
  // listTags — all of this user's tags, ordered by createdAt.
  listTags(): Promise<TagRow[]>;
  // getTag — owner-scoped fetch; other users' tags surface as "not found".
  getTag(tagId: string): Promise<TagRow>;
  // attach — idempotent polymorphic join insert + usageCount bump on first attach.
  attach(input: {
    tagId: string;
    entityType: TagEntityType;
    entityId: string;
  }): Promise<EntityTagRow>;
  // detach — remove the join row (if any) + usageCount decrement on actual removal.
  detach(input: {
    tagId: string;
    entityType: TagEntityType;
    entityId: string;
  }): Promise<void>;
  // listForEntity — the tags attached to a given entity (user-scoped).
  listForEntity(input: {
    entityType: TagEntityType;
    entityId: string;
  }): Promise<TagRow[]>;
  // listEntitiesForTag — the entity-tag join rows for a tag (user-scoped).
  listEntitiesForTag(tagId: string): Promise<EntityTagRow[]>;
}

export function createTaxonomyRepository(
  db: Db,
  deps: RepoDeps,
): TaxonomyRepository {
  // Owner-scoped read: a tag owned by another user is invisible → same
  // "not found" surface project/knowledge repositories use.
  async function getTag(tagId: string): Promise<TagRow> {
    const rows = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, deps.userId)));
    const row = rows[0];
    if (!row) throw new Error(`OwnershipError: tag not found: ${tagId}`);
    return row;
  }

  return {
    async seedTags(rows) {
      if (rows.length === 0) return;
      await db.insert(tags).values(rows).onConflictDoNothing();
    },

    // UNIQUE(user_id, name) → re-creating a same-named tag is a no-op; we return
    // the already-persisted row instead of minting a duplicate.
    async createTag({ name, color, kind }) {
      const ts = deps.now();
      const inserted = await db
        .insert(tags)
        .values({
          id: deps.nextId("tag"),
          userId: deps.userId,
          name,
          color: color ?? "#888888",
          kind: kind ?? null,
          usageCount: 0,
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return inserted[0];
      // Conflict: the (user, name) tag already exists — return it.
      const existing = await db
        .select()
        .from(tags)
        .where(and(eq(tags.userId, deps.userId), eq(tags.name, name)));
      return existing[0]!;
    },

    async listTags() {
      return db
        .select()
        .from(tags)
        .where(eq(tags.userId, deps.userId))
        .orderBy(asc(tags.createdAt));
    },

    getTag,

    // Attach is idempotent: UNIQUE(tag_id, entity_type, entity_id) makes a repeat
    // assignment a no-op. usageCount is the derived denormalized counter, bumped
    // only when a NEW join row is actually inserted.
    async attach({ tagId, entityType, entityId }) {
      await getTag(tagId); // ownership + existence gate
      const ts = deps.now();
      const inserted = await db
        .insert(entityTags)
        .values({
          id: deps.nextId("entityTag"),
          userId: deps.userId,
          tagId,
          entityType,
          entityId,
          createdAt: ts,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        await db
          .update(tags)
          .set({ usageCount: (await getTag(tagId)).usageCount + 1, updatedAt: ts })
          .where(eq(tags.id, tagId));
        return inserted[0];
      }
      // Conflict: assignment already exists — return the existing join row.
      const existing = await db
        .select()
        .from(entityTags)
        .where(
          and(
            eq(entityTags.userId, deps.userId),
            eq(entityTags.tagId, tagId),
            eq(entityTags.entityType, entityType),
            eq(entityTags.entityId, entityId),
          ),
        );
      return existing[0]!;
    },

    // Detach decrements usageCount only when a row was actually removed.
    async detach({ tagId, entityType, entityId }) {
      await getTag(tagId); // ownership + existence gate
      const ts = deps.now();
      const removed = await db
        .delete(entityTags)
        .where(
          and(
            eq(entityTags.userId, deps.userId),
            eq(entityTags.tagId, tagId),
            eq(entityTags.entityType, entityType),
            eq(entityTags.entityId, entityId),
          ),
        )
        .returning();
      if (removed.length > 0) {
        const current = await getTag(tagId);
        await db
          .update(tags)
          .set({
            usageCount: Math.max(0, current.usageCount - 1),
            updatedAt: ts,
          })
          .where(eq(tags.id, tagId));
      }
    },

    async listForEntity({ entityType, entityId }) {
      const joins = await db
        .select()
        .from(entityTags)
        .where(
          and(
            eq(entityTags.userId, deps.userId),
            eq(entityTags.entityType, entityType),
            eq(entityTags.entityId, entityId),
          ),
        )
        .orderBy(asc(entityTags.createdAt));
      if (joins.length === 0) return [];
      const all = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, deps.userId))
        .orderBy(asc(tags.createdAt));
      const byId = new Map(all.map((t) => [t.id, t]));
      const result: TagRow[] = [];
      for (const j of joins) {
        const t = byId.get(j.tagId);
        if (t) result.push(t);
      }
      return result;
    },

    async listEntitiesForTag(tagId) {
      await getTag(tagId); // ownership + existence gate
      return db
        .select()
        .from(entityTags)
        .where(
          and(eq(entityTags.userId, deps.userId), eq(entityTags.tagId, tagId)),
        )
        .orderBy(asc(entityTags.createdAt));
    },
  };
}
