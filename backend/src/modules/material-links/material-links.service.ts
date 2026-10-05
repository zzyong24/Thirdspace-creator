import {assertWritableWorkspace,requireWorkspace} from "../../workspace-scope";
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
// edge. Cross-module identity remains a soft reference in SQL, but production binds
// public-service validator ports so an API/CLI write cannot create a dangling edge.

const VALID_ENTITY_TYPES = new Set(["knowledge", "asset"]);
// [T-146 切片 b] priority 枚举:二元(用户裁决②)。枚举一律 service 校验(gate minor 驳回加
// DB CHECK,本仓约定)。
const VALID_PRIORITIES = new Set(["high", "normal"]);

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  /** Cross-module ownership/association ports; production composition must bind them. */
  assertProjectOwned?: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<unknown>;
  resolveOutputProjectId?: (
    ctx: RequestContext,
    outputId: string,
  ) => Promise<string | null>;
  assertKnowledgeOwned?: (
    ctx: RequestContext,
    knowledgeId: string,
  ) => Promise<unknown>;
  assertAssetOwned?: (
    ctx: RequestContext,
    assetId: string,
  ) => Promise<unknown>;
}

export interface CreateMaterialLinkInput {
  projectId: string;
  contentOutputId?: string | null;
  entityType: "knowledge" | "asset";
  entityId: string;
  role?: string;
  stage?: string;
  addedByType?: string;
  // [T-146 切片 b] 显式优先级(逃生口,可选)。缺省 → 按 addedByType 自动派生
  // (user/默认→high;ai→normal)。传入即覆盖派生。
  priority?: string;
}

export interface ListMaterialLinksQuery {
  projectId?: string;
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
  // [T-146 切片 b] 显式 priority 必须合枚举(派生值天然合法,不经此路)。
  if (input.priority !== undefined && !VALID_PRIORITIES.has(input.priority)) {
    throw new ValidationError(
      `ValidationError: unknown priority '${input.priority}'`,
    );
  }
}

// [T-146 切片 b] priority 自动派生(用户裁决②:二元自动)。显式传值 → 用它(逃生口);
// 否则按 provenance:AI 找的二手素材('ai')→ normal;用户第一手(默认/'user')→ high。
// 「用户上传素材优先级最高」的核心规则落在这一行。
function derivePriority(input: CreateMaterialLinkInput): string {
  if (input.priority !== undefined) return input.priority;
  return input.addedByType === "ai" ? "normal" : "high";
}

export function createMaterialLinksService(
  deps: ServiceDeps,
): MaterialLinksService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext): MaterialLinkRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId,groupId:ctx.groupId??null,accountId:ctx.accountId??null };
    return createMaterialLinkRepository(db, repoDeps);
  }

  async function assertParent(ctx:RequestContext,id:string):Promise<unknown>{
    if(ctx.groupId&&!deps.assertProjectOwned)throw new OwnershipError("项目归属验证不可用");
    const project=await deps.assertProjectOwned?.(ctx,id);
    if(ctx.groupId&&(!project||typeof project!=="object"||(project as {groupId?:unknown}).groupId!==ctx.groupId))throw new OwnershipError("项目不存在");
    return project;
  }

  return {
    async list(ctx, query) {
      requireWorkspace(ctx);
      if(query.projectId)await assertParent(ctx,query.projectId);
      const { rows, total } = await repoFor(ctx).list(query.projectId ?? null, {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      });
      for(const projectId of new Set(rows.map(row=>row.projectId)))await assertParent(ctx,projectId);
      return { rows: rows.map(toMaterialLinkDto), total };
    },

    async create(ctx, input) {
      guardCreateInput(input);
      if(ctx.groupId||ctx.accountId)await assertWritableWorkspace(db,ctx);
      await assertParent(ctx,input.projectId);
      if(ctx.groupId&&input.contentOutputId&&!deps.resolveOutputProjectId)throw new OwnershipError("产出归属验证不可用");
      if(ctx.groupId&&input.entityType==="knowledge"&&!deps.assertKnowledgeOwned||ctx.groupId&&input.entityType==="asset"&&!deps.assertAssetOwned)throw new OwnershipError("用料归属验证不可用");
      if (input.contentOutputId && deps.resolveOutputProjectId) {
        const outputProjectId = await deps.resolveOutputProjectId(
          ctx,
          input.contentOutputId,
        );
        if (outputProjectId !== input.projectId) {
          throw new ValidationError(
            "ValidationError: contentOutputId does not belong to projectId",
          );
        }
      }
      if (input.entityType === "knowledge" && deps.assertKnowledgeOwned) {
        await deps.assertKnowledgeOwned(ctx, input.entityId);
      }
      if (input.entityType === "asset" && deps.assertAssetOwned) {
        await deps.assertAssetOwned(ctx, input.entityId);
      }
      const row = await repoFor(ctx).create({
        projectId: input.projectId,
        contentOutputId: input.contentOutputId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        role: input.role,
        stage: input.stage,
        addedByType: input.addedByType,
        // [T-146 切片 b] service 派生 priority 后显式落 repo(repo 不派生)。
        priority: derivePriority(input),
      });
      return toMaterialLinkDto(row);
    },

    async delete(ctx, linkId) {
      if(ctx.groupId||ctx.accountId)await assertWritableWorkspace(db,ctx);
      const repo=repoFor(ctx),owned=await repo.get(linkId);
      await assertParent(ctx,owned.projectId);
      const row = await repo.delete(linkId);
      return toMaterialLinkDto(row);
    },
  };
}

// Re-export for the cross-module seam consumers that only need the error type.
export { OwnershipError };
