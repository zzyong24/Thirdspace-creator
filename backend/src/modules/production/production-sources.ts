import {and,eq,isNull,productionMediaRequests,projects,contentOutputs,type Db} from "@creatoros/backend";
import {executionTaskSpec,productionProbeResult,productionSourcePrepareBody,productionSourceRetryBody,productionSourceAdoptBody,productionSourceRequest,productionPlanV2,productionReferencePlan,type RequestContext,type ExecutionTaskResource,type ExecutionTaskSpec} from "@creatoros/contract";
import {createProductionEditorRepository,type ProductionVersionSavedEvent} from "./production-editor.repository";
import {ConflictError,OwnershipError,requireAccountId,UnsupportedOperationError} from "./production.errors";
import {itemDigest} from "./production-editor-plan";
import {workspaceFilter,workspaceKey,workspaceStamp} from "../../workspace-scope";
import {withWorkspaceWrite,type WorkspaceWriteTx} from "../../workspace-write";
import {lockWorkspaceMembership,type FrozenWorkspace} from "../platform-account/membership-lock.service";
import {accountGroups,accountGroupMemberships} from "../../schema/account-groups";
import {platformAccounts} from "../../schema/platform-account";
/** SEMANTIC_BOUNDARY_ALLOW:调用者先持有真实组SHARE；只读取冻结归属事实，不选择素材或改写旧任务。
 * 已迁移legacy也不升级组锁。无初始组的原账号范围沿用原账号→成员端口，必须在父锁前调用。 */
export async function readProductionWorkspaceFreeze(tx:WorkspaceWriteTx,ctx:RequestContext):Promise<FrozenWorkspace>{
 const key=workspaceKey(ctx),groupId=key.kind==='group'?key.id:`grp_legacy_${key.id}`;
 const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.userId,ctx.userId),eq(accountGroups.id,groupId))).for('share');
 if(!group){if(key.kind==='group')throw new OwnershipError('原冻结账号组不存在');return lockWorkspaceMembership(tx,ctx);}
 if(group.status!=='active')throw new OwnershipError('原冻结账号组不可写');
 const freeze:FrozenWorkspace={userId:ctx.userId,groupId:ctx.groupId??null,accountId:ctx.accountId??null,groupVersion:null,membershipVersion:null};
 if(ctx.accountId){
  // 组SHARE阻止转组/归档提交；这里不在组锁后再等待账号/member写锁，避免与原转组锁序互等。
  const [account]=await tx.select().from(platformAccounts).where(and(eq(platformAccounts.userId,ctx.userId),eq(platformAccounts.id,ctx.accountId)));
  if(!account){if(!ctx.groupId)return freeze;throw new OwnershipError('原平台账号不存在');}
  if(account.status!=='active')throw new OwnershipError('原平台账号不可用');
  const members=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.accountId,ctx.accountId),isNull(accountGroupMemberships.leftAt)));
  if(members.length>1)throw new ConflictError('原账号存在多个有效成员关系');
  const member=members[0];
  if(!member){if(!ctx.groupId)return freeze;throw new ConflictError('原账号缺少有效组归属');}
  if(member.groupId!==groupId||(ctx.membershipVersion!==undefined&&ctx.membershipVersion!==member.version))throw new ConflictError('原账号成员归属已改变');
  freeze.membershipVersion=member.version;
 }
 return {...freeze,groupId:group.id,groupVersion:group.version};
}
export type SourcePorts={readMediaFile:(ctx:RequestContext,input:{projectId:string;assetId:string;assetFileId:string;fileDigest?:string},tx?:Db)=>Promise<{fileDigest:string;mimeType:string}>;
 createTask:(ctx:RequestContext,input:{spec:ExecutionTaskSpec;projectId:string;contentOutputId:string;attemptId:string},tx?:Db)=>Promise<{id:string}>;
 dispatchTask?:(ctx:RequestContext,taskId:string)=>Promise<void>;
 assertTaskSettled:(ctx:RequestContext,taskId:string,generation:number,probeDigest:string,tx:Db)=>Promise<void>;
 readTask:(ctx:RequestContext,id:string)=>Promise<ExecutionTaskResource>;
 retryTask?:(ctx:RequestContext,input:{taskId:string;requestId:string})=>Promise<void>};
