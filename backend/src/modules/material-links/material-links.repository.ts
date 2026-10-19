import {withWorkspaceParentWrite,type WorkspaceWriteParent} from '../../workspace-write';
import {projects,contentOutputs} from '../../schema/projects';
import {workspaceFilter} from "../../workspace-scope";
import { and, count, desc, eq, isNull, type Db } from "@creatoros/backend";
import { materialLinks } from "./material-links.db-schema";
import { OwnershipError } from "./material-links.errors";

// MaterialLink repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the platform-account repo): EVERY query filters
// `scope()` and EVERY insert stamps
// `userId: deps.userId`. `delete` selects ownership-scoped first and throws
// OwnershipError when the scoped row is missing — never revealing cross-user existence
// (foundation §2: 404 not 403).

export type MaterialLinkRow = Omit<typeof materialLinks.$inferSelect,"groupId"|"accountId"> & {groupId?:string|null;accountId?:string|null};

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  groupId?:string|null;
  accountId?:string|null;
  userId: string; // the ownership boundary, baked in at construction
}

export interface CreateMaterialLinkInput {
  projectId: string;
  contentOutputId?: string | null;
  entityType: "knowledge" | "asset";
  entityId: string;
  role?: string;
  stage?: string;
  addedByType?: string;
  // [T-146 切片 b] 项目内优先级('high' | 'normal')。缺省 → repo DEFAULT 'normal';
  // 派生(user→high / ai→normal)由 SERVICE 层算好后显式传入(repo 不派生,只落值)。
  priority?: string;
}

export interface ListMaterialLinksQuery {
  limit?: number;
  offset?: number;
}

export interface MaterialLinkRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedLinks(rows: MaterialLinkRow[]): Promise<void>;

  // projectId 传 null = 当前工作区的用料边（素材中心按项目分组反查）。
  list(
    projectId: string | null,
    query: ListMaterialLinksQuery,
  ): Promise<{ rows: MaterialLinkRow[]; total: number }>;
  get(linkId:string):Promise<MaterialLinkRow>;
  create(input: CreateMaterialLinkInput): Promise<MaterialLinkRow>;
  delete(linkId: string): Promise<MaterialLinkRow>;
}

export function createMaterialLinkRepository(db:Db,deps:RepoDeps):MaterialLinkRepository{return materialLinkRepository(db,deps,false);}
function materialLinkRepository(db:Db,deps:RepoDeps,locked:boolean):MaterialLinkRepository {
  const writeCtx={userId:deps.userId,groupId:deps.groupId,accountId:deps.accountId,requestId:'material-parent-write',source:'user' as const};
  const projectParent:WorkspaceWriteParent={table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId};
  const linkParent:WorkspaceWriteParent={...projectParent,via:[{table:materialLinks,id:materialLinks.id,parentId:materialLinks.projectId,userId:materialLinks.userId,scope:{groupId:materialLinks.groupId,accountId:materialLinks.accountId}}]};
  const scope=()=>and(eq(materialLinks.userId,deps.userId),workspaceFilter(materialLinks,deps));
  async function get(linkId:string){const [row]=await db.select().from(materialLinks).where(and(scope(),eq(materialLinks.id,linkId)));if(!row)throw new OwnershipError("用料记录不存在");return row;}
  return {
    get,
    async seedLinks(rows) {
      if (rows.length === 0) return;
      await db.insert(materialLinks).values(rows).onConflictDoNothing();
    },

    async list(projectId, { limit = 100, offset = 0 }) {
      const where = projectId
        ? and(
            scope(),
            eq(materialLinks.projectId, projectId),
          )
        : scope();
      const rows = await db
        .select()
        .from(materialLinks)
        .where(where)
        .orderBy(desc(materialLinks.createdAt), desc(materialLinks.id))
        .limit(limit)
        .offset(offset);
      const totals = await db
        .select({ total: count() })
        .from(materialLinks)
        .where(where);
      return { rows, total: totals[0]?.total ?? 0 };
    },

    async create(input) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,projectParent,[input.projectId],async tx=>{
        if(input.contentOutputId){const [output]=await tx.select({id:contentOutputs.id}).from(contentOutputs).where(and(eq(contentOutputs.id,input.contentOutputId),eq(contentOutputs.projectId,input.projectId))).for('share');if(!output)throw new OwnershipError('产出不属于当前项目');}
        return materialLinkRepository(tx as unknown as Db,deps,true).create(input);
      });
      // [T-813] 保存重试幂等：响应丢失/刷新后再次保存同一项目素材时返回既有边，
      // 不让一份正文在长期上下文里重复出现。
      const role = input.role ?? "reference";
      const stage = input.stage ?? "research";
      const existing = await db
        .select()
        .from(materialLinks)
        .where(
          and(
            scope(),
            eq(materialLinks.projectId, input.projectId),
            input.contentOutputId
              ? eq(materialLinks.contentOutputId, input.contentOutputId)
              : isNull(materialLinks.contentOutputId),
            eq(materialLinks.entityType, input.entityType),
            eq(materialLinks.entityId, input.entityId),
            eq(materialLinks.role, role),
            eq(materialLinks.stage, stage),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];
      const inserted = await db
        .insert(materialLinks)
        .values({
          id: deps.nextId("matlink"),
          userId: deps.userId,
          groupId:deps.groupId??null,accountId:deps.accountId??null,
          projectId: input.projectId,
          contentOutputId: input.contentOutputId ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          role,
          stage,
          addedByType: input.addedByType ?? "user",
          priority: input.priority ?? "normal",
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async delete(linkId) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,{...linkParent,lock:'update'},[linkId],tx=>materialLinkRepository(tx as unknown as Db,deps,true).delete(linkId));
      // Ownership gate: a cross-user / unknown id selects empty → OwnershipError (404),
      // never leaking that the row exists for another user.
      const rows = await db
        .select()
        .from(materialLinks)
        .where(
          and(
            scope(),
            eq(materialLinks.id, linkId),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: material link not found: ${linkId}`,
        );
      }
      await db
        .delete(materialLinks)
        .where(
          and(
            scope(),
            eq(materialLinks.id, linkId),
          ),
        );
      return row;
    },
  };
}
