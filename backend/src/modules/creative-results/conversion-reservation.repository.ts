import {createHash,randomUUID} from "node:crypto";
import {and,eq,isNull} from "drizzle-orm";
import {type Db} from "@creatoros/backend";
import {outputConversionRequest,outputConversionContext,type OutputConversionContext,type OutputConversionRequest,type OutputConversionSourceAnchor,type RequestContext} from "@creatoros/contract";
import {creativeResultBundles} from "../../schema/creative-results";
import {projects,contentOutputs} from "../../schema/projects";
import {workspaceFilter,workspaceKey,workspaceStamp} from "../../workspace-scope";
import {withWorkspaceParentWrite,type WorkspaceWriteTx} from "../../workspace-write";

function fail(code:string,message:string):never {throw Object.assign(new Error(message),{code});}
// SEMANTIC_BOUNDARY_ALLOW: 只规范用户明确选择的集合与协议键，保留复用图片顺序，不作内容取舍。
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
function digest(request:OutputConversionRequest) {
  const normalized=request.mode==="whole"?request:{...request,sourceSectionIds:[...request.sourceSectionIds].sort(),sourceFields:[...request.sourceFields].sort(),
    targetFields:[...request.targetFields].sort(),textRanges:[...request.textRanges].sort((a,b)=>a.field.localeCompare(b.field)||a.start-b.start)};
  return createHash("sha256").update(JSON.stringify(canonical(normalized))).digest("hex");
}
export type ConversionReservation={id:string;projectId:string;outputId:string|null;context:OutputConversionContext;targetCreationKey:string;requestDigest:string};
export function createConversionReservationRepository(db:Db,deps:{now?:()=>string;nextId?:()=>string;assertProject:(ctx:RequestContext,projectId:string)=>Promise<void>;readCreatedTarget:(ctx:RequestContext,reservation:ConversionReservation)=>Promise<{id:string;projectId:string;contentType:string;targetPlatform:string|null}>}) {
  const now=deps.now??(()=>new Date().toISOString()),nextId=deps.nextId??randomUUID;
  function scope(ctx:RequestContext,clientRequestId:string) {return and(eq(creativeResultBundles.userId,ctx.userId),workspaceFilter(creativeResultBundles,ctx),eq(creativeResultBundles.clientRequestId,clientRequestId));}
  async function find(ctx:RequestContext,key:string,id?:string) {
    const rows=await db.select().from(creativeResultBundles).where(and(scope(ctx,key),id?eq(creativeResultBundles.id,id):undefined));
    if(rows.length>1)fail("IDEMPOTENCY_CONFLICT","同组旧预约来自多个真实账号，请使用原预约ID恢复");
    return rows[0];
  }
  async function withParent<T>(ctx:RequestContext,projectId:string,work:(tx:WorkspaceWriteTx)=>Promise<T>):Promise<T>{
    return withWorkspaceParentWrite(db,ctx,{table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId},[projectId],async tx=>{
      const [parent]=await tx.select({archivedAt:projects.archivedAt,status:projects.status}).from(projects).where(eq(projects.id,projectId));
      if(!parent||parent.archivedAt||parent.status==="archived")fail("OUTPUT_NOT_OWNED","项目已归档，不能新增转换副作用");
      return work(tx);
    });
  }
  async function decode(ctx:RequestContext,row:typeof creativeResultBundles.$inferSelect):Promise<ConversionReservation> {
    if(!row.conversionContext||!row.targetCreationKey)fail("IDEMPOTENCY_CONFLICT","该请求号已用于其他作品任务");
    await deps.assertProject(ctx,row.projectId);
    return {id:row.id,projectId:row.projectId,outputId:row.outputId,context:outputConversionContext.parse(row.conversionContext),targetCreationKey:row.targetCreationKey,requestDigest:row.requestDigest};
  }
  async function verify(ctx:RequestContext,row:typeof creativeResultBundles.$inferSelect,request:OutputConversionRequest) {
    if(row.requestDigest!==digest(request))fail("IDEMPOTENCY_CONFLICT","原请求号对应的转换意图已改变，请使用新请求号");
    return decode(ctx,row);
  }
  return {
    async get(ctx:RequestContext,key:string) {const row=await find(ctx,key);if(!row)fail("OUTPUT_NOT_OWNED","转换请求不存在");return decode(ctx,row);},
    async reserve(ctx:RequestContext,input:OutputConversionRequest,freeze:()=>Promise<{projectId:string;sourceAnchor:OutputConversionSourceAnchor}>) {
      const request=outputConversionRequest.parse(input),prior=await find(ctx,request.clientRequestId);
      if(prior)return verify(ctx,prior,request);
      let frozen:Awaited<ReturnType<typeof freeze>>;
      try {frozen=await freeze();} catch(error) {const winner=await find(ctx,request.clientRequestId);if(winner)return verify(ctx,winner,request);throw error;}
      await deps.assertProject(ctx,frozen.projectId);
      const context=outputConversionContext.parse({request,sourceAnchor:frozen.sourceAnchor}),id=nextId();
      await withParent(ctx,frozen.projectId,async tx=>{
        await tx.insert(creativeResultBundles).values({id,userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),projectId:frozen.projectId,outputId:null,items:[],conversionContext:context,
          targetCreationKey:`conversion-target-${id}`,requestDigest:digest(request),clientRequestId:request.clientRequestId,createdAt:now()}).onConflictDoNothing();
      });
      const winner=await find(ctx,request.clientRequestId);if(!winner)fail("CONVERSION_RESERVATION_FAILED","转换预约未保存");return verify(ctx,winner,request);
    },
    async bindOutput(ctx:RequestContext,reservation:ConversionReservation,output:{id:string;projectId:string}) {
      const row=await find(ctx,reservation.context.request.clientRequestId,reservation.id);if(!row)fail("OUTPUT_NOT_OWNED","转换请求不存在");
      const actual=await verify(ctx,row,reservation.context.request);
      if(actual.id!==reservation.id||actual.requestDigest!==reservation.requestDigest||output.projectId!==actual.projectId)fail("IDEMPOTENCY_CONFLICT","目标作品与转换预约不一致");
      if(actual.outputId!==null){
        if(actual.outputId!==output.id)fail("IDEMPOTENCY_CONFLICT","原转换请求已绑定其他作品");
        return actual;
      }
      const created=await deps.readCreatedTarget(ctx,actual);
      if(created.id!==output.id||created.projectId!==actual.projectId||created.contentType!==actual.context.request.targetType||created.targetPlatform!==(actual.context.request.targetPlatform??null))fail("IDEMPOTENCY_CONFLICT","目标作品没有匹配原预约的真实创建回执");
      await withParent(ctx,actual.projectId,async tx=>{
        const [target]=await tx.select({id:contentOutputs.id}).from(contentOutputs).where(and(eq(contentOutputs.id,output.id),eq(contentOutputs.projectId,actual.projectId))).for("share");
        if(!target)fail("OUTPUT_NOT_OWNED","目标作品不属于原真实父项目");
        await tx.update(creativeResultBundles).set({outputId:output.id}).where(and(scope(ctx,reservation.context.request.clientRequestId),eq(creativeResultBundles.id,actual.id),eq(creativeResultBundles.requestDigest,actual.requestDigest),isNull(creativeResultBundles.outputId)));
      });
      const winner=await find(ctx,reservation.context.request.clientRequestId,reservation.id);if(!winner||winner.outputId!==output.id)fail("IDEMPOTENCY_CONFLICT","原转换请求已绑定其他作品");return decode(ctx,winner);
    },
  };
}
