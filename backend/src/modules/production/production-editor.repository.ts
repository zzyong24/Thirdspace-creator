import { and, desc, eq, sql, contentOutputs, projects, productions, productionEditVersions, productionRenderRequests, type Db } from "@creatoros/backend";
import type { ProductionEditorVersion, ProductionEditorRenderRequest, ExecutionTaskSpec } from "@creatoros/contract";
import { ConflictError, OwnershipError, requireAccountId } from "./production.errors";
import { itemDigest } from "./production-editor-plan";
import type { RepoDeps, ProductionRow, ProductionRepository } from "./production.repository";

type Store=Pick<Db,"select"|"insert"|"update">;
type VersionRow=typeof productionEditVersions.$inferSelect;
const record=(v:unknown):Record<string,unknown>=>v && typeof v==="object" && !Array.isArray(v)?v as Record<string,unknown>:{};
export const editingPlan=(config:unknown):Record<string,unknown>|null=>{
  const value=record(config).videoEditingPlan;return value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:null;
};
export const editorRevision=(plan:Record<string,unknown>|null):number=>Number.isInteger(plan?.revision) && Number(plan?.revision)>=0?Number(plan?.revision):0;
function dto(row:VersionRow):ProductionEditorVersion {
  return {productionId:row.productionId,revision:row.revision,requestId:row.requestId,
    planDigest:row.planDigest,source:row.source as ProductionEditorVersion["source"],plan:record(row.plan),createdAt:row.createdAt};
}
const renderDto=(r:typeof productionRenderRequests.$inferSelect):ProductionEditorRenderRequest=>({productionId:r.productionId,requestId:r.requestId,revision:r.revision,
  spec:r.spec as ExecutionTaskSpec,attemptId:r.attemptId,taskId:r.taskId,assetId:r.assetId,createdAt:r.createdAt});

