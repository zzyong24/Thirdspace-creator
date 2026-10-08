import {withWorkspaceParentWrite,type WorkspaceWriteParent} from '../../workspace-write';
import {workspaceFilter,requireWorkspace} from "../../workspace-scope";
import { and, asc, eq, sql, type Db } from "@creatoros/backend";
// [T-332 S2] 父锚闭合(SPEC §3.2):production 域自身无 account 列,唯一合法入口是
// content_output → project(project 门 strict)。此前实现只按 userId 收窄 —— 同一 user
// 换号后仍能 by-id 读/建别号项目下的 production(绕过父锚的真洞)。这里引用共享基座的
// canonical 表(同 projects.repository 的 T-102 先例:只引用列做归属校验,不跨模块
// 调 service/repo),把每个读写点闭合到 content_outputs ⋈ projects 的 (userId, accountId) 门。
import { contentOutputs, projects } from "@creatoros/backend";
import {
  productions,
  productionSegments,
  exportRecords,
} from "./production.db-schema";
import { OwnershipError, requireAccountId } from "./production.errors";

// Production repository (foundation §5.2) — user-scoped queries ONLY. `user_id`
// lives on EVERY owned row; every read/write filters `eq(table.userId,
// deps.userId)` and every insert stamps `userId: deps.userId`. Child rows
// (segments / exports) are additionally gated through the parent production's
// ownership check, so they are never reachable cross-user (foundation §2, SPEC
// §14: cross-user → OwnershipError 404, never reveal existence).
//
// `userId` is baked into `deps` (one repo instance per ctx) — the service builds
// a fresh repo per request via `repoFor(ctx)`. The clock/id generator are injected
// for deterministic tests. The §12 status machines live in the SERVICE; the
// repository only executes service-approved updates.

export type ProductionRow = typeof productions.$inferSelect;
export type ProductionSegmentRow = typeof productionSegments.$inferSelect;
export type ExportRecordRow = typeof exportRecords.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner — baked in; the service mints one repo per ctx
  // [T-332 S2] 父锚账号维度:production 自身不加 account 列(§3.2 裁决,避免冗余 stamp
  // 漂移),但每个读写点都经 content_output → project 的 strict 门校验归属号。未选号
  // (null)→ 读写点直接抛 AccountRequiredError(引导态禁读写)。
  accountId: string | null;
  groupId?:string|null;
  assertOutputOwned?:(id:string)=>Promise<unknown>;
}

export interface ProductionRepository {
  seedProductions(rows: ProductionRow[]): Promise<void>;
  getProductionByOutput(outputId: string): Promise<ProductionRow>;
  findProductionByOutput(outputId: string): Promise<ProductionRow | null>;
  ensureProductionForOutput(outputId: string): Promise<ProductionRow>;
  getProductionById(productionId: string): Promise<ProductionRow>;
  updateProduction(
    productionId: string,
    patch: {
      productionMode?: string;
      status?: string;
      recordingConfig?: Record<string, unknown>;
      subtitleConfig?: Record<string, unknown>;
      startedAt?: string | null;
      completedAt?: string | null;
    },
  ): Promise<ProductionRow>;
  confirmEditingPlan(
    productionId: string,
    expectedRevision: number,
    plan: Record<string, unknown>,
  ): Promise<ProductionRow | null>;
  createSegment(
    productionId: string,
    input: {
      title: string;
      position: number;
      startMs: number;
      endMs: number;
      // SEAM-04:溯源到的脚本段 id(可选);无则 null(诚实空,不编造)。
      scriptSectionId?: string | null;
    },
  ): Promise<ProductionSegmentRow>;
  listSegments(productionId: string): Promise<ProductionSegmentRow[]>;
  createExport(
    productionId: string,
    input: {
      format: string;
      resolution: string;
      aspectRatio: string;
      bitrate?: number;
    },
  ): Promise<ExportRecordRow>;
  getExport(exportId: string): Promise<ExportRecordRow>;
  completeExportRow(
    exportId: string,
    input: { resultAssetId: string; status: string },
  ): Promise<ExportRecordRow>;
}