export function createProductionSources(deps:{db:Db;now:()=>string;nextId:(p:string)=>string;ports?:SourcePorts;onVersionSaved?:(ctx:RequestContext,event:ProductionVersionSavedEvent,tx:Db)=>Promise<void>}) {
 const repo=(ctx:RequestContext,tx:Db=deps.db)=>createProductionEditorRepository(tx,{now:deps.now,nextId:deps.nextId,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,groupVersion:ctx.groupVersion,membershipVersion:ctx.membershipVersion,onVersionSaved:(event,t)=>deps.onVersionSaved?.(ctx,event,t)??Promise.resolve()});
 const where=(ctx:RequestContext,outputId:string,requestId:string)=>and(eq(productionMediaRequests.userId,ctx.userId),workspaceFilter(productionMediaRequests,ctx),eq(productionMediaRequests.outputId,outputId),eq(productionMediaRequests.requestId,requestId));
 const requirePorts=()=>{if(!deps.ports)throw new UnsupportedOperationError("production.editor.sources");return deps.ports;};
 async function row(ctx:RequestContext,outputId:string,requestId:string){await repo(ctx).read(outputId);const savedRows=await deps.db.select().from(productionMediaRequests).where(where(ctx,outputId,requestId));if(savedRows.length>1)throw new ConflictError("原组同请求存在多个旧账号原片，请按原真实ID复核");const saved=savedRows[0];if(!saved)throw new OwnershipError();return saved;}
 async function get(ctx:RequestContext,outputId:string,requestId:string){
  const saved=await row(ctx,outputId,requestId),frozen=saved.frozenInput as {projectId:string;assetId:string;assetFileId:string;fileDigest:string;sourceId:string;spec:ExecutionTaskSpec};
  const original={...ctx,userId:saved.userId,accountId:saved.accountId,groupId:saved.groupId,groupVersion:saved.groupVersion??undefined,membershipVersion:saved.membershipVersion??undefined};
  let deterministicGeneration:number|undefined;
  let status:ExecutionTaskResource["status"]|"reserved"="reserved",probe:null|ReturnType<typeof productionProbeResult.parse>=null,error:string|null=null;
  if(saved.taskId){const task=await requirePorts().readTask(original,saved.taskId);
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
  const original:RequestContext={...ctx,userId:saved.userId,accountId:saved.accountId,groupId:saved.groupId,groupVersion:saved.groupVersion??undefined,membershipVersion:saved.membershipVersion??undefined};
  // 重放用原task scope；新的retry动作仍先锁当前真实组→父，不能借页面平台筛选重新归属。
  await withWorkspaceWrite(deps.db,{...ctx,...workspaceStamp(workspaceKey(ctx))},async tx=>{const [parent]=await tx.select({id:projects.id,status:projects.status,groupId:projects.groupId,outputGroupId:contentOutputs.groupId}).from(contentOutputs).innerJoin(projects,eq(contentOutputs.projectId,projects.id)).where(and(eq(contentOutputs.id,outputId),eq(projects.userId,ctx.userId),workspaceFilter(projects,ctx))).for('update');if(!parent||parent.groupId!==parent.outputGroupId||parent.status==='archived')throw new OwnershipError('原片父项目不可写');});
  await ports.retryTask(original,{taskId:saved.taskId,requestId:input.requestId});
  return get(ctx,outputId,input.sourceRequestId);
 },async prepare(ctx:RequestContext,outputId:string,raw:unknown){
  const input=productionSourcePrepareBody.parse(raw),ports=requirePorts(),{owned}=await repo(ctx).read(outputId),digest=itemDigest(input);
  const matches=await deps.db.select().from(productionMediaRequests).where(where(ctx,outputId,input.requestId));if(matches.length>1)throw new ConflictError("原组同请求存在多个旧账号原片，请按原真实ID复核");let saved=matches[0];
  if(saved&&saved.requestDigest!==digest)throw new ConflictError("该探针请求已用于另一份原片");
  if(!saved){
   const media=await ports.readMediaFile(ctx,{projectId:owned.projectId,assetId:input.assetId,assetFileId:input.assetFileId});if(!media.mimeType.startsWith("video/"))throw new ConflictError("请选择真实视频原片");
   const sourceId=`source-${itemDigest({userId:ctx.userId,accountId:ctx.accountId,outputId,requestId:input.requestId}).slice(7)}`;
   const spec=executionTaskSpec.parse({taskType:"media.probe",goal:"读取原始口播媒体信息",inputs:[{assetId:input.assetId,assetFileId:input.assetFileId,fileDigest:media.fileDigest,mountAs:"probe-source"}],params:{file:"probe-source"},constraints:{timeoutSec:120,network:"deny",maxOutputMB:1}});
   await withWorkspaceWrite(deps.db,{...ctx,...workspaceStamp(workspaceKey(ctx))},async tx=>{const stamp=workspaceStamp(workspaceKey(ctx)),freeze=await readProductionWorkspaceFreeze(tx,{...ctx,...stamp});const actual=await repo(ctx,tx).read(outputId,true);if(actual.owned.projectId!==owned.projectId)throw new ConflictError("原片父项已改变");await ports.readMediaFile(ctx,{projectId:owned.projectId,assetId:input.assetId,assetFileId:input.assetFileId,fileDigest:media.fileDigest},tx);await tx.insert(productionMediaRequests).values({id:deps.nextId("media-request"),userId:ctx.userId,...stamp,groupVersion:freeze.groupVersion,membershipVersion:freeze.membershipVersion,outputId,requestId:input.requestId,requestDigest:digest,kind:"source",frozenInput:{...input,projectId:owned.projectId,fileDigest:media.fileDigest,sourceId,spec,...(ctx.groupId?{workspaceScope:freeze}:{})},createdAt:deps.now()}).onConflictDoNothing();});
   saved=await row(ctx,outputId,input.requestId);if(saved.requestDigest!==digest)throw new ConflictError("该探针请求已用于另一份原片");
  }
  if(!saved.taskId){const original:RequestContext={...ctx,userId:saved.userId,accountId:saved.accountId,groupId:saved.groupId,groupVersion:saved.groupVersion??undefined,membershipVersion:saved.membershipVersion??undefined},frozen=saved.frozenInput as {spec:ExecutionTaskSpec;projectId:string;workspaceScope?:FrozenWorkspace};
   const attach=async(tx?:WorkspaceWriteTx)=>{if(tx){const actual=await readProductionWorkspaceFreeze(tx,original);const parent=await repo(original,tx).read(outputId,true);if(parent.owned.projectId!==frozen.projectId)throw new ConflictError("原片冻结父项已改变");if(!frozen.workspaceScope||itemDigest(actual)!==itemDigest(frozen.workspaceScope))throw new ConflictError("原片冻结工作区版本已改变，请复核原任务");}const task=await ports.createTask(original,{spec:frozen.spec,projectId:frozen.projectId,contentOutputId:outputId,attemptId:`media-${saved.id}`},tx);await(tx??deps.db).update(productionMediaRequests).set({taskId:task.id}).where(and(where(original,outputId,input.requestId),isNull(productionMediaRequests.taskId)));return task;};
   const task=original.groupId?await deps.db.transaction(async tx=>{
    // 原创建端口还会拿组UPDATE：纯组先持真实组写锁，再进入组→父→原task创建，避免SHARE升级互等。
    if(original.accountId)await lockWorkspaceMembership(tx,original);
    else {const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.userId,original.userId),eq(accountGroups.id,original.groupId!))).for('update');if(!group||group.status!=='active')throw new OwnershipError('原片冻结账号组不可写');}
    return withWorkspaceWrite(tx,original,inner=>attach(inner));
   }):await attach();const bound=await row(original,outputId,input.requestId);if(bound.taskId!==task.id)throw new ConflictError("原片请求已绑定另一项处理，请恢复原请求");if(original.groupId)await ports.dispatchTask?.(original,task.id);
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
