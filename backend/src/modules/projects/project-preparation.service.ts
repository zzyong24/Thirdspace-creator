import {ProjectPreparationInputRequired} from './project-preparation-input-required';
import {findModelEngineUnavailable} from '../execution/model-engine-error';
import {readLegacyRadarPendingCalls} from '../execution/retired-radar-upgrade.service';
import {and,eq} from 'drizzle-orm';
import {
 projectPreparationStartInput,projectPreparationTranscriptInput,projectPreparationCandidateAcceptInput,projectPreparationResource,projectPreparationStep,
 type RequestContext,type ProjectSource,type ProjectSourceReference,type ProjectPreparationStep,type ProjectPreparationCandidate,type ProjectPreparationResource,type ProjectPreparationAcceptanceReceipt,
} from '@creatoros/contract';
import {createContinuousExecutionBudget} from '@creatoros/contract/execution-worker';
import type {Db} from '../../db';
import {ConflictError} from '../../errors';
import {lockWorkspaceMembership} from '../platform-account/membership-lock.service';
import {projectSourceReferences} from './projects.db-schema';
import {createProjectRepository,type ProjectRow} from './projects.repository';
import {createProjectsService,type ServiceDeps} from './projects.service';
import {lockOwnedProjectForUpdate} from './project-lock.service';
import {projectIntakeDigest,type IntakeTransaction, type ProjectPreparationReservationPort} from './project-intake.service';
import {createPersistentTaskService,type PersistentTaskService,type PersistentTaskClaim} from '../execution/persistent-task.service';
import {createProjectPreparationStateService} from '../execution/project-preparation-state.service';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {createArtifactsService} from '../artifacts/artifacts.service';
import {createScriptDraftTargetService} from '../artifacts/script-draft-target.service';
import {createConfirmedProjectScriptReader} from '../../application/context/confirmed-project-script';

export type PreparationStepName=ProjectPreparationStep['name'];
export type PreparationContent={kind:'brief';brief:string;briefDetail:Record<string,unknown>}|{kind:'draft';text:string};
export type PreparationDispatchResult=
 |{status:'done'|'not_required'|'waiting_user';reasonCode:string;message?:string}
 |{status:'child';childTaskId:string;businessTaskId:string|null;shared:boolean;sourceDigest:string;transformId?:string};
