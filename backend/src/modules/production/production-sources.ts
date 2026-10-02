import {and,eq,isNull,productionMediaRequests,type Db} from "@creatoros/backend";
import {executionTaskSpec,productionProbeResult,productionSourcePrepareBody,productionSourceRetryBody,productionSourceAdoptBody,productionSourceRequest,productionPlanV2,productionReferencePlan,type RequestContext,type ExecutionTaskResource,type ExecutionTaskSpec} from "@creatoros/contract";
import {createProductionEditorRepository,type ProductionVersionSavedEvent} from "./production-editor.repository";
import {ConflictError,OwnershipError,requireAccountId,UnsupportedOperationError} from "./production.errors";
import {itemDigest} from "./production-editor-plan";
export type SourcePorts={readMediaFile:(ctx:RequestContext,input:{projectId:string;assetId:string;assetFileId:string;fileDigest?:string},tx?:Db)=>Promise<{fileDigest:string;mimeType:string}>;
 createTask:(ctx:RequestContext,input:{spec:ExecutionTaskSpec;projectId:string;contentOutputId:string;attemptId:string})=>Promise<{id:string}>;
 assertTaskSettled:(ctx:RequestContext,taskId:string,generation:number,probeDigest:string,tx:Db)=>Promise<void>;
 readTask:(ctx:RequestContext,id:string)=>Promise<ExecutionTaskResource>;
 retryTask?:(ctx:RequestContext,input:{taskId:string;requestId:string})=>Promise<void>};
