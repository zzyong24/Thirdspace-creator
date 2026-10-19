import type {Db} from "@creatoros/backend";
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
  listAssetTagSummaries(ctx:RequestContext,assetIds:string[]):Promise<Record<string,Array<{id:string;name:string}>>>;
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

export interface TaxonomyEntityAccess {
  /** 原资产owner服务的批量可读门；不调用逐实体guard或直接读别的repo。 */
  readableAssetIds?(ctx:RequestContext,assetIds:string[]):Promise<string[]>;
  assertEntityReadable(ctx: RequestContext, entityType: TagEntityType, entityId: string): Promise<unknown>;
  assertEntityWritable(ctx: RequestContext, entityType: TagEntityType, entityId: string, transaction?: Db): Promise<unknown>;
}
export function createTaxonomyService(
  repo: TaxonomyRepository,
  access?: TaxonomyEntityAccess,
): TaxonomyService {
  async function guard(ctx: RequestContext, entityType: string, entityId: string, write = false) {
    assertEntityType(entityType);
    if (write) await repo.assertWritableScope(ctx);
    if (access) return (write ? access.assertEntityWritable : access.assertEntityReadable)(ctx, entityType as TagEntityType, entityId);
    // Compatibility for the pre-workspace internal foundation fixtures only.
    // Public application entry points inject actual entity service ports.
    if (ctx.groupId || ctx.accountId) throw new TagNotFoundError("实体归属校验端口不可用");
  }
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
      // Repository atomically locks affected assets and cascades relationships with the tag.
      const deleted = await repo.deleteTag(ctx, tagId);
      if (!deleted) throw new TagNotFoundError();
      return toTagDTO(deleted);
    },

    async assignTags(ctx, { entityType, entityId, tagIds }) {
      assertEntityType(entityType);
      if (entityType === "asset") return (await repo.assignAssetTags(ctx,entityId,tagIds)).map(toEntityTagDTO);
      await guard(ctx, entityType, entityId, true);
      return (await repo.assignEntityTags(ctx, {entityType, entityId, tagIds}, access ? tx => access.assertEntityWritable(ctx, entityType as TagEntityType, entityId, tx) : undefined)).map(toEntityTagDTO);
    },

    async removeTag(ctx, { entityType, entityId, tagId }) {
      assertEntityType(entityType);
      if (entityType === "asset") return repo.removeAssetTag(ctx,entityId,tagId);
      await guard(ctx, entityType, entityId, true);
      await repo.removeEntityTagAndUsage(ctx, {tagId, entityType, entityId}, access ? tx => access.assertEntityWritable(ctx, entityType as TagEntityType, entityId, tx) : undefined);
    },

    async listAssetTagSummaries(ctx,assetIds) {
      // SEMANTIC_BOUNDARY_ALLOW: 仅按真实ID去重并复核授权范围/类型，不做标签含义或创作选择。
      const ids=[...new Set(assetIds)];
      if(ids.length>200)throw new InvalidEntityRefError("素材标签批量读取超过范围");
      const result:Record<string,Array<{id:string;name:string}>>=Object.create(null);
      if(!ids.length)return result;
      if(!access?.readableAssetIds)throw new InvalidEntityRefError("素材标签读取端口不可用");
      const readable=await access.readableAssetIds(ctx,ids),requested=new Set(ids);
      if(readable.some(id=>!requested.has(id)))throw new InvalidEntityRefError("素材标签读取范围不一致");
      for(const id of readable)result[id]=[];
      const rows=await repo.listAssetTagSummaries(ctx,readable);
      for(const row of rows){const labels=result[row.entityId];if(labels)labels.push({id:row.id,name:row.name});}
      return result;
    },

    async listTagsForEntity(ctx, { entityType, entityId }) {
      assertEntityType(entityType);
      await guard(ctx, entityType, entityId);
      const rows = await repo.listTagsForEntity(ctx, { entityType, entityId });
      return rows.map(toTagDTO);
    },

    async listEntitiesForTag(ctx, tagId, query) {
      if (!access && (ctx.groupId || ctx.accountId)) throw new TagNotFoundError("实体归属校验端口不可用");
      const owned = await repo.findTag(ctx, tagId);
      if (!owned) throw new TagNotFoundError();
      const rows = await repo.listEntityTagsForTag(ctx, tagId, {});
      const visible: EntityTagRow[] = [];
      for (const row of rows) {
        try { await guard(ctx, row.entityType, row.entityId); visible.push(row); }
        catch (error) { if (!(typeof error === "object" && error && "code" in error && error.code === "OwnershipError")) throw error; }
      }
      const offset = query.offset ?? 0;
      return visible.slice(offset, query.limit === undefined ? undefined : offset + query.limit).map(toEntityTagDTO);
    },
  };
}