export function createProductionRepository(db:Db,deps:RepoDeps):ProductionRepository{return productionRepository(db,deps,false);}
function productionRepository(db:Db,deps:RepoDeps,locked:boolean):ProductionRepository {
  const userId = deps.userId;
  const writeCtx={userId,groupId:deps.groupId,accountId:deps.accountId,requestId:'production-parent-write',source:'user' as const};
  const outputParent:WorkspaceWriteParent={table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId,via:[{table:contentOutputs,id:contentOutputs.id,parentId:contentOutputs.projectId}]};
  const productionParent:WorkspaceWriteParent={...outputParent,via:[...outputParent.via!,{table:productions,id:productions.id,parentId:productions.contentOutputId,userId:productions.userId}]};
  const exportParent:WorkspaceWriteParent={...productionParent,via:[...productionParent.via!,{table:exportRecords,id:exportRecords.id,parentId:exportRecords.productionId,userId:exportRecords.userId}]};


  // [T-332 S2] 父锚门:outputId 必须属于「本 user 的当前号」的项目(content_outputs ⋈
  // projects,strict eq(accountId))。跨 user / 跨号 / 不存在同貌 → OwnershipError 404
  // (§4.5 号一致性门);未选号 → AccountRequiredError(引导态)。production 的所有读写
  // 都收敛过这道门(by-productionId / by-exportId 先解析出 contentOutputId 再过门)。
  async function requireOwnedOutput(outputId: string): Promise<void> {
    requireWorkspace(deps);
    if(!locked&&deps.assertOutputOwned){const owned=await deps.assertOutputOwned(outputId);if(owned===null||owned===false)throw new OwnershipError("产出不存在");return;}
    if(!locked&&deps.groupId)throw new OwnershipError("产出归属验证不可用");
    const rows = await db
      .select({ id: contentOutputs.id })
      .from(contentOutputs)
      .innerJoin(projects, eq(contentOutputs.projectId, projects.id))
      .where(
        and(
          eq(contentOutputs.id, outputId),
          eq(projects.userId, userId),
          workspaceFilter(projects,deps),
        ),
      );
    if (!rows[0]) {
      throw new OwnershipError(
        `OwnershipError: content output not found: ${outputId}`,
      );
    }
  }

  // Private ownership gate — a cross-user / unknown id is indistinguishable from
  // a missing one (foundation §2: 404, never reveal existence) → OwnershipError.
  // [T-332 S2] 再叠父锚门:行命中后还要求其 content_output 属于当前号(见 §3.2)。
  async function getProductionRowById(
    productionId: string,
  ): Promise<ProductionRow> {
    const rows = await db
      .select()
      .from(productions)
      .where(
        and(eq(productions.id, productionId), eq(productions.userId, userId)),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: production not found: ${productionId}`);
    }
    await requireOwnedOutput(row.contentOutputId);
    return row;
  }

  async function findProductionByOutput(
    outputId: string,
  ): Promise<ProductionRow | null> {
    await requireOwnedOutput(outputId); // [T-332 S2] 父锚门先行
    const rows = await db
      .select()
      .from(productions)
      .where(
        and(
          eq(productions.userId, userId),
          eq(productions.contentOutputId, outputId),
        ),
      );
    return rows[0] ?? null;
  }

  async function getProductionByOutput(outputId: string): Promise<ProductionRow> {
    const row = await findProductionByOutput(outputId);
    if (!row) throw new OwnershipError(`OwnershipError: production not found: ${outputId}`);
    return row;
  }

  return {
    async seedProductions(rows) {
      if (rows.length === 0) return;
      await db.insert(productions).values(rows).onConflictDoNothing();
    },

    getProductionByOutput,
    findProductionByOutput,

    getProductionById: getProductionRowById,

    async ensureProductionForOutput(outputId) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,outputParent,[outputId],tx=>productionRepository(tx as unknown as Db,deps,true).ensureProductionForOutput(outputId));
      // Get-or-create scoped by output. The UNIQUE index on content_output_id
      // makes the row at-most-one per output (data-model 0..1), so a second call
      // returns the SAME id (idempotent — backs the initial GET load).
      // [T-332 S2] 父锚门先行:不能给不属于当前号(或不存在)的 output 建 production。
      await requireOwnedOutput(outputId);
      const existing = await db
        .select()
        .from(productions)
        .where(
          and(
            eq(productions.userId, userId),
            eq(productions.contentOutputId, outputId),
          ),
        );
      if (existing[0]) return existing[0];

      const now = deps.now();
      const id = deps.nextId("production");
      // [T-049 B10] SELECT-then-INSERT 有并发竞态:页面首载时 wiring 与 VM 两路并发
      // 各自 ensure,后插者撞 content_output_id 唯一索引直接炸 → wiring=undefined →
      // 录制工作台随机消失(刷新才出现,真机复现过)。onConflictDoNothing 让后到者
      // 安静落败,随后按 outputId 重查赢家行返回 —— 两路拿到同一行。
      await db
        .insert(productions)
        .values({
          id,
          userId,
          contentOutputId: outputId,
          productionMode: "remote_recording",
          status: "drafting",
          recordingConfig: {},
          subtitleConfig: {},
          startedAt: null,
          completedAt: null,
          updatedAt: now,
        })
        .onConflictDoNothing();
      const winner = await getProductionByOutput(outputId);
      return winner;
    },

    async updateProduction(productionId, patch) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,{...productionParent,lock:'update'},[productionId],tx=>productionRepository(tx as unknown as Db,deps,true).updateProduction(productionId,patch));
      // Ownership gate first (cross-user / unknown id → OwnershipError 404).
      await getProductionRowById(productionId);
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.productionMode !== undefined)
        set.productionMode = patch.productionMode;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.recordingConfig !== undefined)
        set.recordingConfig = patch.recordingConfig;
      if (patch.subtitleConfig !== undefined)
        set.subtitleConfig = patch.subtitleConfig;
      if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
      if (patch.completedAt !== undefined) set.completedAt = patch.completedAt;
      await db
        .update(productions)
        .set(set)
        .where(
          and(eq(productions.id, productionId), eq(productions.userId, userId)),
        );
      return getProductionRowById(productionId);
    },

    async confirmEditingPlan(productionId, expectedRevision, plan) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,{...productionParent,lock:'update'},[productionId],tx=>productionRepository(tx as unknown as Db,deps,true).confirmEditingPlan(productionId,expectedRevision,plan));
      await getProductionRowById(productionId);
      const next = { ...plan, revision: expectedRevision + 1 };
      const rows = await db
        .update(productions)
        .set({
          recordingConfig: sql`jsonb_set(coalesce(${productions.recordingConfig}, '{}'::jsonb), '{videoEditingPlan}', ${JSON.stringify(next)}::jsonb, true)`,
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(productions.id, productionId),
            eq(productions.userId, userId),
            sql`coalesce((${productions.recordingConfig}->'videoEditingPlan'->>'revision')::int, 0) = ${expectedRevision}`,
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async createSegment(productionId, input) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,productionParent,[productionId],tx=>productionRepository(tx as unknown as Db,deps,true).createSegment(productionId,input));
      // Parent-ownership gate before the write (no cross-user child rows).
      await getProductionRowById(productionId);
      const id = deps.nextId("segment");
      await db.insert(productionSegments).values({
        id,
        userId,
        productionId,
        // SEAM-04:真填脚本段溯源(去掉写死 null);调用方按位置对应给 id,无对应则仍 null。
        scriptSectionId: input.scriptSectionId ?? null,
        title: input.title,
        position: input.position,
        startMs: input.startMs,
        endMs: input.endMs,
        segmentConfig: {},
      });
      const rows = await db
        .select()
        .from(productionSegments)
        .where(
          and(
            eq(productionSegments.id, id),
            eq(productionSegments.userId, userId),
          ),
        );
      return rows[0]!;
    },

    async listSegments(productionId) {
      await getProductionRowById(productionId);
      return db
        .select()
        .from(productionSegments)
        .where(
          and(
            eq(productionSegments.userId, userId),
            eq(productionSegments.productionId, productionId),
          ),
        )
        .orderBy(asc(productionSegments.position));
    },

    async createExport(productionId, input) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,productionParent,[productionId],tx=>productionRepository(tx as unknown as Db,deps,true).createExport(productionId,input));
      // Parent-ownership gate before the write.
      await getProductionRowById(productionId);
      const id = deps.nextId("export");
      await db.insert(exportRecords).values({
        id,
        userId,
        productionId,
        resultAssetId: null,
        format: input.format,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        bitrate: input.bitrate ?? 0,
        status: "queued",
        exportConfig: {},
        createdAt: deps.now(),
        completedAt: null,
      });
      return getExportRow(id);
    },

    getExport: getExportRow,

    async completeExportRow(exportId, input) {
      if(!locked)return withWorkspaceParentWrite(db,writeCtx,{...exportParent,lock:'update'},[exportId],tx=>productionRepository(tx as unknown as Db,deps,true).completeExportRow(exportId,input));
      await getExportRow(exportId); // ownership gate
      await db
        .update(exportRecords)
        .set({
          resultAssetId: input.resultAssetId,
          status: input.status,
          completedAt: deps.now(),
        })
        .where(
          and(
            eq(exportRecords.id, exportId),
            eq(exportRecords.userId, userId),
          ),
        );
      return getExportRow(exportId);
    },
  };

  async function getExportRow(exportId: string): Promise<ExportRecordRow> {
    const rows = await db
      .select()
      .from(exportRecords)
      .where(
        and(eq(exportRecords.id, exportId), eq(exportRecords.userId, userId)),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: export not found: ${exportId}`);
    }
    // [T-332 S2] 父锚闭合:export → production → content_output → project 的号门。
    await getProductionRowById(row.productionId);
    return row;
  }
}
