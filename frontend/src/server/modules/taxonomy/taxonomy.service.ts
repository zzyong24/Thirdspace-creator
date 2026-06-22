import type { RequestContext } from "@creatoros/contract";
import {
  tagEntityType,
  type TagResource,
  type EntityTagResource,
  type TagEntityType,
} from "./taxonomy.schema";
import type {
  TaxonomyRepository,
  TagRow,
  EntityTagRow,
} from "./taxonomy.repository";
import {
  TagNotFoundError,
  DuplicateTagError,
  InvalidEntityRefError,
} from "./taxonomy.errors";

// Taxonomy service (Step 3) — RequestContext-taking methods. Taxonomy has NO
// §12 state machine (foundation §5: "No machine for … Taxonomy"); the service
// enforces ownership, validation invariants, the derived `usageCount`, and the
// cross-table cascade on tag delete (entity_tags has no FK, so the service owns
// the cascade). Reusability invariant (SPEC §22): tags are never project-scoped;
// `assignTags` accepts any of the 6 entity kinds and the same tag may be
// assigned across projects/modules.

export interface TaxonomyService {
  createTag(
    ctx: RequestContext,
    input: { name: string; color?: string; kind?: string },
  ): Promise<TagResource>;
  listTags(
    ctx: RequestContext,
    query: { limit?: number; offset?: number },
  ): Promise<TagResource[]>;
  renameTag(
    ctx: RequestContext,
    tagId: string,
    patch: { name?: string; color?: string; kind?: string },
  ): Promise<TagResource>;
  deleteTag(ctx: RequestContext, tagId: string): Promise<TagResource>;
  assignTags(
    ctx: RequestContext,
    input: { entityType: string; entityId: string; tagIds: string[] },
  ): Promise<EntityTagResource[]>;
  removeTag(
    ctx: RequestContext,
    input: { entityType: string; entityId: string; tagId: string },
  ): Promise<void>;
  listTagsForEntity(
    ctx: RequestContext,
    ref: { entityType: string; entityId: string },
  ): Promise<TagResource[]>;
  listEntitiesForTag(
    ctx: RequestContext,
    tagId: string,
    query: { limit?: number; offset?: number },
  ): Promise<EntityTagResource[]>;
}

function toTagDTO(row: TagRow): TagResource {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color ?? undefined,
    kind: row.kind ?? undefined,
    usageCount: row.usageCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEntityTagDTO(row: EntityTagRow): EntityTagResource {
  return {
    id: row.id,
    tagId: row.tagId,
    entityType: row.entityType as TagEntityType,
    entityId: row.entityId,
    createdAt: row.createdAt,
  };
}

function assertEntityType(entityType: string): void {
  if (!tagEntityType.safeParse(entityType).success) {
    throw new InvalidEntityRefError(`Unknown entity type: ${entityType}`);
  }
}

// pglite/Postgres unique-violation: SQLSTATE 23505. Re-thrown as a domain error.
function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /23505/.test(msg) ||
    /duplicate key|unique constraint|tags_user_name_uq/i.test(msg)
  );
}

export function createTaxonomyService(
  repo: TaxonomyRepository,
): TaxonomyService {
  return {
    async createTag(ctx, { name, color, kind }) {
      const trimmed = name.trim();
      if (trimmed.length === 0) {
        throw new InvalidEntityRefError("Tag name must not be blank");
      }
      try {
        const row = await repo.insertTag(ctx, { name: trimmed, color, kind });
        return toTagDTO(row);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DuplicateTagError(
            `A tag named "${trimmed}" already exists`,
          );
        }
        throw err;
      }
    },

    async listTags(ctx, query) {
      const rows = await repo.listTags(ctx, query);
      return rows.map(toTagDTO);
    },

    async renameTag(ctx, tagId, patch) {
      const existing = await repo.findTag(ctx, tagId);
      if (!existing) throw new TagNotFoundError();
      if (patch.name !== undefined && patch.name.trim().length === 0) {
        throw new InvalidEntityRefError("Tag name must not be blank");
      }
      const normalized = {
        ...patch,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      };
      try {
        const row = await repo.updateTag(ctx, tagId, normalized);
        // Scoped update returns undefined only on a lost race; treat as 404.
        if (!row) throw new TagNotFoundError();
        return toTagDTO(row);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DuplicateTagError();
        }
        throw err;
      }
    },

    async deleteTag(ctx, tagId) {
      const existing = await repo.findTag(ctx, tagId);
      if (!existing) throw new TagNotFoundError();
      // UoW: cascade entity_tags first, then the tag (no FK; service owns it).
      await repo.deleteEntityTagsForTag(ctx, tagId);
      const deleted = await repo.deleteTag(ctx, tagId);
      if (!deleted) throw new TagNotFoundError();
      return toTagDTO(deleted);
    },

    async assignTags(ctx, { entityType, entityId, tagIds }) {
      assertEntityType(entityType);
      // Verify ownership of every tag up front (unknown/foreign → 404) so a
      // partial assign never lands.
      for (const tagId of tagIds) {
        const owned = await repo.findTag(ctx, tagId);
        if (!owned) throw new TagNotFoundError(`Tag not found: ${tagId}`);
      }
      const out: EntityTagResource[] = [];
      for (const tagId of tagIds) {
        const before = await repo.listEntityTagsForTag(ctx, tagId, {});
        const existed = before.some(
          (e) => e.entityType === entityType && e.entityId === entityId,
        );
        const row = await repo.insertEntityTag(ctx, {
          tagId,
          entityType,
          entityId,
        });
        // Only bump usage on a genuinely new assignment (idempotent re-assign
        // must not inflate the counter).
        if (!existed) await repo.bumpUsage(ctx, tagId, +1);
        out.push(toEntityTagDTO(row));
      }
      return out;
    },

    async removeTag(ctx, { entityType, entityId, tagId }) {
      assertEntityType(entityType);
      const removed = await repo.deleteEntityTag(ctx, {
        tagId,
        entityType,
        entityId,
      });
      // Idempotent detach: already-absent assignment is a no-op (no 404). Only
      // decrement usage when a row was actually removed.
      if (removed) await repo.bumpUsage(ctx, tagId, -1);
    },

    async listTagsForEntity(ctx, { entityType, entityId }) {
      assertEntityType(entityType);
      const rows = await repo.listTagsForEntity(ctx, { entityType, entityId });
      return rows.map(toTagDTO);
    },

    async listEntitiesForTag(ctx, tagId, query) {
      const owned = await repo.findTag(ctx, tagId);
      if (!owned) throw new TagNotFoundError();
      const rows = await repo.listEntityTagsForTag(ctx, tagId, query);
      return rows.map(toEntityTagDTO);
    },
  };
}