export function createProductionEditorRepository(db:Db,deps:RepoDeps) {
  async function output(store:Store,outputId:string,lock=false) {
    const accountId=requireAccountId(deps.accountId,"production.editor");
    const query=store.select({id:contentOutputs.id,projectId:projects.id,contentType:contentOutputs.contentType})
      .from(contentOutputs).innerJoin(projects,eq(contentOutputs.projectId,projects.id))
      .where(and(eq(contentOutputs.id,outputId),eq(projects.userId,deps.userId),eq(projects.accountId,accountId)));
    const row=(await (lock?query.for("share"):query))[0];
    if(!row) throw new OwnershipError();
    if(row.contentType!=="video") throw new ConflictError("请选择视频作品进入制作工作台");
    return row;
  }
  async function read(outputId:string) {
    const owned=await output(db,outputId);
    const row=(await db.select().from(productions).where(and(eq(productions.contentOutputId,outputId),eq(productions.userId,deps.userId))))[0]??null;
    return {owned,row,plan:editingPlan(row?.recordingConfig)};
  }
  async function receiptFor(store:Store,productionId:string,requestId:string) {
    return (await store.select().from(productionEditVersions).where(and(eq(productionEditVersions.productionId,productionId),eq(productionEditVersions.userId,deps.userId),eq(productionEditVersions.requestId,requestId))))[0]??null;
  }
  return {
    read,
    async receipt(outputId:string,requestId:string) {
      const {row}=await read(outputId);if(!row)return null;
      const found=await receiptFor(db,row.id,requestId);return found?dto(found):null;
    },
    async version(outputId:string,revision:number) {
      const {row}=await read(outputId);if(!row)throw new OwnershipError();
      const found=(await db.select().from(productionEditVersions).where(and(eq(productionEditVersions.productionId,row.id),eq(productionEditVersions.userId,deps.userId),eq(productionEditVersions.revision,revision))))[0];
      if(!found)throw new OwnershipError();return dto(found);
    },
    async versions(outputId:string,limit:number,offset:number) {
      const {row}=await read(outputId);if(!row)return {items:[],total:0};
      const where=and(eq(productionEditVersions.productionId,row.id),eq(productionEditVersions.userId,deps.userId));
      const total=Number((await db.select({count:sql<number>`count(*)`}).from(productionEditVersions).where(where))[0]?.count??0);
      const rows=await db.select().from(productionEditVersions).where(where).orderBy(desc(productionEditVersions.revision)).limit(limit).offset(offset);
      return {items:rows.map(r=>{const {plan,...summary}=dto(r);return summary;}),total};
    },
    async reserveRender(outputId:string,input:{revision:number;requestId:string;requestDigest:string},build:(plan:Record<string,unknown>,projectId:string,transaction:Db)=>Promise<ExecutionTaskSpec>) {
      return db.transaction(async tx=>{
        const owned=await output(tx,outputId,true);
        const production=(await tx.select().from(productions).where(and(eq(productions.contentOutputId,outputId),eq(productions.userId,deps.userId))).for("update"))[0];
        if(!production)throw new ConflictError("请先保存制作方案，再生成视频");
        const where=and(eq(productionRenderRequests.productionId,production.id),eq(productionRenderRequests.userId,deps.userId),eq(productionRenderRequests.requestId,input.requestId));
        const previous=(await tx.select().from(productionRenderRequests).where(where))[0];
        if(previous) {
          if(previous.requestDigest!==input.requestDigest)throw new ConflictError("该生成请求对应另一版本，请为新版本重新生成");
          return {request:renderDto(previous),projectId:owned.projectId};
        }
        const version=(await tx.select().from(productionEditVersions).where(and(eq(productionEditVersions.productionId,production.id),eq(productionEditVersions.userId,deps.userId),eq(productionEditVersions.revision,input.revision))))[0];
        if(!version || record(version.plan).editorVersion!==1)throw new ConflictError("请先保存该制作方案，再生成视频");
        const spec=await build(record(version.plan),owned.projectId,tx as unknown as Db);
        const attemptId=`production-render-${itemDigest({productionId:production.id,requestId:input.requestId}).slice(7)}`;
        const saved=(await tx.insert(productionRenderRequests).values({id:deps.nextId("production-render"),userId:deps.userId,productionId:production.id,
          ...input,spec,attemptId,taskId:null,assetId:null,createdAt:deps.now()}).returning())[0]!;
        return {request:renderDto(saved),projectId:owned.projectId};
      });
    },
    async attachRender(outputId:string,requestId:string,patch:{taskId?:string;assetId?:string}) {
      return db.transaction(async tx=>{
        await output(tx,outputId,true);
        const production=(await tx.select().from(productions).where(and(eq(productions.contentOutputId,outputId),eq(productions.userId,deps.userId))))[0];
        if(!production)throw new OwnershipError();
        const where=and(eq(productionRenderRequests.productionId,production.id),eq(productionRenderRequests.userId,deps.userId),eq(productionRenderRequests.requestId,requestId));
        const current=(await tx.select().from(productionRenderRequests).where(where).for("update"))[0];
        if(!current)throw new OwnershipError();
        if(patch.taskId && current.taskId && current.taskId!==patch.taskId)throw new ConflictError("该生成请求已经关联另一个任务");
        if(patch.assetId && current.assetId && current.assetId!==patch.assetId)throw new ConflictError("该生成请求已经关联另一份成片");
        const updated=(await tx.update(productionRenderRequests).set(patch).where(where).returning())[0]!;return renderDto(updated);
      });
    },
    async renders(outputId:string,limit:number,offset:number) {
      const {row}=await read(outputId);if(!row)return {items:[],total:0};
      const where=and(eq(productionRenderRequests.productionId,row.id),eq(productionRenderRequests.userId,deps.userId));
      const total=Number((await db.select({count:sql<number>`count(*)`}).from(productionRenderRequests).where(where))[0]?.count??0);
      const rows=await db.select().from(productionRenderRequests).where(where).orderBy(desc(productionRenderRequests.createdAt),desc(productionRenderRequests.id)).limit(limit).offset(offset);
      return {items:rows.map(renderDto),total};
    },
    async commit(outputId:string,input:{expectedRevision:number;requestId:string;requestDigest:string;source:ProductionEditorVersion["source"]; productionPatch?:(row:ProductionRow)=>Parameters<ProductionRepository["updateProduction"]>[1]},
      build:(current:Record<string,unknown>|null,projectId:string,transaction:Db)=>Promise<Record<string,unknown>>) {
      return db.transaction(async tx=>{
        const owned=await output(tx,outputId,true);
        // 统一工程行锁：同请求先读原回执，再检查 CAS。不会以新 revision 重执行旧动作。
        await tx.insert(productions).values({id:deps.nextId("production"),userId:deps.userId,contentOutputId:outputId,updatedAt:deps.now()}).onConflictDoNothing();
        const production=(await tx.select().from(productions).where(and(eq(productions.contentOutputId,outputId),eq(productions.userId,deps.userId))).for("update"))[0];
        if(!production)throw new OwnershipError();
        const previous=await receiptFor(tx,production.id,input.requestId);
        if(previous) {
          if(previous.requestDigest!==input.requestDigest)throw new ConflictError("该请求已用于另一项修改，请重新提交");
          return dto(previous);
        }
        const current=editingPlan(production.recordingConfig), actual=editorRevision(current);
        if(actual!==input.expectedRevision)throw new ConflictError(`制作方案已更新，当前版本为 ${actual}；输入已保留，请重新读取后应用`);
        const patch=input.productionPatch?.(production)??{};
        const candidate=await build(current,owned.projectId,tx as unknown as Db), next={...candidate,revision:actual+1};
        const {recordingConfig,...ordinaryPatch}=patch;
        const nextConfig=recordingConfig===undefined?{...record(production.recordingConfig),videoEditingPlan:next}:{...recordingConfig,videoEditingPlan:next};
        // 第一次明确转换保存保留旧原件；已存在历史不回写。
        if(current)await tx.insert(productionEditVersions).values({id:deps.nextId("production-version"),userId:deps.userId,productionId:production.id,
          revision:actual,requestId:null,requestDigest:null,planDigest:itemDigest(current),source:"legacy",plan:current,createdAt:deps.now()}).onConflictDoNothing();
        const row=(await tx.update(productions).set({...ordinaryPatch,recordingConfig:nextConfig,updatedAt:deps.now()})
          .where(and(eq(productions.id,production.id),eq(productions.userId,deps.userId),sql`coalesce((${productions.recordingConfig}->'videoEditingPlan'->>'revision')::int,0)=${actual}`)).returning())[0];
        if(!row)throw new ConflictError("制作方案已更新，输入已保留");
        const saved=(await tx.insert(productionEditVersions).values({id:deps.nextId("production-version"),userId:deps.userId,productionId:production.id,
          revision:actual+1,requestId:input.requestId,requestDigest:input.requestDigest,planDigest:itemDigest(next),source:input.source,plan:next,createdAt:deps.now()}).returning())[0]!;
        return dto(saved);
      });
    },
  };
}
