import { and, eq, asc, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { tags, entityTags } from "./taxonomy.db-schema";

// Taxonomy repository (Step 2) — user-scoped queries ONLY. Every method takes
// `ctx: RequestContext` and filters/stamps `ctx.userId`; there is NO unscoped
// select/update/delete (foundation §1/§2, SPEC §10/§20). Mirrors the Projects /
// Identity exemplars: a factory over the shared pglite Db + deterministic deps
// (injected clock + id generator — no Date.now / Math.random in this layer).
//
// The polymorphic `entity_tags` rows carry their own denormalized `user_id`, so
// every join-table query is independently user-scoped and never needs a
// cross-table read to enforce ownership (and never joins into other modules'
// tables — SPEC §8/§22).

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export type TagRow = typeof tags.$inferSelect;
export type EntityTagRow = typeof entityTags.$inferSelect;

export interface TaxonomyRepository {
  insertTag(
    ctx: RequestContext,
    input: { name: string; color?: string; kind?: string },
  ): Promise<TagRow>;
  listTags(
    ctx: RequestContext,
    page: { limit?: number; offset?: number },
  ): Promise<TagRow[]>;
  findTag(ctx: RequestContext, tagId: string): Promise<TagRow | undefined>;
  updateTag(
    ctx: RequestContext,
    tagId: string,
    patch: { name?: string; color?: string; kind?: string },
  ): Promise<TagRow | undefined>;
  deleteTag(ctx: RequestContext, tagId: string): Promise<TagRow | undefined>;
  bumpUsage(ctx: RequestContext, tagId: string, delta: number): Promise<void>;
  insertEntityTag(
    ctx: RequestContext,
    input: { tagId: string; entityType: string; entityId: string },
  ): Promise<EntityTagRow>;
  deleteEntityTag(
    ctx: RequestContext,
    input: { tagId: string; entityType: string; entityId: string },
  ): Promise<EntityTagRow | undefined>;
  deleteEntityTagsForTag(ctx: RequestContext, tagId: string): Promise<void>;
  listTagsForEntity(
    ctx: RequestContext,
    ref: { entityType: string; entityId: string },
  ): Promise<TagRow[]>;
  listEntityTagsForTag(
    ctx: RequestContext,
    tagId: string,
    page: { limit?: number; offset?: number },
  ): Promise<EntityTagRow[]>;
}

export function createTaxonomyRepository(
  db: Db,
  deps: RepoDeps,
): TaxonomyRepository {
  return {
    async insertTag(ctx, { name, color, kind }) {
      const ts = deps.now();
      const inserted = await db
        .insert(tags)
        .values({
          id: deps.nextId("tag"),
          userId: ctx.userId,
          name,
          color: color ?? "#888888",
          kind: kind ?? null,
          usageCount: 0,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async listTags(ctx, _page) {
      return db
        .select()
        .from(tags)
        .where(eq(tags.userId, ctx.userId))
        .orderBy(asc(tags.createdAt));
    },

    async findTag(ctx, tagId) {
      const rows = await db
        .select()
        .from(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)));
      return rows[0];
    },

    async updateTag(ctx, tagId, patch) {
      const set: Partial<TagRow> = { updatedAt: deps.now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.color !== undefined) set.color = patch.color;
      if (patch.kind !== undefined) set.kind = patch.kind;
      const updated = await db
        .update(tags)
        .set(set)
        .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)))
        .returning();
      return updated[0];
    },

    async deleteTag(ctx, tagId) {
      const deleted = await db
        .delete(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)))
        .returning();
      return deleted[0];
    },

    async bumpUsage(ctx, tagId, delta) {
      const rows = await db
        .select()
        .from(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)));
      const row = rows[0];
      if (!row) return;
      const next = Math.max(0, row.usageCount + delta);
      await db
        .update(tags)
        .set({ usageCount: next, updatedAt: deps.now() })
        .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)));
    },

    async insertEntityTag(ctx, { tagId, entityType, entityId }) {
      // Idempotent assign: onConflictDoNothing against entity_tags_tag_entity_uq,
      // then re-select so a re-assign returns the existing row (SPEC §8).
      await db
        .insert(entityTags)
        .values({
          id: deps.nextId("entitytag"),
          userId: ctx.userId,
          tagId,
          entityType,
          entityId,
          createdAt: deps.now(),
        })
        .onConflictDoNothing();
      const rows = await db
        .select()
        .from(entityTags)
        .where(
          and(
            eq(entityTags.userId, ctx.userId),
            eq(entityTags.tagId, tagId),
            eq(entityTags.entityType, entityType),
            eq(entityTags.entityId, entityId),
          ),
        );
      return rows[0]!;
    },

    async deleteEntityTag(ctx, { tagId, entityType, entityId }) {
      const deleted = await db
        .delete(entityTags)
        .where(
          and(
            eq(entityTags.userId, ctx.userId),
            eq(entityTags.tagId, tagId),
            eq(entityTags.entityType, entityType),
            eq(entityTags.entityId, entityId),
          ),
        )
        .returning();
      return deleted[0];
    },

    async deleteEntityTagsForTag(ctx, tagId) {
      await db
        .delete(entityTags)
        .where(
          and(eq(entityTags.userId, ctx.userId), eq(entityTags.tagId, tagId)),
        );
    },

    async listTagsForEntity(ctx, { entityType, entityId }) {
      // Two scoped queries, no cross-module join (entity_tags is this module's
      // own table). First the user's assignments for this entity, then the tags.
      const ets = await db
        .select()
        .from(entityTags)
        .where(
          and(
            eq(entityTags.userId, ctx.userId),
            eq(entityTags.entityType, entityType),
            eq(entityTags.entityId, entityId),
          ),
        )
        .orderBy(asc(entityTags.createdAt));
      const tagIds = ets.map((e) => e.tagId);
      if (tagIds.length === 0) return [];
      const all = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, ctx.userId))
        .orderBy(asc(tags.createdAt));
      const byId = new Map(all.map((t) => [t.id, t]));
      return tagIds
        .map((tid) => byId.get(tid))
        .filter((t): t is TagRow => t !== undefined);
    },

    async listEntityTagsForTag(ctx, tagId, _page) {
      return db
        .select()
        .from(entityTags)
        .where(
          and(eq(entityTags.userId, ctx.userId), eq(entityTags.tagId, tagId)),
        )
        .orderBy(asc(entityTags.createdAt));
    },
  };
}