export function createProductionSources(deps:{db:Db;now:()=>string;nextId:(p:string)=>string;ports?:SourcePorts;onVersionSaved?:(ctx:RequestContext,event:ProductionVersionSavedEvent,tx:Db)=>Promise<void>}) {
 const repo=(ctx:RequestContext)=>createProductionEditorRepository(deps.db,{now:deps.now,nextId:deps.nextId,userId:ctx.userId,accountId:ctx.accountId??null,onVersionSaved:(event,t)=>deps.onVersionSaved?.(ctx,event,t)??Promise.resolve()});
 const where=(ctx:RequestContext,outputId:string,requestId:string)=>and(eq(productionMediaRequests.userId,ctx.userId),eq(productionMediaRequests.accountId,requireAccountId(ctx.accountId)),eq(productionMediaRequests.outputId,outputId),eq(productionMediaRequests.requestId,requestId));
 const requirePorts=()=>{if(!deps.ports)throw new UnsupportedOperationError("production.editor.sources");return deps.ports;};
 async function row(ctx:RequestContext,outputId:string,requestId:string){await repo(ctx).read(outputId);const [saved]=await deps.db.select().from(productionMediaRequests).where(where(ctx,outputId,requestId));if(!saved)throw new OwnershipError();return saved;}
 async function get(ctx:RequestContext,outputId:string,requestId:string){
  const saved=await row(ctx,outputId,requestId),frozen=saved.frozenInput as {projectId:string;assetId:string;assetFileId:string;fileDigest:string;sourceId:string;spec:ExecutionTaskSpec};
  let deterministicGeneration:number|undefined;
  let status:"reserved"|"queued"|"running"|"succeeded"|"failed"|"cancelled"="reserved",probe:null|ReturnType<typeof productionProbeResult.parse>=null,error:string|null=null;
  if(saved.taskId){const task=await requirePorts().readTask(ctx,saved.taskId);
   if(task.projectId!==frozen.projectId||task.execType!=="media.probe"||itemDigest(task.spec)!==itemDigest(frozen.spec))throw new ConflictError("探针执行与冻结原片不一致");
   deterministicGeneration=task.deterministicGeneration ?? 0;
   status=task.status==="awaiting_confirmation"?"succeeded":task.status;
   if(status==="succeeded"){
    if(!task.manifest||task.manifest.taskType!=="media.probe")throw new ConflictError("探针任务没有真实完成回执");
    probe=productionProbeResult.parse(task.manifest.meta.probe);if(probe.fileDigest!==frozen.fileDigest)throw new ConflictError("探针文件字节与原冻结输入不一致");
   }
   if(status==="failed")error="原片探针失败，原文件与工程保留，请检查媒体工具与原片文件";
  }
  return productionSourceRequest.parse({deterministicGeneration,requestId,taskId:saved.taskId,status,sourceId:frozen.sourceId,assetId:frozen.assetId,assetFileId:frozen.assetFileId,probe,error});
 }
 return {get,async retry(ctx:RequestContext,outputId:string,raw:unknown){
  const input=productionSourceRetryBody.parse(raw),saved=await row(ctx,outputId,input.sourceRequestId);
  await get(ctx,outputId,input.sourceRequestId);
  if(!saved.taskId)throw new ConflictError("请恢复尚未确认的原处理请求");
  const ports=requirePorts();if(!ports.retryTask)throw new UnsupportedOperationError("production.editor.sources.retry");
  await ports.retryTask(ctx,{taskId:saved.taskId,requestId:input.requestId});
  return get(ctx,outputId,input.sourceRequestId);
 },async prepare(ctx:RequestContext,outputId:string,raw:unknown){
  const input=productionSourcePrepareBody.parse(raw),ports=requirePorts(),{owned}=await repo(ctx).read(outputId),digest=itemDigest(input);
  let [saved]=await deps.db.select().from(productionMediaRequests).where(where(ctx,outputId,input.requestId));
  if(saved&&saved.requestDigest!==digest)throw new ConflictError("该探针请求已用于另一份原片");
  if(!saved){
   const media=await ports.readMediaFile(ctx,{projectId:owned.projectId,assetId:input.assetId,assetFileId:input.assetFileId});if(!media.mimeType.startsWith("video/"))throw new ConflictError("请选择真实视频原片");
   const sourceId=`source-${itemDigest({userId:ctx.userId,accountId:ctx.accountId,outputId,requestId:input.requestId}).slice(7)}`;
   const spec=executionTaskSpec.parse({taskType:"media.probe",goal:"读取原始口播媒体信息",inputs:[{assetId:input.assetId,assetFileId:input.assetFileId,fileDigest:media.fileDigest,mountAs:"probe-source"}],params:{file:"probe-source"},constraints:{timeoutSec:120,network:"deny",maxOutputMB:1}});
   await deps.db.insert(productionMediaRequests).values({id:deps.nextId("media-request"),userId:ctx.userId,accountId:requireAccountId(ctx.accountId),outputId,requestId:input.requestId,requestDigest:digest,kind:"source",frozenInput:{...input,projectId:owned.projectId,fileDigest:media.fileDigest,sourceId,spec},createdAt:deps.now()}).onConflictDoNothing();
   saved=await row(ctx,outputId,input.requestId);if(saved.requestDigest!==digest)throw new ConflictError("该探针请求已用于另一份原片");
  }
  if(!saved.taskId){const frozen=saved.frozenInput as {spec:ExecutionTaskSpec;projectId:string},task=await ports.createTask(ctx,{spec:frozen.spec,projectId:frozen.projectId,contentOutputId:outputId,attemptId:`media-${saved.id}`});
   await deps.db.update(productionMediaRequests).set({taskId:task.id}).where(and(where(ctx,outputId,input.requestId),isNull(productionMediaRequests.taskId)));
   const bound=await row(ctx,outputId,input.requestId);if(bound.taskId!==task.id)throw new ConflictError("原片请求已绑定另一项处理，请恢复原请求");
  }
  return get(ctx,outputId,input.requestId);
 },async adopt(ctx:RequestContext,outputId:string,raw:unknown){
  const input=productionSourceAdoptBody.parse(raw),owner=repo(ctx),requestDigest=itemDigest({op:"source-adopt",input});
  const old=await owner.receipt(outputId,input.requestId);
  // commit 仍核验原回执完整输入，先恢复后不重新取当前媒体或任务。
  if(old)return owner.commit(outputId,{...input,source:"manual",requestDigest},async()=>old.plan);
  const candidate=await get(ctx,outputId,input.sourceRequestId),saved=await row(ctx,outputId,input.sourceRequestId);
  if(candidate.status!=="succeeded"||!candidate.probe)throw new ConflictError("原片探针尚未成功，请等处理完成后采用");
  const source={sourceId:candidate.sourceId,assetId:candidate.assetId,assetFileId:candidate.assetFileId,...candidate.probe};
  const frozen=saved.frozenInput as {projectId:string};
  // 字节校验在事务外完成；事务内只复核归属和当前文件记录。
  const verified=await requirePorts().readMediaFile(ctx,{projectId:frozen.projectId,assetId:source.assetId,assetFileId:source.assetFileId,fileDigest:source.fileDigest});
  if(verified.fileDigest!==source.fileDigest)throw new ConflictError("原片字节与冻结探针不一致，工程保留");
  return owner.commit(outputId,{...input,source:"manual",requestDigest},async(current,projectId,tx)=>{
   await requirePorts().assertTaskSettled(ctx,saved.taskId!,candidate.deterministicGeneration ?? 0,source.probeDigest,tx);
   await requirePorts().readMediaFile(ctx,{projectId,assetId:source.assetId,assetFileId:source.assetFileId,fileDigest:source.fileDigest},tx);
   if(current?.editorVersion===3){
    const plan=productionReferencePlan.parse(current),ref=plan.referenceEditor.mediaRefs.find(r=>r.mediaId===input.mediaId);
    if(!ref||ref.assetId!==source.assetId||ref.assetFileId!==source.assetFileId||input.addWholeClip)throw new ConflictError('请明确绑定当前原生视频素材且只注册来源，不添加第二主轨');
    const sources=plan.nativeSources??[],prior=sources.find(s=>s.mediaId===input.mediaId||s.source.sourceId===source.sourceId);
    if(prior&&(prior.mediaId!==input.mediaId||itemDigest(prior.source)!==itemDigest(source)))throw new ConflictError('冻结原生来源不能替换');
    if(!prior)plan.nativeSources=[...sources,{mediaId:input.mediaId!,source}];return productionReferencePlan.parse(plan);
   }
   if(current&&current.editorVersion!==2)throw new ConflictError("请先明确转换旧方案，原方案保留");
   const plan=productionPlanV2.parse(current??{editorVersion:2,mainTrack:{sources:[],clips:[]},overlayDraft:{meta:{title:"原片粗剪"},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]});
   const prior=plan.mainTrack.sources.find(s=>s.sourceId===source.sourceId);if(prior&&itemDigest(prior)!==itemDigest(source))throw new ConflictError("冻结来源不能替换");
   if(!prior)plan.mainTrack.sources.push(source);
   const clipId=`clip-${saved.id}`;if(input.addWholeClip&&!plan.mainTrack.clips.some(c=>c.clipId===clipId))plan.mainTrack.clips.push({clipId,sourceId:source.sourceId,sourceInTicks:0,sourceOutTicks:source.durationTicks});
   return productionPlanV2.parse(plan);
  });
 }};
}