export type PreparationBaseline={digest:string;projectVersion:number;artifactVersion:number|null;inputDigest?:string};
export type PreparationCheckpoint={schemaVersion:1;projectId:string;stage:string;revision:number;steps:ProjectPreparationStep[];activeStep:PreparationStepName|null;blockedChildId:string|null;blockedAtAttempt:number|null;lastError:ProjectPreparationResource['lastError'];candidates:ProjectPreparationCandidate[];candidateBaselines:Record<string,PreparationBaseline>;candidateContents:Record<string,PreparationContent>;resumedChildren?:Record<string,string>;stepBaselines?:Partial<Record<PreparationStepName,PreparationBaseline>>;receipts?:Record<string,{requestDigest:string;receipt:ProjectPreparationAcceptanceReceipt}>;sourceRevisions?:Array<{revision:number;steps:ProjectPreparationStep[]}>;startRequests?:Record<string,string>;submissions?:Record<string,string>};
export interface ProjectPreparationDeps extends ServiceDeps {
 tasks:PersistentTaskService;
 dispatch(ctx:RequestContext,input:{project:ProjectRow;references:ProjectSourceReference[];step:PreparationStepName;claim:PersistentTaskClaim}):Promise<PreparationDispatchResult>;
 readCandidate?(ctx:RequestContext,projectId:string,candidate:ProjectPreparationCandidate,store:Db):Promise<PreparationContent>;
 collect?(ctx:RequestContext,input:{project:ProjectRow;step:ProjectPreparationStep;childTaskId:string}):Promise<Array<{candidate:ProjectPreparationCandidate;content:PreparationContent}>>;
 provideTranscript?(ctx:RequestContext,input:ReturnType<typeof projectPreparationTranscriptInput.parse>&{projectId:string},tx:Db):Promise<{sourceDigest:string;transcriptHash?:string|null}>;
}
const steps:PreparationStepName[]=['transcript','source_draft','brief'];
function initial(projectId:string,requested:PreparationStepName[]):PreparationCheckpoint {
 return {schemaVersion:1,projectId,stage:'queued',revision:0,activeStep:null,blockedChildId:null,blockedAtAttempt:null,lastError:null,candidates:[],candidateBaselines:{},candidateContents:{},steps:steps.map(name=>projectPreparationStep.parse({name,required:requested.includes(name),reasonCode:requested.includes(name)?'USER_REQUESTED':'NOT_REQUESTED',status:requested.includes(name)?'pending':'not_required',revision:0,childTaskId:null,businessTaskId:null,childOwner:null,reuse:null,attempt:null,inputDigest:null,outputReferences:[],startedAt:null,completedAt:null,lastError:null,availableActions:[]}))};
}
function checkpoint(value:unknown,projectId:string):PreparationCheckpoint {
 const cp=value as PreparationCheckpoint;
 if(cp?.schemaVersion!==1||cp.projectId!==projectId||!Array.isArray(cp.steps)||!Array.isArray(cp.candidates))throw new ConflictError('项目准备检查点不可读取');
 const normalized=structuredClone(cp);
 // 已持久化的就绪事实只纠正状态名，不补造历史完成时刻或模型调用。
 for(const step of normalized.steps)if(step.name==='transcript'&&step.status==='not_required'&&step.reasonCode==='TRANSCRIPT_ALREADY_AVAILABLE')step.status='done';
 settleAcceptedPreparationSteps(normalized);
 return normalized;
}
function settleAcceptedPreparationSteps(cp:PreparationCheckpoint){
 // SEMANTIC_BOUNDARY_ALLOW: 只投影既有真实采纳回执，不推断候选内容或补造完成时刻。
 for(const step of cp.steps){
  if(step.status!=='candidate_ready'||!step.childTaskId)continue;
  const kind=step.name==='brief'?'brief':step.name==='source_draft'?'draft':null;
  if(!kind)continue;
  const candidates=cp.candidates.filter(candidate=>candidate.sourceTaskId===step.childTaskId&&candidate.kind===kind);
  if(!candidates.length||!candidates.every(candidate=>candidate.status==='accepted'&&candidate.acceptanceReceipt?.candidateId===candidate.id&&candidate.acceptanceReceipt.sourceTaskId===candidate.sourceTaskId&&candidate.acceptanceReceipt.projectId===cp.projectId))continue;
  step.status='done';step.availableActions=[];step.lastError=null;
  const acceptedAt=candidates.map(candidate=>candidate.acceptanceReceipt!.acceptedAt).sort().at(-1);
  if(acceptedAt)step.completedAt=acceptedAt;
 }
}
const liveStatuses=['queued','running','retry_wait','paused','pause_requested','cancel_requested','waiting_user','unknown_result','blocked'];
const currentErrorStatuses=['failed','blocked','waiting_user','unknown_result','paused'];
/** 仅识别抖音登录墙；不得误伤 CODEX_LOGIN_REQUIRED（含子串 LOGIN_REQUIRED）。 */
function douyinLoginError(error:unknown){
 if(findModelEngineUnavailable(error))return false;
 const value=error as {name?:string;errorCode?:string;code?:string;message?:string;cause?:unknown};
 const parts:string[]=[];
 let current:unknown=error;const seen=new Set<unknown>();
 for(let depth=0;current&&typeof current==='object'&&!seen.has(current)&&depth<6;depth++){
  seen.add(current);
  const record=current as {name?:unknown;errorCode?:unknown;code?:unknown;message?:unknown;cause?:unknown};
  for(const key of ['name','errorCode','code','message'] as const){if(typeof record[key]==='string')parts.push(record[key]);}
  current=record.cause;
 }
 const text=parts.join('\n');
 if(/\bCODEX_[A-Z_]+\b/.test(text))return false;
 return /DouyinNotLoggedInError|TRANSCRIBE_LOGIN_REQUIRED|DOUYIN_FAVORITES_SESSION_EXPIRED|未检测到抖音创作者中心登录态|(?:^|[^A-Z_])LOGIN_REQUIRED(?:[^A-Z_]|$)/.test(text);
}
const douyinLoginMessage='请在当前账号完成抖音登录后继续原任务；去「设置 → 账户」扫码登录，或手工补逐字稿后继续';
function clearStepError(cp:PreparationCheckpoint,step:ProjectPreparationStep){
 step.lastError=null;step.availableActions=step.availableActions.filter(action=>!['retry','resume','check_result','provide_transcript'].includes(action));
 cp.lastError=cp.steps.find(value=>currentErrorStatuses.includes(value.status)&&value.lastError)?.lastError??null;
 if(cp.blockedChildId===step.childTaskId){cp.blockedChildId=null;cp.blockedAtAttempt=null;}
}
export function createProjectPreparationService(db:Db,deps:ProjectPreparationDeps){
 const states=createProjectPreparationStateService(db),repo=createProjectRepository(db),leases=createExecutionLeaseService(db,deps);
 const artifactsFor=(store:Db)=>createArtifactsService({db:store,...deps,assertProjectOwned:(ctx,id)=>createProjectRepository(store).get(ctx,id),resolveOutputProjectId:async(ctx,id)=>(await createProjectRepository(store).getOutput(ctx,id)).projectId});
 async function references(ctx:RequestContext,projectId:string,store=db):Promise<ProjectSourceReference[]>{
  await createProjectRepository(store).get(ctx,projectId);
  const rows=await store.select().from(projectSourceReferences).where(eq(projectSourceReferences.projectId,projectId));
  return rows.map(row=>({id:row.id,projectId:row.projectId,sourceKey:row.sourceKey,url:row.url,bodyAvailable:row.bodyAvailable,sourceDigest:row.sourceDigest,transcriptHash:row.transcriptHash,createdAt:row.createdAt,updatedAt:row.updatedAt,...(row.sourceKind==='intelligence_item'?{sourceKind:'intelligence_item' as const,itemId:row.itemId!,snapshotId:row.snapshotId!}:{sourceKind:'platform_work' as const,accountId:row.accountId!,platform:row.platform as 'douyin',externalId:row.externalId!})}));
 }
 async function readBaseline(ctx:RequestContext,projectId:string,store=db):Promise<PreparationBaseline>{
  const projects=createProjectsService(createProjectRepository(store),deps),project=await projects.getProject(ctx,projectId),artifacts=artifactsFor(store);
  const script=await createConfirmedProjectScriptReader({projectsService:projects,artifactsService:artifacts})(ctx,projectId);
  const version=script?(await artifacts.listVersions(ctx,script.artifactId)).find(v=>v.id===script.versionId):null;
  return {inputDigest:projectIntakeDigest({title:project.title,brief:project.brief,briefDetail:project.briefDetail,script}),digest:projectIntakeDigest({title:project.title,brief:project.brief,briefDetail:project.briefDetail,updatedAt:project.updatedAt,script}),projectVersion:Date.parse(project.updatedAt),artifactVersion:version?.versionNumber??null};
 }
 async function reserve(ctx:RequestContext,input:Parameters<ProjectPreparationReservationPort['reserve']>[1],tx:IntakeTransaction,requested?:PreparationStepName[]){
  const selected=requested??(input.source==='imported'?[]:input.source==='topic'?['transcript','source_draft','brief'] as PreparationStepName[]:input.sourceReferences.length?['transcript','source_draft'] as PreparationStepName[]:[]);
  if(!selected.length)return null;
  const store=tx as unknown as Db;
  const parent=await createPersistentTaskService(store,deps).enqueue(ctx,{kind:'project_preparation',ownerType:'project',ownerId:input.project.id,idempotencyKey:input.intakeId,executionBudget:input.source==='radar'?createContinuousExecutionBudget():{maxCalls:64,maxTokens:1000000,deadlineMs:1800000},payload:{schemaVersion:1,projectId:input.project.id,intakeId:input.intakeId,origin:input.source,sourceReferenceIds:input.sourceReferences.map(r=>r.id),sourceIdentities:input.sourceReferences.map(r=>({id:r.id,digest:r.sourceDigest})),positioningVersionId:input.positioningVersionId??null,requestedSteps:selected,inputRevision:0}});
  const pending=(await Promise.all(input.sourceReferences.filter(r=>r.sourceKind==='intelligence_item').map(r=>readLegacyRadarPendingCalls(store,ctx,r.itemId!)))).flat();
  await createProjectPreparationStateService(store).update(ctx,parent.id,input.project.id,async(_tx,row)=>{
   const cp=checkpoint(row.checkpoint??initial(input.project.id,selected),input.project.id);
   for(const original of pending){const step=cp.steps.find(s=>s.name===original.step)!;step.required=true;step.status='unknown_result';step.reasonCode='LEGACY_CALL_RESULT_UNKNOWN';step.childTaskId=original.childTaskId;step.reuse='reused';step.availableActions=['check_result'];if(!step.outputReferences.some(ref=>ref.id===original.callId))step.outputReferences.push({kind:'execution_call',id:original.callId});}
   if(pending.length){cp.stage='awaiting_reconciliation';cp.lastError={code:'UNKNOWN_RESULT',message:'原调用结果待核对，请保留原任务查看结果'};}
   return {checkpoint:cp,...(pending.length?{status:'blocked'}:{}),result:undefined};
  });
  return parent.id;
 }
 const service={reserve,readBaseline,references,
  async get(ctx:RequestContext,projectId:string):Promise<ProjectPreparationResource>{
   const project=await repo.get(ctx,projectId),refs=await references(ctx,projectId),task=await states.latest(ctx,projectId);
   const common={projectId,origin:project.source as ProjectSource,sourceReferences:refs};
   if(!task)return projectPreparationResource.parse({...common,registration:'not_registered',preparationTaskId:null,revision:null,steps:[],candidates:[],availableActions:['start'],lastError:null});
   const cp=checkpoint(task.checkpoint,projectId);
   for(const step of cp.steps){
    if(!currentErrorStatuses.includes(step.status)&&step.lastError)clearStepError(cp,step);
    else if(step.lastError&&douyinLoginError({code:step.lastError.code,message:step.lastError.message}))step.lastError={code:'CONFIGURATION_REQUIRED',message:douyinLoginMessage};
   }
   if(cp.lastError&&douyinLoginError({code:cp.lastError.code,message:cp.lastError.message}))cp.lastError={code:'CONFIGURATION_REQUIRED',message:douyinLoginMessage};
   if(['paused','pause_requested','cancelled','cancel_requested'].includes(task.status))for(const step of cp.steps){if(!['done','not_required','candidate_ready'].includes(step.status)){step.status=task.status.startsWith('cancel')?'cancelled':'paused';step.availableActions=task.status==='paused'?['resume']:[];}}
   const exhausted=task.status==='failed'&&['GENERATION_RECOVERY_EXHAUSTED','RETRY_BUDGET_EXHAUSTED','EXECUTION_DEADLINE'].includes(task.lastErrorCode??'');
   const canRetry=cp.steps.some(step=>step.required&&(step.availableActions.some(action=>['retry','resume'].includes(action))||['pending','queued','running','failed'].includes(step.status)));
   const actions=exhausted?[]:task.status==='unknown_result'?['check_result','cancel']:['waiting_user','paused'].includes(task.status)?['resume','cancel']:['failed','blocked'].includes(task.status)?[...(canRetry?['retry']:cp.steps.some(step=>step.availableActions.includes('check_result'))?['check_result']:[]),...(task.status==='blocked'?['pause']:[]),'cancel']:['queued','running','retry_wait'].includes(task.status)?['pause','cancel']:['start'];
   const candidates=await Promise.all(cp.candidates.map(async candidate=>{
    if(candidate.status!=='pending')return candidate;
    try{
     const child=await states.read(ctx,candidate.sourceTaskId);
     if(child.status!=='succeeded'||(child.ownerType==='project'&&child.ownerId!==projectId))throw new ConflictError('候选缺少真实完成的原子任务');
     const content=deps.readCandidate?await deps.readCandidate(ctx,projectId,candidate,db):(child.checkpoint as {candidates?:Record<string,PreparationContent>})?.candidates?.[candidate.id];
     const baseline=cp.candidateBaselines[candidate.id];
     if(!content||projectIntakeDigest(content)!==candidate.artifactDigest||!baseline)throw new ConflictError('候选正文或冻结基线不可读取');
     return {...candidate,content,baseline:{kind:'digest' as const,digest:baseline.digest}};
    }catch(error){return {...candidate,contentError:error instanceof Error?error.message:'候选正文读取失败'};}
   }));
   return projectPreparationResource.parse({...common,registration:'registered',preparationTaskId:task.id,revision:cp.revision,steps:cp.steps,candidates,availableActions:actions,lastError:cp.lastError});
  },
  async start(ctx:RequestContext,projectId:string,raw:unknown){
   const input=projectPreparationStartInput.parse(raw);
   const priorRequest=await states.startRequest(ctx,projectId,input.idempotencyKey);
   if(priorRequest){if(priorRequest!==projectIntakeDigest(input.requestedSteps))throw new ConflictError('准备动作键对应不同步骤');return service.get(ctx,projectId);}
   const current=await states.latest(ctx,projectId);
   if(current&&liveStatuses.concat('failed').includes(current.status)){
    const outcome=await states.update(ctx,current.id,projectId,async(tx,row)=>{
     await lockOwnedProjectForUpdate(tx,ctx,projectId);
     const cp=checkpoint(row.checkpoint,projectId);
     if(['succeeded','cancelled'].includes(row.status))return {checkpoint:cp,result:{terminal:true,status:row.status}};
     const requestDigest=projectIntakeDigest(input.requestedSteps),prior=cp.startRequests?.[input.idempotencyKey];
     if(prior&&prior!==requestDigest)throw new ConflictError('准备动作键对应不同步骤');
     if(prior)return {checkpoint:cp,result:{terminal:false,status:row.status}};
     if(row.deadlineAt!==null&&Date.parse(row.deadlineAt)<=Date.parse(deps.now()))throw new ConflictError('原项目准备期限已耗尽，不能续期');
     if(!prior){
      for(const name of input.requestedSteps??steps){const step=cp.steps.find(value=>value.name===name)!;if(!step.required&&step.status==='not_required'){step.required=true;step.status='pending';step.reasonCode='USER_REQUESTED';step.revision++;}}
      cp.startRequests={...cp.startRequests,[input.idempotencyKey]:requestDigest};cp.revision++;
     }
     if(['blocked','failed','waiting_user','paused','unknown_result'].includes(row.status))await createPersistentTaskService(tx,deps).command(ctx,{taskIds:[current.id],command:['waiting_user','paused','unknown_result'].includes(row.status)?'resume':'retry',idempotencyKey:`preparation:${projectId}:${input.idempotencyKey}`});
     return {checkpoint:cp,result:{terminal:false,status:row.status}};
    });
    if(!outcome.terminal){
     return service.get(ctx,projectId);
    }
   }
   await db.transaction(async transaction=>{
    const tx=transaction as unknown as Db;await lockWorkspaceMembership(transaction,ctx);await lockOwnedProjectForUpdate(tx,ctx,projectId);
    const latest=await createProjectPreparationStateService(tx).latest(ctx,projectId);
    if(latest&&liveStatuses.includes(latest.status))throw new ConflictError('项目准备记录已更新，请重新读取后继续原任务');
    const project=await createProjectRepository(tx).get(ctx,projectId),refs=await references(ctx,projectId,tx);
    const parentId=await reserve(ctx,{project,source:project.source as ProjectSource,sourceReferences:refs,intakeId:`preparation:${projectId}:${input.idempotencyKey}`},transaction,input.requestedSteps);
    if(parentId)await createProjectPreparationStateService(tx).update(ctx,parentId,projectId,async(_store,row)=>{const cp=checkpoint(row.checkpoint,projectId);cp.startRequests={...cp.startRequests,[input.idempotencyKey]:projectIntakeDigest(input.requestedSteps)};return {checkpoint:cp,result:undefined};});
   });
   return service.get(ctx,projectId);
  },
  async tick(control:{shouldStop():boolean;signal?:AbortSignal}){
   if(control.shouldStop()||control.signal?.aborted)return;
   await deps.tasks.recoverExpiredLeases({kinds:['project_preparation']});
   const claim=await deps.tasks.claimNext({kinds:['project_preparation'],workerId:deps.nextId('project-preparation'),leaseSeconds:120});if(!claim)return;
   const ctx:RequestContext={userId:claim.task.userId,accountId:claim.task.accountId,groupId:claim.task.groupId,groupVersion:claim.task.groupVersion??undefined,membershipVersion:claim.task.membershipVersion??undefined,requestId:`preparation:${claim.task.id}`,source:'user'};
   const lease={taskId:claim.task.id,...claim.lease},ref={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
   let cp=checkpoint(claim.task.checkpoint,claim.task.ownerId);
   const mergeUserChanges=(remote:PreparationCheckpoint)=>{
    // 用户采纳/追加步骤与tick共用父行锁；不能用旧内存快照覆盖已提交的用户事实。
    for(const step of cp.steps){const newer=remote.steps.find(value=>value.name===step.name);if(newer&&newer.revision>step.revision)Object.assign(step,newer);}
    const candidates=new Map(cp.candidates.map(value=>[value.id,value]));
    for(const candidate of remote.candidates)if(candidate.status!=='pending'||!candidates.has(candidate.id))candidates.set(candidate.id,candidate);
    cp.candidates=[...candidates.values()];cp.receipts={...cp.receipts,...remote.receipts};cp.submissions={...cp.submissions,...remote.submissions};cp.startRequests={...cp.startRequests,...remote.startRequests};
    cp.candidateBaselines={...cp.candidateBaselines,...remote.candidateBaselines};
    cp.sourceRevisions=[...new Map([...(remote.sourceRevisions??[]),...(cp.sourceRevisions??[])].map(value=>[value.revision,value])).values()].sort((a,b)=>a.revision-b.revision);
    cp.revision=Math.max(cp.revision,remote.revision)+1;
   };
   const save=async()=>leases.withLease(ref,'admission',async({tx,task})=>{
    mergeUserChanges(checkpoint(task.checkpoint,cp.projectId));
    await createPersistentTaskService(tx as unknown as Db,deps).saveCheckpoint({...lease,checkpoint:{...task.checkpoint as object,...cp}});
   });
   const finish=async(status:'succeeded'|'failed'|'blocked'|'waiting_user'|'retry_wait',error?:string)=>leases.withLease(ref,'admission',async({tx,task})=>{
    mergeUserChanges(checkpoint(task.checkpoint,cp.projectId));
    const next=status==='succeeded'&&cp.steps.some(step=>step.required&&['pending','queued','running'].includes(step.status))?'retry_wait':status;
    if(next!==status)cp.stage='queued';
    const tasks=createPersistentTaskService(tx as unknown as Db,deps);
    await tasks.saveCheckpoint({...lease,checkpoint:{...task.checkpoint as object,...cp}});
    return tasks.finish({...lease,status:next,retryAfterMs:2000,...(error?{errorCode:error,errorMessage:cp.lastError?.message??error}:{})});
   });
   try{
    const project=await repo.get(ctx,cp.projectId),refs=await references(ctx,cp.projectId);
    const legacyPending=(await Promise.all(refs.filter(r=>r.sourceKind==='intelligence_item').map(r=>readLegacyRadarPendingCalls(db,ctx,r.itemId!)))).flat();
    if(legacyPending.length){
     for(const original of legacyPending){const step=cp.steps.find(s=>s.name===original.step)!;step.status='unknown_result';step.childTaskId=original.childTaskId;step.availableActions=['check_result'];}
     cp.stage='awaiting_reconciliation';cp.lastError={code:'UNKNOWN_RESULT',message:'原调用结果待核对，请保留原任务查看结果'};await save();await finish('blocked','CALL_RESULT_UNKNOWN');return;
    }
    // 原账本已由真实对账结算后，用户此次重试才允许后续新准备；不恢复退役父。
    for(const step of cp.steps.filter(s=>s.reasonCode==='LEGACY_CALL_RESULT_UNKNOWN'&&s.childTaskId)){
     const child=await deps.tasks.get(ctx,step.childTaskId!);
     if(child.errorCode==='SYSTEM_UPGRADED'&&child.status!=='succeeded'&&!(await states.calls(ctx,child.id)).some(call=>['started','unknown'].includes(call.status))){step.childTaskId=null;step.status='pending';step.reasonCode='ORIGINAL_CALL_RECONCILED';step.availableActions=[];}
    }
    for(const step of cp.steps){
     if(control.shouldStop()||control.signal?.aborted)return;
     if(['done','not_required','candidate_ready','cancelled'].includes(step.status))continue;
     // 仅补全资料时，历史转写失败不应阻塞 brief。
     if(!step.required && ['failed','blocked','waiting_user','paused','unknown_result'].includes(step.status))continue;
     cp.activeStep=step.name;cp.stage=step.name==='transcript'?'transcribing':'generating';
     if(step.name==='brief'&&step.status==='waiting_user'&&step.reasonCode==='BRIEF_INPUT_REQUIRED'&&step.childTaskId){
      const control=(claim.payload as {preparationControl?:{id:string}}).preparationControl;
      const baseline=await readBaseline(ctx,project.id);
      const explicit=control&&cp.resumedChildren?.[step.childTaskId]!==control.id;
      if(control)cp.resumedChildren={...cp.resumedChildren,[step.childTaskId]:control.id};
      if(!explicit||!cp.stepBaselines?.brief?.inputDigest||baseline.inputDigest===cp.stepBaselines.brief.inputDigest){
       cp.stage='awaiting_user';await save();await finish('waiting_user');return;
      }
      // 补充资料并明确继续才开启新输入版本；旧子回执、父期限/预算和其它已完成步骤不变。
      cp.sourceRevisions=[...(cp.sourceRevisions??[]),{revision:cp.revision,steps:structuredClone(cp.steps)}];
      cp.blockedChildId=null;cp.blockedAtAttempt=null;
      step.revision++;step.status='pending';step.reasonCode='BRIEF_INPUT_UPDATED';step.childTaskId=null;step.businessTaskId=null;step.childOwner=null;step.reuse=null;step.attempt=null;step.inputDigest=null;step.outputReferences=[];step.startedAt=null;step.completedAt=null;clearStepError(cp,step);
      cp.stepBaselines={...cp.stepBaselines,brief:baseline};cp.revision++;
      const payload={...claim.payload,inputRevision:Number(claim.payload.inputRevision??0)+1};
      await states.update(ctx,claim.task.id,project.id,async(_tx,row)=>{
       if(row.status!=='running'||row.attempt!==claim.lease.attempt||row.fenceToken!==claim.lease.fenceToken||row.leaseOwner!==claim.lease.workerId||!row.leaseExpiresAt||Date.parse(row.leaseExpiresAt)<=Date.parse(deps.now()))throw new ConflictError('准备输入版本已变化');
       mergeUserChanges(checkpoint(row.checkpoint,project.id));
       return {checkpoint:{...row.checkpoint as object,...cp},payload,result:undefined};
      });
      claim.payload=payload;
     }
     if(step.childTaskId){
      let child=await deps.tasks.get(ctx,step.childTaskId);step.attempt=child.attempt;step.childOwner=['item','transform'].includes(child.ownerType)?{type:'item',id:child.ownerId}:{type:'project',id:project.id};
      if(child.runtimeStatus==='unknown_result'){
       await deps.tasks.recoverExpiredLeases({kinds:[child.kind],includeSafeUnknownResults:true,taskId:child.id});child=await deps.tasks.get(ctx,child.id);
      }
      if(step.name==='brief'&&child.runtimeStatus==='partial'){
       try{await deps.collect?.(ctx,{project,step,childTaskId:child.id});}
       catch(error){if(error instanceof ProjectPreparationInputRequired)throw error;}
      }
      if(child.status==='cancelled'||child.runtimeStatus==='partial'){
       step.status='blocked';step.reasonCode=child.status==='cancelled'?'CHILD_CANCELLED':'CHILD_PARTIAL';step.availableActions=step.name==='transcript'?['provide_transcript']:[];step.lastError={code:'EXECUTION_FAILED',message:child.status==='cancelled'?'原子任务已取消，请保留原记录核对；本步骤不能直接重试':'原子任务仅有部分结果，请保留原结果核对；本步骤不能直接重试'};cp.lastError=step.lastError;cp.blockedChildId=child.id;cp.blockedAtAttempt=claim.task.attempt;await save();await finish('blocked');return;
      }
      if(child.runtimeStatus==='unknown_result'){
       const control=(claim.payload as {preparationControl?:{id:string}}).preparationControl;
       if(control&&cp.resumedChildren?.[child.id]!==control.id){
        cp.resumedChildren={...cp.resumedChildren,[child.id]:control.id};
        try{
         await deps.tasks.command(ctx,{taskIds:[child.id],command:'resume',idempotencyKey:`${claim.task.id}:${child.id}:${control.id}`});
        }catch(error){
         if(!(error instanceof ConflictError))throw error;
        }
        child=await deps.tasks.get(ctx,child.id);
        if(['queued','running'].includes(child.runtimeStatus??child.status)){
         step.status='queued';clearStepError(cp,step);await save();await finish('retry_wait');return;
        }
       }
      }
      if(child.runtimeStatus==='unknown_result'){
       step.status='unknown_result';step.availableActions=['check_result'];cp.blockedChildId=child.id;cp.blockedAtAttempt=claim.task.attempt;await save();await finish('blocked');return;
      }
      if(child.status==='succeeded'){
       const generated=await deps.collect?.(ctx,{project,step,childTaskId:child.id})??[];
       const baseline=cp.stepBaselines?.[step.name]??await readBaseline(ctx,project.id);
       for(const {candidate,content} of generated){if(!cp.candidates.some(c=>c.id===candidate.id)){cp.candidates.push(candidate);cp.candidateBaselines[candidate.id]=baseline;}}
       step.status=generated.length?'candidate_ready':'done';if(step.name==='brief'&&!generated.length)step.reasonCode='BRIEF_UNCHANGED';clearStepError(cp,step);step.completedAt=deps.now();step.availableActions=generated.length?['accept_candidate']:[];await save();continue;
      }
      if(['failed','blocked','paused'].includes(child.status)){
       const control=(claim.payload as {preparationControl?:{id:string;command:string}}).preparationControl;
       const exhausted=child.status==='failed'&&['GENERATION_RECOVERY_EXHAUSTED','RETRY_BUDGET_EXHAUSTED','EXECUTION_DEADLINE'].includes(child.errorCode??'');
       if(!exhausted&&control&&cp.resumedChildren?.[child.id]!==control.id){
        cp.resumedChildren={...cp.resumedChildren,[child.id]:control.id};
        await deps.tasks.command(ctx,{taskIds:[child.id],command:child.runtimeStatus==='waiting_user'||child.status==='paused'?'resume':'retry',idempotencyKey:`${claim.task.id}:${child.id}:${control.id}`});step.status='queued';clearStepError(cp,step);await save();await finish('retry_wait');return;
       }
       const childLogin=douyinLoginError({name:child.errorCode,errorCode:child.errorCode,message:child.errorMessage});
       if(childLogin&&!exhausted){
        step.status='waiting_user';step.lastError={code:'CONFIGURATION_REQUIRED',message:douyinLoginMessage};step.availableActions=step.name==='transcript'?['resume','provide_transcript']:['resume'];cp.lastError=step.lastError;cp.blockedChildId=child.id;cp.blockedAtAttempt=claim.task.attempt;await save();continue;
       }
       step.status=child.runtimeStatus==='waiting_user'?'waiting_user':child.status==='paused'?'paused':'failed';step.lastError={code:'EXECUTION_FAILED',message:child.errorMessage??'此步骤执行失败，请核对原任务后重试'};step.availableActions=exhausted?[]:step.status==='paused'||step.status==='waiting_user'?['resume']:['retry'];if(step.name==='transcript')step.availableActions.push('provide_transcript');cp.lastError=step.lastError;cp.blockedChildId=child.id;cp.blockedAtAttempt=claim.task.attempt;await save();await finish(exhausted?'failed':step.status==='waiting_user'?'waiting_user':'blocked',exhausted?child.errorCode??undefined:undefined);return;
      }
      // 明确控制只适用于本次恢复；观察到子已运行后，不能留作其未来失败的自动重试授权。
      const control=(claim.payload as {preparationControl?:{id:string}}).preparationControl;
      if(control)cp.resumedChildren={...cp.resumedChildren,[child.id]:control.id};
      step.status=child.status==='running'?'running':'queued';clearStepError(cp,step);await save();await finish('retry_wait');return;
     }
     cp.stepBaselines={...cp.stepBaselines,[step.name]:cp.stepBaselines?.[step.name]??await readBaseline(ctx,project.id)};await save();
     if(['done','not_required','candidate_ready','cancelled'].includes(step.status))continue;
     // 仅补全资料时，历史转写失败不应阻塞 brief。
     if(!step.required && ['failed','blocked','waiting_user','paused','unknown_result'].includes(step.status))continue;
     const dispatched=await deps.dispatch(ctx,{project,references:refs,step:step.name,claim});
     if(dispatched.status==='child'){
      const actualChild=await deps.tasks.get(ctx,dispatched.childTaskId);step.attempt=actualChild.attempt;step.childOwner=['item','transform'].includes(actualChild.ownerType)?{type:'item',id:actualChild.ownerId}:{type:'project',id:project.id};
      step.childTaskId=dispatched.childTaskId;step.businessTaskId=dispatched.businessTaskId;step.reuse=dispatched.shared?'reused':'exclusive';step.inputDigest=dispatched.sourceDigest;step.status='queued';step.startedAt=deps.now();step.reasonCode='CHILD_SUBMITTED';
      clearStepError(cp,step);
      const control=(claim.payload as {preparationControl?:{id:string}}).preparationControl;if(control)cp.resumedChildren={...cp.resumedChildren,[dispatched.childTaskId]:control.id};
      if(dispatched.transformId)step.outputReferences=[{kind:'transform',id:dispatched.transformId}];
      await save();await finish('retry_wait');return;
     }
     step.status=dispatched.status;step.reasonCode=dispatched.reasonCode;step.availableActions=dispatched.status==='waiting_user'?(step.name==='transcript'?['provide_transcript','resume']:['resume']):[];
     if(dispatched.status==='not_required'||dispatched.status==='done')clearStepError(cp,step);
     if(dispatched.status==='done')step.completedAt=deps.now();
     if(dispatched.status==='waiting_user'){step.lastError={code:'CONFIGURATION_REQUIRED',message:dispatched.message??'请补充所需资料后继续'};cp.lastError=step.lastError;}
     await save();
    }
    cp.activeStep=null;if(!cp.steps.some(s=>s.status==='waiting_user'))cp.lastError=null;cp.stage=cp.steps.some(s=>s.status==='waiting_user')?'awaiting_user':'completed';await save();await finish(cp.stage==='awaiting_user'?'waiting_user':'succeeded');
   }catch(error){
    const current=await deps.tasks.get(ctx,claim.task.id);
    if(['pause_requested','cancel_requested'].includes(current.status)){await deps.tasks.acknowledgeControl(lease);return;}
    if(current.status!=='running'||current.attempt!==claim.lease.attempt)return;
    if(error instanceof ProjectPreparationInputRequired&&cp.activeStep==='brief'){
     const step=cp.steps.find(value=>value.name==='brief')!;
     if(!cp.stepBaselines?.brief?.inputDigest){const current=await readBaseline(ctx,cp.projectId);cp.stepBaselines={...cp.stepBaselines,brief:{...(cp.stepBaselines?.brief??current),inputDigest:current.inputDigest}};}
     step.status='waiting_user';step.reasonCode=error.code;step.lastError={code:'EXECUTION_FAILED',message:error.message};step.availableActions=['resume'];cp.lastError=step.lastError;cp.stage='awaiting_user';cp.blockedChildId=step.childTaskId;cp.blockedAtAttempt=claim.task.attempt;
     await save();await finish('waiting_user');return;
    }
    const unavailable=findModelEngineUnavailable(error);
    const login=!unavailable&&douyinLoginError(error);
    const message=unavailable?.message??(login?douyinLoginMessage:(error instanceof Error?error.message:'准备失败，请核对原任务'));
    cp.lastError={code:login?'CONFIGURATION_REQUIRED':'EXECUTION_FAILED',message};
    const failed=cp.steps.find(step=>step.name===cp.activeStep);
    const transcriptLogin=Boolean(login&&failed?.name==='transcript');
    if(failed){
     failed.status=transcriptLogin?'waiting_user':'failed';
     failed.lastError=cp.lastError;
     failed.availableActions=transcriptLogin?['resume','provide_transcript']:failed.name==='transcript'?['retry','provide_transcript']:['retry'];
    }
    await save();
    await finish(transcriptLogin?'waiting_user':'blocked',transcriptLogin?undefined:'PREPARATION_FAILED');
   }
  },
  async provideTranscript(ctx:RequestContext,projectId:string,raw:unknown){
   const input=projectPreparationTranscriptInput.parse(raw);await repo.get(ctx,projectId);
   await states.update(ctx,input.parentTaskId,projectId,async(tx,row)=>{
    await lockOwnedProjectForUpdate(tx,ctx,projectId);if(row.kind!=='project_preparation')throw new ConflictError('不是项目准备父任务');
    const cp=checkpoint(row.checkpoint,projectId),step=cp.steps.find(s=>s.name==='transcript')!,digest=projectIntakeDigest(input),prior=cp.submissions?.[input.submissionKey];
    if(prior){if(prior!==digest)throw new ConflictError('手工稿幂等键输入不一致');return {checkpoint:cp,result:undefined};}
    if(step.revision!==input.expectedStepRevision)throw new ConflictError('转写步骤已变化');
    const refs=await references(ctx,projectId,tx),reference=refs.find(r=>r.id===input.referenceId);
    if(!reference||!(row.payload as {sourceReferenceIds?:string[]}).sourceReferenceIds?.includes(reference.id)||reference.sourceDigest!==input.expectedSourceDigest)throw new ConflictError('来源版本已变化');
    if(['running','pause_requested','cancel_requested'].includes(row.status))throw new ConflictError('请先暂停准备任务后补充逐字稿');
    for(const previous of cp.steps.filter(s=>s.childTaskId)){const child=await createProjectPreparationStateService(tx).read(ctx,previous.childTaskId!);if(['running','queued','retry_wait','pause_requested','cancel_requested','unknown_result'].includes(child.status))throw new ConflictError('原子任务尚未停止或结果未知，请先核对原任务');}
    if(!deps.provideTranscript)throw new ConflictError('手工逐字稿恢复端口未装配');
    const provided=await deps.provideTranscript(ctx,{...input,projectId},tx);
    await tx.update(projectSourceReferences).set({sourceDigest:provided.sourceDigest,transcriptHash:provided.transcriptHash??provided.sourceDigest,bodyAvailable:true,updatedAt:deps.now()}).where(and(eq(projectSourceReferences.id,reference.id),eq(projectSourceReferences.projectId,projectId)));
    cp.sourceRevisions=[...(cp.sourceRevisions??[]),{revision:cp.revision,steps:structuredClone(cp.steps)}];
    cp.stepBaselines={...cp.stepBaselines};delete cp.stepBaselines.source_draft;delete cp.stepBaselines.transcript;
    cp.revision++;step.revision++;step.inputDigest=provided.sourceDigest;step.status='pending';step.childTaskId=null;step.businessTaskId=null;step.lastError=null;cp.submissions={...cp.submissions,[input.submissionKey]:digest};
    cp.candidates=cp.candidates.map(c=>c.status==='pending'?{...c,status:'rejected'}:c);for(const next of cp.steps.filter(s=>s.name==='source_draft'&&s.required)){next.revision++;next.status='pending';next.childTaskId=null;next.inputDigest=provided.sourceDigest;}
    const payload={...row.payload as object,sourceIdentities:refs.map(ref=>({id:ref.id,digest:ref.id===reference.id?provided.sourceDigest:ref.sourceDigest})),inputRevision:((row.payload as {inputRevision?:number}).inputRevision??0)+1};
    // 补稿不续期；已过期仅保存来源，不能重新开启模型工作。
    const expired=row.deadlineAt!==null&&Date.parse(row.deadlineAt)<=Date.parse(deps.now());
    return {checkpoint:cp,payload,status:expired?'failed':'queued',result:undefined};
   });return service.get(ctx,projectId);
  },
  async acceptCandidate(ctx:RequestContext,projectId:string,candidateId:string,raw:unknown){
   const input=projectPreparationCandidateAcceptInput.parse(raw);await repo.get(ctx,projectId);const parent=await states.candidateParent(ctx,projectId,candidateId);if(!parent)throw new ConflictError('没有项目准备候选');
   return states.update(ctx,parent.id,projectId,async(tx,row)=>{
    await lockOwnedProjectForUpdate(tx,ctx,projectId);const cp=checkpoint(row.checkpoint,projectId),requestDigest=projectIntakeDigest({candidateId,input}),prior=cp.receipts?.[input.idempotencyKey];
    if(prior){if(prior.requestDigest!==requestDigest)throw new ConflictError('采纳幂等键输入不一致');return {checkpoint:cp,result:prior.receipt};}
    const candidate=cp.candidates.find(c=>c.id===candidateId),baseline=cp.candidateBaselines[candidateId],current=await readBaseline(ctx,projectId,tx);
    if(!candidate||candidate.status!=='pending'||candidate.sourceDigest!==input.candidateSourceDigest||!baseline)throw new ConflictError('候选已失效或来源摘要不符');
    if(current.digest!==baseline.digest||(input.baseline.kind==='digest'?input.baseline.digest!==baseline.digest:input.baseline.projectVersion!==baseline.projectVersion||input.baseline.artifactVersion!==baseline.artifactVersion))throw new ConflictError('正式资料或稿件已变化，请重新核对候选');
    const child=await createProjectPreparationStateService(tx).read(ctx,candidate.sourceTaskId);if(child.status!=='succeeded'||(child.ownerType==='project'&&child.ownerId!==projectId))throw new ConflictError('候选缺少真实完成的原子任务');
    const original=deps.readCandidate?await deps.readCandidate(ctx,projectId,candidate,tx):((child.checkpoint as {candidates?:Record<string,PreparationContent>})?.candidates?.[candidate.id]);
    if(!original||projectIntakeDigest(original)!==candidate.artifactDigest)throw new ConflictError('候选真实正文与回执摘要不符');
    const content=input.editedContent??original;if(!content||content.kind!==candidate.kind)throw new ConflictError('候选正文不可读取');
    const acceptedDigest=projectIntakeDigest(content);let artifactVersion:number|null=null;
    if(content.kind==='brief')await createProjectsService(createProjectRepository(tx),deps).patchProject(ctx,projectId,{brief:content.brief,briefDetail:content.briefDetail});
    else {const artifacts=artifactsFor(tx),id=await createScriptDraftTargetService(deps).ensure(tx,ctx,projectId),artifact=await artifacts.getArtifact(ctx,id);const saved=await artifacts.createVersion(ctx,id,{expectedCurrentVersionId:artifact.currentVersionId!,contentText:content.text,createdByType:'ai',aiTaskId:child.id,adoptionKey:`preparation:${projectIntakeDigest([row.id,input.idempotencyKey])}`,adoptionSourceDigest:`sha256:${projectIntakeDigest([candidate.id,child.id,candidate.sourceDigest,candidate.artifactDigest])}`});artifactVersion=saved.versionNumber;}
    const project=await createProjectRepository(tx).get(ctx,projectId),receipt:ProjectPreparationAcceptanceReceipt={id:deps.nextId('preparation-acceptance'),projectId,candidateId,sourceTaskId:child.id,candidateSourceDigest:candidate.sourceDigest,acceptedDigest,projectVersion:Date.parse(project.updatedAt),artifactVersion,acceptedAt:deps.now()};
    candidate.status='accepted';candidate.acceptanceReceipt=receipt;cp.receipts={...cp.receipts,[input.idempotencyKey]:{requestDigest,receipt}};cp.revision++;
    settleAcceptedPreparationSteps(cp);
    return {checkpoint:cp,result:receipt};
   });
  },
 };return service;
}
