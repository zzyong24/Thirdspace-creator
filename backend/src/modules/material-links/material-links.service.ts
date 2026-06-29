import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createMaterialLinkRepository,
  type MaterialLinkRepository,
  type RepoDeps,
} from "./material-links.repository";
import {
  toMaterialLinkDto,
  type MaterialLinkResource,
} from "./material-links.schema";
import { OwnershipError, ValidationError } from "./material-links.errors";

// MaterialLink service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId` so scoping is
// structural. The service owns the 用料链 (Bill-of-Materials, Plan A4) — the 料库⇄创作
// edge. No external port: links are pure local records (entityId / contentOutputId are
// soft references validated by a peer service at the caller's seam, not here).

const VALID_ENTITY_TYPES = new Set(["knowledge", "asset"]);

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateMaterialLinkInput {
  projectId: string;
  contentOutputId?: string | null;
  entityType: "knowledge" | "asset";
  entityId: string;
  role?: string;
  stage?: string;
  addedByType?: string;
}

export interface ListMaterialLinksQuery {
  projectId: string;
  page: number;
  pageSize: number;
}

export interface MaterialLinksService {
  list(
    ctx: RequestContext,
    query: ListMaterialLinksQuery,
  ): Promise<{ rows: MaterialLinkResource[]; total: number }>;
  create(
    ctx: RequestContext,
    input: CreateMaterialLinkInput,
  ): Promise<MaterialLinkResource>;
  delete(ctx: RequestContext, linkId: string): Promise<MaterialLinkResource>;
}

function guardCreateInput(input: CreateMaterialLinkInput): void {
  if (!VALID_ENTITY_TYPES.has(input.entityType)) {
    throw new ValidationError(
      `ValidationError: unknown entityType '${input.entityType}'`,
    );
  }
  if (input.projectId.trim().length === 0) {
    throw new ValidationError("ValidationError: projectId must be non-empty");
  }
  if (input.entityId.trim().length === 0) {
    throw new ValidationError("ValidationError: entityId must be non-empty");
  }
}

export function createMaterialLinksService(
  deps: ServiceDeps,
): MaterialLinksService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext): MaterialLinkRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createMaterialLinkRepository(db, repoDeps);
  }

  return {
    async list(ctx, query) {
      const { rows, total } = await repoFor(ctx).list(query.projectId, {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      });
      return { rows: rows.map(toMaterialLinkDto), total };
    },

    async create(ctx, input) {
      guardCreateInput(input);
      const row = await repoFor(ctx).create({
        projectId: input.projectId,
        contentOutputId: input.contentOutputId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        role: input.role,
        stage: input.stage,
        addedByType: input.addedByType,
      });
      return toMaterialLinkDto(row);
    },

    async delete(ctx, linkId) {
      const row = await repoFor(ctx).delete(linkId);
      return toMaterialLinkDto(row);
    },
  };
}

// Re-export for the cross-module seam consumers that only need the error type.
export { OwnershipError };
