import {workspaceFilter,workspaceKey} from "../../workspace-scope";
import {accountGroups} from "../../schema/account-groups";
import {withWorkspaceWrite} from "../../workspace-write";
import type {RequestContext} from "@creatoros/contract";
import { and, desc, eq, sql, contentOutputs, projects, productions, productionEditVersions, productionRenderRequests, type Db } from "@creatoros/backend";
import type { ProductionEditorVersion, ProductionEditorRenderRequest, ExecutionTaskSpec } from "@creatoros/contract";
import { ConflictError, OwnershipError, requireAccountId } from "./production.errors";
import { itemDigest } from "./production-editor-plan";
import type { RepoDeps, ProductionRow, ProductionRepository } from "./production.repository";

import type {ProductionOverlayMechanicalLineage} from "./production-main-track";

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

export type ProductionVersionSavedEvent={outputId:string;projectId:string;previousPlan:Record<string,unknown>|null;version:ProductionEditorVersion;replay:boolean;mediaLineage?:ProductionOverlayMechanicalLineage[];restoreSourceRevision?:number};
export type ProductionVersionSavedHook=(event:ProductionVersionSavedEvent,tx:Db)=>Promise<void>;
export function createProductionEditorRepository(db:Db,deps:RepoDeps&{groupId?:string|null;groupVersion?:number;membershipVersion?:number;onVersionSaved?:ProductionVersionSavedHook}) {
  const context:RequestContext={userId:deps.userId,accountId:deps.accountId,groupId:deps.groupId,groupVersion:deps.groupVersion,membershipVersion:deps.membershipVersion,source:"user",requestId:"production-editor"};
  async function output(store:Store,outputId:string,lock:boolean|"update"|"history"=false) {
    workspaceKey(context);
    const query=store.select({id:contentOutputs.id,projectId:projects.id,contentType:contentOutputs.contentType,groupId:projects.groupId,outputGroupId:contentOutputs.groupId,projectStatus:projects.status})
      .from(contentOutputs).innerJoin(projects,eq(contentOutputs.projectId,projects.id))
      .where(and(eq(contentOutputs.id,outputId),eq(projects.userId,deps.userId),workspaceFilter(projects,context)));
    const row=(await (lock?query.for(lock==="update"?"update":"share"):query))[0];
    if(!row) throw new OwnershipError();
    if(row.groupId!==row.outputGroupId)throw new OwnershipError("作品与原父归组不一致");
    if(lock&&lock!=='history'&&row.projectStatus==='archived')throw new ConflictError("归档项目只读");
    if(row.contentType!=="video") throw new ConflictError("请选择视频作品进入制作工作台");
    return row;
  }
  async function read(outputId:string,forUpdate=false) {
    const owned=await output(db,outputId,forUpdate?"update":false);
    const query=db.select().from(productions).where(and(eq(productions.contentOutputId,outputId),eq(productions.userId,deps.userId)));
    const row=(await (forUpdate?query.for("update"):query))[0]??null;
    if(row&&row.groupId!==owned.groupId)throw new OwnershipError("制作工程与原父归组不一致");
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
    async receiptProof(outputId:string,requestId:string){const {row}=await read(outputId);if(!row)return null;const found=await receiptFor(db,row.id,requestId);return found?{receipt:dto(found),requestDigest:found.requestDigest,planDigest:found.planDigest}:null;},
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
      return withWorkspaceWrite(db,context,async tx=>{
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
        if(version&&record(version.plan).editorVersion===3)throw new ConflictError('请在开源剪辑工作台导出当前视频；原方案可从历史恢复后继续生成');
        if(!version || ![1,2].includes(Number(record(version.plan).editorVersion)))throw new ConflictError("请先保存该制作方案，再生成视频");
        const spec=await build(record(version.plan),owned.projectId,tx as unknown as Db);
        const attemptId=`production-render-${itemDigest({productionId:production.id,requestId:input.requestId}).slice(7)}`;
        const saved=(await tx.insert(productionRenderRequests).values({id:deps.nextId("production-render"),userId:deps.userId,groupId:owned.groupId,productionId:production.id,
          ...input,spec,attemptId,taskId:null,assetId:null,createdAt:deps.now()}).returning())[0]!;
        return {request:renderDto(saved),projectId:owned.projectId};
      });
    },
    async attachRender(outputId:string,requestId:string,patch:{taskId?:string;assetId?:string}) {
      return withWorkspaceWrite(db,context,async tx=>{
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
    async commit(outputId:string,input:{expectedRevision:number;requestId:string;requestDigest:string;source:ProductionEditorVersion["source"];getMediaLineage?:()=>ProductionOverlayMechanicalLineage[];restoreSourceRevision?:number; productionPatch?:(row:ProductionRow)=>Parameters<ProductionRepository["updateProduction"]>[1]},
      build:(current:Record<string,unknown>|null,projectId:string,transaction:Db)=>Promise<Record<string,unknown>>) {
      // 只读归档回执：组SHARE→父SHARE→原版本，不运行build/hook、不写工程；没有完整原回执仍走下面active写门。
      const archivedReceipt=await withWorkspaceWrite(db,context,async tx=>{
        const owned=await output(tx,outputId,'history');const [production]=await tx.select().from(productions).where(and(eq(productions.contentOutputId,outputId),eq(productions.userId,deps.userId))).for('share');if(!production)return null;if(production.groupId!==owned.groupId)throw new OwnershipError('制作工程与原父归组不一致');const previous=await receiptFor(tx,production.id,input.requestId);if(!previous)return null;if(previous.requestDigest!==input.requestDigest||previous.planDigest!==itemDigest(record(previous.plan)))throw new ConflictError('原制作回执完整输入或摘要不符');const groupId=owned.groupId??(deps.accountId?`grp_legacy_${deps.accountId}`:null);const group=groupId?(await tx.select().from(accountGroups).where(and(eq(accountGroups.id,groupId),eq(accountGroups.userId,deps.userId))))[0]:null;return owned.projectStatus==='archived'||group?.status==='archived'?dto(previous):null;
      },{allowArchived:true});if(archivedReceipt)return archivedReceipt;
      return withWorkspaceWrite(db,context,async tx=>{
        const owned=await output(tx,outputId,true);
        // 统一工程行锁：同请求先读原回执，再检查 CAS。不会以新 revision 重执行旧动作。
        await tx.insert(productions).values({id:deps.nextId("production"),userId:deps.userId,groupId:owned.groupId,contentOutputId:outputId,updatedAt:deps.now()}).onConflictDoNothing();
        const production=(await tx.select().from(productions).where(and(eq(productions.contentOutputId,outputId),eq(productions.userId,deps.userId))).for("update"))[0];
        if(!production)throw new OwnershipError();
        const previous=await receiptFor(tx,production.id,input.requestId);
        if(previous) {
          if(previous.requestDigest!==input.requestDigest)throw new ConflictError("该请求已用于另一项修改，请重新提交");
          const version=dto(previous);await deps.onVersionSaved?.({outputId,projectId:owned.projectId,previousPlan:null,version,replay:true},tx as unknown as Db);
          return version;
        }
        const current=editingPlan(production.recordingConfig), actual=editorRevision(current);
        if(actual!==input.expectedRevision)throw new ConflictError(`制作方案已更新，当前版本为 ${actual}；输入已保留，请重新读取后应用`);
        const patch=input.productionPatch?.(production)??{};
        const candidate=await build(current,owned.projectId,tx as unknown as Db), next={...candidate,revision:actual+1};
        const {recordingConfig,...ordinaryPatch}=patch;
        const nextConfig=recordingConfig===undefined?{...record(production.recordingConfig),videoEditingPlan:next}:{...recordingConfig,videoEditingPlan:next};
        // 第一次明确转换保存保留旧原件；已存在历史不回写。
        if(current)await tx.insert(productionEditVersions).values({id:deps.nextId("production-version"),userId:deps.userId,groupId:owned.groupId,productionId:production.id,
          revision:actual,requestId:null,requestDigest:null,planDigest:itemDigest(current),source:"legacy",plan:current,createdAt:deps.now()}).onConflictDoNothing();
        const row=(await tx.update(productions).set({...ordinaryPatch,recordingConfig:nextConfig,updatedAt:deps.now()})
          .where(and(eq(productions.id,production.id),eq(productions.userId,deps.userId),sql`coalesce((${productions.recordingConfig}->'videoEditingPlan'->>'revision')::int,0)=${actual}`)).returning())[0];
        if(!row)throw new ConflictError("制作方案已更新，输入已保留");
        const saved=(await tx.insert(productionEditVersions).values({id:deps.nextId("production-version"),userId:deps.userId,groupId:owned.groupId,productionId:production.id,
          revision:actual+1,requestId:input.requestId,requestDigest:input.requestDigest,planDigest:itemDigest(next),source:input.source,plan:next,createdAt:deps.now()}).returning())[0]!;
        const version=dto(saved);await deps.onVersionSaved?.({outputId,projectId:owned.projectId,previousPlan:current,version,replay:false,...(input.getMediaLineage?{mediaLineage:input.getMediaLineage()}:{}),...(input.restoreSourceRevision===undefined?{}:{restoreSourceRevision:input.restoreSourceRevision})},tx as unknown as Db);
        return version;
      });
    },
  };
}
