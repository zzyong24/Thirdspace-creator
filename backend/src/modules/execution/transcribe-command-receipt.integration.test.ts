import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {createDb,aiTasks,aiTaskSteps,executionTasks,executionCalls,artifacts,artifactVersions,projects,eq,type Db} from '@creatoros/backend';
import {createAccountGroupService} from '../platform-account';
import {createTranscribeBusinessExecutionService} from '../ai-runtime/transcribe-business-execution.service';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionTranscribeWorkflowService} from './execution-transcribe-workflow.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionWorkerOutcomeService} from './execution-worker-outcome.service';
import {createExecutionTranscribeAudioService} from './execution-transcribe-audio.service';
import {createExecutionTranscribePreparationService} from './execution-transcribe-preparation.service';
import {createExecutionTranscribePostprocessService} from './execution-transcribe-postprocess.service';
import {createExecutionTranscribeSourceService} from './execution-transcribe-source.service';
import {createExecutionAsrPorts} from './execution-asr-ports.service';
import {createExecutionLeaseService} from './execution-lease.service';
import {createMockObjectStorage} from '../assets/object-storage';
import {createProjectRepository,createProjectsService} from '../projects';
import {createArtifactsService} from '../artifacts';
import {accountGroups,accountGroupMemberships} from '../../schema/account-groups';
import {ExecutionBudgetError} from './execution.errors';
import {createPlatformAccountService} from '../platform-account/platform-account.service';
import {executionBudgetSchema} from '@creatoros/contract/execution-worker';
// 仅计数并继续调用真实daily service；不替代业务或伪造重开结果。
const daily=vi.hoisted(()=>({reopens:0}));
vi.mock('../scheduling',async importOriginal=>{
 const actual=await importOriginal<typeof import('../scheduling')>();
 return {...actual,createDailyTopicRunService:(...args:Parameters<typeof actual.createDailyTopicRunService>)=>{
  const service=actual.createDailyTopicRunService(...args);
  return {...service,reopenForExecutionRetry:async(...input:Parameters<typeof service.reopenForExecutionRetry>)=>{daily.reopens++;return service.reopenForExecutionRetry(...input);}};
 }};
});
const FIELD='__transcribeCommandReceiptsV1';
const now=()=>new Date().toISOString();
const hash=(key:string)=>createHash('sha256').update(key).digest('hex');
async function snapshot(db:Db,id:string){
 return {execution:(await db.select().from(executionTasks).where(eq(executionTasks.id,id)))[0],
  tasks:await db.select().from(aiTasks),steps:await db.select().from(aiTaskSteps),calls:await db.select().from(executionCalls),
  projects:await db.select().from(projects),artifacts:await db.select().from(artifacts),versions:await db.select().from(artifactVersions)};
}
async function fixture(dataDir?:string,reuse?:Awaited<ReturnType<typeof createDb>>,suffix='one',options:{now?:()=>string;budget?:{maxCalls:number;maxTokens:number;deadlineMs:number};legacy?:boolean;initialFailure?:boolean}={}){
 const clock=options.now??now;
 const opened=reuse??await createDb({dataDir}),db=opened.db;
 let serial=0;const nextId=(prefix:string)=>`${prefix}-t215-${suffix}-${++serial}`;
 const user={userId:'t215-synthetic-owner',accountId:options.legacy?'t215-historical-account':null,requestId:'t215',source:'user' as const};
 // legacy 参数只构造迁移前真实 account-only 行；不调用新版开户制造组再声称无组。
 const group=options.legacy?null:await createAccountGroupService({db,now:clock,nextId}).create(user,{name:'原转写控制恢复测试组',idempotencyKey:'fixture-group'});
 const ctx={...user,groupId:group?.id??null},id=`t215-original-ai-${suffix}`,saved=`t215-saved-album-${suffix}`,failed=`t215-failed-video-${suffix}`;
 await db.insert(projects).values({id:`t215-project-${suffix}`,userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId,title:'原已有产物',source:'imported',platformRef:{platform:'douyin',externalId:saved},creationMode:'talking_head',status:'active',currentStage:'script',startedAt:clock(),createdAt:clock(),updatedAt:clock()});
 await db.insert(aiTasks).values({id,userId:ctx.userId,groupId:ctx.groupId,groupVersion:group?.version??null,accountId:ctx.accountId,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:[saved,failed]},requestedAt:clock(),requestFingerprint:'sha256:'+'a'.repeat(64)});
 const budget=options.budget??{maxCalls:10,maxTokens:10000,deadlineMs:600000};
 const prepare=createTranscribeBusinessExecutionService(db,{budget,now:clock,resolveSpec:async()=>({kind:'audio',provider:'qwen',model:'synthetic-asr',baseUrl:null,token:'synthetic-only'})});
 const prepared=await prepare.prepare(ctx,id);
 if(!prepared.executionTaskId)throw Error('必须由正常prepare创建原执行');
 const executionId=prepared.executionTaskId,tasks=createPersistentTaskService(db,{now:clock,nextId});
 const workflow=createExecutionTranscribeWorkflowService(db,{now:clock,nextId,hasTranscriptArtifact:async()=>false,postprocess:{read:async()=>null}});
 async function claim(){const c=await tasks.claimTask({taskId:executionId,workerId:'t215-synthetic-host',leaseSeconds:300});if(!c)throw Error('原任务不能claim');return {executionTaskId:executionId,attempt:c.lease.attempt,fenceToken:c.lease.fenceToken};}
 async function failAttempt(){const ref=await claim();
  if(ref.attempt===1){
   await workflow.recordSource(ref,{awemeId:saved,source:{kind:'image-album'}});await workflow.saveArtifact(ref,{awemeId:saved});
   // 真实ledger写回，但usage是自产合成事实，不冒真实ASR或供应商账单。
   const ledger=createExecutionCallLedgerService(db,{budget,now:clock});
   const call=await ledger.reserve(ref,{operationKey:`t215-synthetic-settled:${executionId}`,kind:'model',inputDigest:'sha256:'+'c'.repeat(64),reservedTokens:8});
   await ledger.start(ref,call.id);await ledger.settle(ref,call.id,{status:'settled',usage:{inputTokens:2,outputTokens:3,totalTokens:5}});
  }
  await workflow.failItem(ref,{awemeId:failed,error:'自产来源读取明确失败'});
  expect(await workflow.complete(ref,{})).toEqual({status:'failed'});return ref;
 }
 if(options.initialFailure!==false)await failAttempt();
 return {...opened,ctx,id,executionId,saved,failed,budget,tasks,workflow,claim,failAttempt,now:clock,nextId,prepare,
  retry:(key:string)=>tasks.command(ctx,{taskIds:[executionId],command:'retry',idempotencyKey:key})};
}
it('同原retry响应丢失后下一attempt再次失败：同key只回当前原任务、不二次排队',async()=>{
 const f=await fixture();try{
  await f.retry('original-intent');await f.failAttempt();const before=await snapshot(f.db,f.executionId);
  expect(before.execution?.attempt).toBe(2);expect(before.calls).toHaveLength(1);expect(before.calls[0]).toMatchObject({status:'settled',operationKey:`t215-synthetic-settled:${f.executionId}`,usage:{inputTokens:2,outputTokens:3,totalTokens:5},totalTokens:5});expect(before.versions.length).toBeGreaterThan(0);
  const reopens=daily.reopens,replay=await f.retry('original-intent');expect(replay[0]).toMatchObject({id:f.executionId,status:'failed'});expect(daily.reopens).toBe(reopens);
  expect(await snapshot(f.db,f.executionId)).toEqual(before);
  await f.retry('explicit-new-intent');expect(daily.reopens).toBe(reopens+1);expect((await f.tasks.get(f.ctx,f.executionId)).status).toBe('queued');
 }finally{await f.client.close();}
},180000);
it('同key异command及后来mixed完整目标均拒绝，不修改任何原任务',async()=>{
 const f=await fixture();try{
  await f.retry('original-intent');const queued=await snapshot(f.db,f.executionId);
  await expect(f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'cancel',idempotencyKey:'original-intent'})).rejects.toMatchObject({name:'ConflictError'});
  expect(await snapshot(f.db,f.executionId)).toEqual(queued);
  await f.failAttempt();const other=await f.tasks.enqueue(f.ctx,{kind:'source_sync',ownerType:'source',ownerId:'other',idempotencyKey:'other',payload:{}});
  const claimed=await f.tasks.claimTask({taskId:other.id,workerId:'t215-other'});if(!claimed)throw Error('其它任务claim失败');
  await f.tasks.finish({taskId:other.id,workerId:'t215-other',attempt:claimed.lease.attempt,status:'failed'});
  const before=await snapshot(f.db,f.executionId),otherBefore=await f.tasks.get(f.ctx,other.id);
  await expect(f.tasks.command(f.ctx,{taskIds:[f.executionId,other.id],command:'retry',idempotencyKey:'original-intent'})).rejects.toMatchObject({name:'ConflictError'});
  expect(await snapshot(f.db,f.executionId)).toEqual(before);expect(await f.tasks.get(f.ctx,other.id)).toEqual(otherBefore);
 }finally{await f.client.close();}
},180000);
it('key固定hash，原型名和合法长key不造阈值，所有旧回执保留',async()=>{
 for(const key of ['__proto__','x'.repeat(10000)]){const f=await fixture();try{
  await f.retry(key);await f.failAttempt();const before=await snapshot(f.db,f.executionId);
  const map=(before.execution?.payload as Record<string,unknown>)[FIELD] as Record<string,unknown>;
  expect(Object.keys(map)).toEqual([hash(key)]);expect(Object.hasOwn(map,key)).toBe(false);
  await f.retry(key);expect(await snapshot(f.db,f.executionId)).toEqual(before);
  await f.retry('new-original-intent');const after=await snapshot(f.db,f.executionId);
  expect((after.execution?.payload as Record<string,unknown>)[FIELD]).toMatchObject(map);
 }finally{await f.client.close();}}
},180000);
it('完整冻结输入改写与畸形回执拒绝，不静默清空或伪成功',async()=>{
 const f=await fixture();try{
  await f.retry('original-intent');await f.failAttempt();const before=await snapshot(f.db,f.executionId);
  const payload=before.execution!.payload as Record<string,unknown>,modelInput=payload.modelInput as Record<string,unknown>;
  await f.db.update(executionTasks).set({payload:{...payload,modelInput:{...modelInput,language:'en'}}}).where(eq(executionTasks.id,f.executionId));
  await expect(f.retry('original-intent')).rejects.toMatchObject({name:'ConflictError'});
  await f.db.update(executionTasks).set({payload:{...payload,[FIELD]:{[hash('original-intent')]:{schemaVersion:1}}}}).where(eq(executionTasks.id,f.executionId));
  const damaged=await snapshot(f.db,f.executionId);await expect(f.retry('original-intent')).rejects.toMatchObject({name:'ConflictError'});expect(await snapshot(f.db,f.executionId)).toEqual(damaged);
 }finally{await f.client.close();}
},180000);
it('回执insert故障与原状态同tx零提交，同key移除故障后安全受理',async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db,f.executionId);
  await f.client.exec(`ALTER TABLE execution_tasks ADD CONSTRAINT t215_receipt_fault CHECK (NOT (payload ? '__transcribeCommandReceiptsV1'))`);
  await expect(f.retry('original-intent')).rejects.toThrow();expect(await snapshot(f.db,f.executionId)).toEqual(before);
  await f.client.exec('ALTER TABLE execution_tasks DROP CONSTRAINT t215_receipt_fault');
  await f.retry('original-intent');const accepted=await snapshot(f.db,f.executionId);expect(accepted.execution?.status).toBe('queued');
  await f.retry('original-intent');expect(await snapshot(f.db,f.executionId)).toEqual(accepted);
 }finally{await f.client.close();}
},180000);
it('原意图回读未知调用当前状态；新key仍不能直接重提',async()=>{
 const f=await fixture();try{
  await f.retry('original-intent');const ref=await f.claim();
  const ledger=createExecutionCallLedgerService(f.db,{budget:f.budget,now});
  const call=await ledger.reserve(ref,{operationKey:'t215-synthetic-unknown-tool',kind:'tool',inputDigest:'sha256:'+'b'.repeat(64),reservedTokens:0});
  await ledger.start(ref,call.id);await ledger.settle(ref,call.id,{status:'unknown'});
  await createExecutionWorkerOutcomeService(f.db,{now}).recordFailure(ref,{outcome:'unknown_result',errorCode:'T215_SYNTHETIC_UNKNOWN'});
  const before=await snapshot(f.db,f.executionId);
  expect((await f.retry('original-intent'))[0]?.runtimeStatus).toBe('unknown_result');expect(await snapshot(f.db,f.executionId)).toEqual(before);
  await expect(f.retry('explicit-new-intent')).rejects.toMatchObject({name:'ConflictError'});
  expect(await f.tasks.claimTask({taskId:f.executionId,workerId:'must-not-reissue'})).toBeNull();expect(await snapshot(f.db,f.executionId)).toEqual(before);
 }finally{await f.client.close();}
},180000);
it('磁盘重开只回同原意图，公开DTO不泄私有回执',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'t215-synthetic-'));let close:(()=>Promise<void>)|undefined;
 try{const f=await fixture(directory);close=()=>f.client.close();await f.retry('original-intent');await f.failAttempt();const before=await snapshot(f.db,f.executionId);await close();close=undefined;
  const reopened=await createDb({dataDir:directory});close=()=>reopened.client.close();
  const replay=await createPersistentTaskService(reopened.db).command(f.ctx,{taskIds:[f.executionId],command:'retry',idempotencyKey:'original-intent'});
  expect(replay[0]?.status).toBe('failed');expect(JSON.stringify(replay)).not.toContain(FIELD);expect(await snapshot(reopened.db,f.executionId)).toEqual(before);
 }finally{await close?.();await rm(directory,{recursive:true,force:true});}
},180000);
it('没有转写绑定的其它kind/mixed保持旧协议，不假称全域durable幂等',async()=>{
 const opened=await createDb(),tasks=createPersistentTaskService(opened.db),ctx={userId:'legacy-owner',accountId:'legacy-account',requestId:'legacy',source:'user' as const};
 try{const ids=[] as string[];
  for(const ownerId of ['a','b']){const task=await tasks.enqueue(ctx,{kind:'source_sync',ownerType:'source',ownerId,idempotencyKey:ownerId,payload:{}});ids.push(task.id);}
  const result=await tasks.command(ctx,{taskIds:ids,command:'cancel',idempotencyKey:'old-mixed'});expect(result.every(task=>task.status==='cancelled')).toBe(true);
  await expect(tasks.command(ctx,{taskIds:ids,command:'cancel',idempotencyKey:'old-mixed'})).rejects.toMatchObject({name:'ConflictError'});
  for(const id of ids)expect((await snapshot(opened.db,id)).execution?.payload).toEqual({});
 }finally{await opened.client.close();}
},180000);
it('同字符串用于另一个独立target不作全域冲突，原账号组版本变化不封死回放',async()=>{
 const f=await fixture();try{
  await f.retry('same-text');await f.failAttempt();
  const groupService=createAccountGroupService({db:f.db,now,nextId:prefix=>`${prefix}-version-change`});
  const originalGroup=await groupService.get(f.ctx,f.ctx.groupId!);
  await groupService.update(f.ctx,f.ctx.groupId!,{name:'仅更改组显示名',expectedVersion:originalGroup.version});
  const before=await snapshot(f.db,f.executionId);expect((await f.retry('same-text'))[0]?.status).toBe('failed');expect(await snapshot(f.db,f.executionId)).toEqual(before);
  const other=await fixture(undefined,{db:f.db,client:f.client},'two');
  expect((await other.retry('same-text'))[0]?.status).toBe('queued');
  const both=await snapshot(f.db,f.executionId);await f.retry('same-text');await other.retry('same-text');expect(await snapshot(f.db,f.executionId)).toEqual(both);
  const otherRow=(await snapshot(f.db,other.executionId)).execution;
  expect(Object.hasOwn((otherRow!.payload as Record<string,unknown>)[FIELD] as object,hash('same-text'))).toBe(true);
 }finally{await f.client.close();}
},180000);
it('主路和replay均重核本人当前active组，跨owner/group与归档不写受理',async()=>{
 const f=await fixture();try{
  await f.retry('original-intent');await f.failAttempt();const before=await snapshot(f.db,f.executionId);
  for(const ctx of [{...f.ctx,userId:'other-owner'},{...f.ctx,groupId:'missing-group'}])await expect(f.tasks.command(ctx,{taskIds:[f.executionId],command:'retry',idempotencyKey:'original-intent'})).rejects.toThrow();
  const service=createAccountGroupService({db:f.db,now,nextId:prefix=>`${prefix}-archive`}),group=await service.get(f.ctx,f.ctx.groupId!);
  await service.update(f.ctx,f.ctx.groupId!,{status:'archived',expectedVersion:group.version});
  await expect(f.retry('original-intent')).rejects.toThrow();await expect(f.retry('new-intent')).rejects.toThrow();
  expect(await snapshot(f.db,f.executionId)).toEqual(before);
 }finally{await f.client.close();}
},180000);

type Fixture=Awaited<ReturnType<typeof fixture>>;
const receiptMap=(row:Awaited<ReturnType<typeof snapshot>>['execution'])=>(row!.payload as Record<string,unknown>)[FIELD];
async function replayUnchanged(f:Fixture,key:string,status:string){
 const before=await snapshot(f.db,f.executionId),reopens=daily.reopens;
 expect((await f.retry(key))[0]?.status).toBe(status);
 expect(await snapshot(f.db,f.executionId)).toEqual(before);expect(daily.reopens).toBe(reopens);
}
it('X01 running回放保原attempt/fence/lease与全部已存事实',async()=>{
 const f=await fixture();try{await f.retry('running-intent');await f.claim();await replayUnchanged(f,'running-intent','running');
 }finally{await f.client.close();}
},180000);
it('X02 真实图集与no-project完成后，旧意图回当前succeeded；新retry保终态门',async()=>{
 const f=await fixture();try{await f.retry('success-intent');const ref=await f.claim();
  await f.workflow.recordSource(ref,{awemeId:f.failed,source:{kind:'image-album'}});
  expect(await f.workflow.saveArtifact(ref,{awemeId:f.failed})).toMatchObject({status:'no-project'});
  expect(await f.workflow.complete(ref,{})).toEqual({status:'succeeded'});
  await replayUnchanged(f,'success-intent','succeeded');const before=await snapshot(f.db,f.executionId);
  await expect(f.retry('new-intent')).rejects.toMatchObject({name:'ConflictError'});expect(await snapshot(f.db,f.executionId)).toEqual(before);
 }finally{await f.client.close();}
},180000);
it.each(['queued','running'] as const)('X03 %s取消经原控制确认，retry/cancel旧key只回cancelled',async mode=>{
 const f=await fixture();try{await f.retry('retry-before-cancel');const ref=mode==='running'?await f.claim():null;
  const result=await f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'cancel',idempotencyKey:'cancel-intent'});
  expect(result[0]?.status).toBe(mode==='running'?'cancel_requested':'cancelled');
  if(ref)expect((await f.tasks.acknowledgeControl({taskId:f.executionId,workerId:'t215-synthetic-host',attempt:ref.attempt})).status).toBe('cancelled');
  await replayUnchanged(f,'retry-before-cancel','cancelled');const before=await snapshot(f.db,f.executionId);
  expect((await f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'cancel',idempotencyKey:'cancel-intent'}))[0]?.status).toBe('cancelled');
  expect(Object.keys(receiptMap(before.execution) as object)).toHaveLength(2);
  for(const command of ['retry','cancel'] as const)await expect(f.tasks.command(f.ctx,{taskIds:[f.executionId],command,idempotencyKey:`new-${command}`})).rejects.toMatchObject({name:'ConflictError'});
  expect(await f.tasks.claimTask({taskId:f.executionId,workerId:'cannot-reissue'})).toBeNull();expect(await snapshot(f.db,f.executionId)).toEqual(before);
 }finally{await f.client.close();}
},180000);
it('X04 原maxAttempts耗尽不受理新key，旧受理key仍回当前failed',async()=>{
 const f=await fixture();try{
  await f.retry('second-attempt');await f.failAttempt();await f.retry('third-attempt');await f.failAttempt();
  const before=await snapshot(f.db,f.executionId);expect(before.execution).toMatchObject({attempt:3,maxAttempts:3,status:'failed'});
  await expect(f.retry('exhausted-new-intent')).rejects.toMatchObject({name:'ConflictError'});expect(await snapshot(f.db,f.executionId)).toEqual(before);
  await replayUnchanged(f,'second-attempt','failed');await replayUnchanged(f,'third-attempt','failed');
 }finally{await f.client.close();}
},180000);
it('X05 原作品扩额预算累计保留，command不造预算门，真实ledger拒绝超额零新增',async()=>{
 const f=await fixture(undefined,undefined,'budget',{budget:{maxCalls:1,maxTokens:5,deadlineMs:600000}});try{
  const first=await snapshot(f.db,f.executionId);expect(first.execution!.executionBudget).toEqual({maxCalls:2,maxTokens:10,deadlineMs:600000});
  await f.retry('budget-first');const ref=await f.claim(),ledger=createExecutionCallLedgerService(f.db,{budget:f.budget,now:f.now});
  const paid=await ledger.reserve(ref,{operationKey:'budget-second',kind:'model',inputDigest:'sha256:'+'d'.repeat(64),reservedTokens:5});
  await ledger.start(ref,paid.id);await ledger.settle(ref,paid.id,{status:'settled',usage:{inputTokens:2,outputTokens:3,totalTokens:5}});
  await f.workflow.failItem(ref,{awemeId:f.failed,error:'确认失败保原预算'});await f.workflow.complete(ref,{});
  await replayUnchanged(f,'budget-first','failed');expect((await f.retry('budget-new'))[0]?.status).toBe('queued');
  const next=await f.claim(),before=await snapshot(f.db,f.executionId);
  await expect(ledger.reserve(next,{operationKey:'over-budget',kind:'model',inputDigest:'sha256:'+'e'.repeat(64),reservedTokens:1})).rejects.toBeInstanceOf(ExecutionBudgetError);
  expect(await snapshot(f.db,f.executionId)).toEqual(before);expect(before.calls.map(c=>c.totalTokens)).toEqual([5,5]);await replayUnchanged(f,'budget-new','running');
 }finally{await f.client.close();}
},180000);
it('X06 到期后同key只回原failed，新key原可queue但claim/lease拒绝且不延长期限',async()=>{
 let stamp='2026-10-10T00:00:00.000Z';const f=await fixture(undefined,undefined,'deadline',{now:()=>stamp});try{
  await f.retry('deadline-original');const ref=await f.failAttempt(),before=await snapshot(f.db,f.executionId);
  stamp=new Date(Date.parse(before.execution!.deadlineAt!)+1).toISOString();await replayUnchanged(f,'deadline-original','failed');
  expect((await f.retry('deadline-new'))[0]?.status).toBe('queued');const queued=await snapshot(f.db,f.executionId);
  expect(queued.execution!.deadlineAt).toBe(before.execution!.deadlineAt);
  expect(await f.tasks.claimTask({taskId:f.executionId,workerId:'expired'})).toBeNull();
  await expect(createExecutionLeaseService(f.db,{now:f.now}).withLease(ref,'admission',async()=>{})).rejects.toMatchObject({name:'ConflictError'});
  expect(await snapshot(f.db,f.executionId)).toEqual(queued);
 }finally{await f.client.close();}
},180000);
it('X07 迁移前account-only真实prepare/claim/Host控制不造组，跨owner/account拒绝',async()=>{
 const f=await fixture(undefined,undefined,'historical',{legacy:true});try{
  expect(await f.db.select().from(accountGroups)).toEqual([]);expect(await f.db.select().from(accountGroupMemberships)).toEqual([]);
  await f.retry('historical-intent');await f.failAttempt();await replayUnchanged(f,'historical-intent','failed');const before=await snapshot(f.db,f.executionId);
  expect(before.execution).toMatchObject({groupId:null,accountId:'t215-historical-account'});
  for(const ctx of [{...f.ctx,userId:'other-owner'},{...f.ctx,accountId:'other-account'}])await expect(f.tasks.command(ctx,{taskIds:[f.executionId],command:'retry',idempotencyKey:'historical-intent'})).rejects.toThrow();
  expect(await snapshot(f.db,f.executionId)).toEqual(before);expect(await f.db.select().from(accountGroups)).toEqual([]);expect(await f.db.select().from(accountGroupMemberships)).toEqual([]);
 }finally{await f.client.close();}
},180000);
it('X08 实际enqueue拒调用方注入空或完整伪Host回执，正常原prepare仍复用',async()=>{
 const f=await fixture(undefined,undefined,'forged',{initialFailure:false});try{
  const before=await snapshot(f.db,f.executionId),base=before.execution!.payload as Record<string,unknown>;
  const forged={[hash('forged')]:{schemaVersion:1,command:'retry',targetDigest:'sha256:'+'a'.repeat(64),inputDigest:'sha256:'+'b'.repeat(64),acceptedAttempt:0,acceptedAt:f.now()}};
  for(const map of [{},forged])await expect(f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:f.id,idempotencyKey:'forged-new-task',payload:{...base,[FIELD]:map}})).rejects.toMatchObject({name:'ExecutionValidationError'});
  expect(await snapshot(f.db,f.executionId)).toEqual(before);expect(await f.prepare.prepare(f.ctx,f.id)).toEqual({aiTaskId:f.id,executionTaskId:f.executionId});expect(await snapshot(f.db,f.executionId)).toEqual(before);
  await f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'cancel',idempotencyKey:'normal-cancel'});const accepted=await snapshot(f.db,f.executionId);
  expect((await f.tasks.enqueue(f.ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:f.id,idempotencyKey:before.execution!.idempotencyKey,payload:base,executionBudget:executionBudgetSchema.parse(before.execution!.executionBudget)})).id).toBe(f.executionId);
  expect(await snapshot(f.db,f.executionId)).toEqual(accepted);
 }finally{await f.client.close();}
},180000);

it.each(['confirmed','fallback'] as const)('X09–X11 实际Source/audio/prepare/ASR/postprocess/保存保回执，公开正文与同付费key恢复闭环：%s',async mode=>{
 const directory=await mkdtemp(join(tmpdir(),'t215-host-lifecycle-'));let close:(()=>Promise<void>)|undefined;
 try{
  const f=await fixture(directory,undefined,'lifecycle',{initialFailure:false});close=()=>f.client.close();
  const first=await f.claim();await f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'pause',idempotencyKey:'pause-intent'});
  expect((await f.tasks.acknowledgeControl({taskId:f.executionId,workerId:'t215-synthetic-host',attempt:first.attempt})).status).toBe('paused');
  await f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'resume',idempotencyKey:'resume-intent'});const ref=await f.claim();
  const map=structuredClone(receiptMap((await snapshot(f.db,f.executionId)).execution));
  const assertMap=async()=>expect(receiptMap((await snapshot(f.db,f.executionId)).execution)).toEqual(map);
  const source=createExecutionTranscribeSourceService(f.db,{now:f.now,resolveProfile:async()=>{throw Error('本例不读profile');},acquireChannel:async()=>{throw Object.assign(Error('合成冷却'),{name:'DouyinCooldownActiveError',channel:'iesdouyin',remainMs:5000});},reportChannel:async()=>({})});
  expect(await source.invoke(ref,'acquireTranscribeChannel',{awemeId:f.failed,channel:'iesdouyin'})).toMatchObject({sourceFailure:{outcome:'retry_wait',errorCode:'TRANSCRIBE_SOURCE_COOLDOWN'}});await assertMap();
  const projectsService=createProjectsService(createProjectRepository(f.db),{now:f.now,nextId:f.nextId});
  const account=await createPlatformAccountService({db:f.db,now:f.now,nextId:f.nextId}).createAccount(f.ctx,{platform:'douyin',accountHandle:'t215-synthetic-douyin',idempotencyKey:'lifecycle-account'});
  const project=await projectsService.ensureImportedProject({...f.ctx,accountId:account.id},{title:'本人待转写作品',platform:'douyin',externalId:f.failed});
  const store=createMockObjectStorage({nextKey:()=>f.nextId('audio')}),objects=new Map<string,Uint8Array>();
  // 唯一合成叶子是对象存储字节；Host、租约、原作品绑定、账本和写回事务全部真实。
  const storage={...store,putObject:async(input:Parameters<typeof store.putObject>[0])=>{await store.putObject(input);objects.set(input.storageKey,Uint8Array.from(input.bytes));},getObject:async(key:string)=>{const bytes=objects.get(key);if(!bytes)throw Object.assign(Error('不存在'),{code:'ENOENT'});return Uint8Array.from(bytes);}};
  const audio=createExecutionTranscribeAudioService(f.db,{now:f.now,objectStorageForCtx:async()=>storage}),asr=createExecutionAsrPorts(f.db,{budget:f.budget,now:f.now});
  await f.workflow.prepareItem(ref,{awemeId:f.failed});await assertMap();
  await f.workflow.recordSource(ref,{awemeId:f.saved,source:{kind:'image-album'}});await f.workflow.saveArtifact(ref,{awemeId:f.saved});await assertMap();
  await f.workflow.recordSource(ref,{awemeId:f.failed,source:{kind:'video',playUrl:'https://t215.synthetic.invalid/never-fetched.mp4'}});await assertMap();
  const bytes=new Uint8Array([1,2,3]);await audio.save(ref,{awemeId:f.failed,bytes});expect(await audio.read(ref,{awemeId:f.failed})).toMatchObject({status:'ready',bytes});await assertMap();
  const preparation=createExecutionTranscribePreparationService(f.db,{now:f.now,audio,asr,resolveSpec:async()=>({kind:'audio',provider:'qwen',model:'synthetic-asr',baseUrl:null,token:'synthetic-only'}),prepareSpec:async(_ctx,spec)=>spec});
  const selected=await preparation.prepare(ref,f.failed);if(selected.status!=='prepared')throw Error('初次应冻结真实plan');await assertMap();
  let plan=selected.plan;
  let request={...plan.identity,audioDigest:plan.audioDigest,audioByteLength:bytes.byteLength,chunks:[{digest:plan.audioDigest,byteLength:bytes.byteLength}],chunkDigest:plan.audioDigest,chunkByteLength:bytes.byteLength,chunkIndex:0,chunkCount:1};
  let reserved=await asr.reserve(ref,{awemeId:f.failed,request});await asr.start(ref,{awemeId:f.failed,callId:reserved.callId});
  if(mode==='fallback'){
   await asr.settle(ref,{awemeId:f.failed,callId:reserved.callId,status:'rejected',rejectionStatus:401});
   const fallback=await asr.selectLocalFallback(ref,{awemeId:f.failed});if(!fallback)throw Error('已有明确拒绝必须返回原本地回退plan');
   plan=fallback;expect(plan.identity.protocol).toBe('whisper-local.v1');await assertMap();
   request={...request,...plan.identity};reserved=await asr.reserve(ref,{awemeId:f.failed,request});await asr.start(ref,{awemeId:f.failed,callId:reserved.callId});
  }
  await asr.settle(ref,{awemeId:f.failed,callId:reserved.callId,status:'settled',result:{text:'本人已确认的原逐字稿',language:'zh'}});await assertMap();
  const paidBefore=(await snapshot(f.db,f.executionId)).calls;expect((await asr.reserve(ref,{awemeId:f.failed,request})).callId).toBe(reserved.callId);
  expect((await preparation.prepare(ref,f.failed)).status).toBe('restored');expect((await snapshot(f.db,f.executionId)).calls).toEqual(paidBefore);
  const post=createExecutionTranscribePostprocessService(f.db,{budget:f.budget,now:f.now,resolveModelSpec:async()=>null,readContext:async()=>({title:'本人作品'})});
  expect(await post.prepare(ref,{awemeId:f.failed})).toMatchObject({status:'restored',result:{applied:false,transcript:'本人已确认的原逐字稿'}});await assertMap();
  const workflow=createExecutionTranscribeWorkflowService(f.db,{now:f.now,nextId:f.nextId,hasTranscriptArtifact:async()=>false,postprocess:post});
  expect(await workflow.saveArtifact(ref,{awemeId:f.failed})).toMatchObject({status:'saved',projectId:project.projectId});await assertMap();
  const reader=createArtifactsService({db:f.db,now:f.now,nextId:f.nextId,assertProjectOwned:(ctx,id)=>projectsService.getProject(ctx,id)});
  const output=(await reader.listProjectArtifacts(f.ctx,project.projectId)).find(a=>a.artifactType==='output_script');expect(output).toBeTruthy();
  expect((await reader.listVersions(f.ctx,output!.id)).find(v=>v.id===output!.currentVersionId)?.contentText).toBe('本人已确认的原逐字稿');
  const saved=await snapshot(f.db,f.executionId);await workflow.saveArtifact(ref,{awemeId:f.failed});expect(await snapshot(f.db,f.executionId)).toEqual(saved);
  expect(await workflow.complete(ref,{})).toEqual({status:'succeeded'});await assertMap();const completed=await snapshot(f.db,f.executionId);
  expect(await f.prepare.prepare(f.ctx,f.id)).toEqual({aiTaskId:f.id,executionTaskId:f.executionId});expect(await snapshot(f.db,f.executionId)).toEqual(completed);
  await close();close=undefined;const reopened=await createDb({dataDir:directory});close=()=>reopened.client.close();
  const taskService=createPersistentTaskService(reopened.db);for(const command of ['pause','resume'] as const)expect((await taskService.command(f.ctx,{taskIds:[f.executionId],command,idempotencyKey:`${command}-intent`}))[0]?.status).toBe('succeeded');
  expect(await snapshot(reopened.db,f.executionId)).toEqual(completed);
 }finally{await close?.();await rm(directory,{recursive:true,force:true});}
},180000);
it('X12 waiting_user认可与receipt同写；旧resume不再次认可后续阻断，绑定和strict字段损坏拒绝',async()=>{
 const f=await fixture();try{
  await f.retry('waiting-original');const ref=await f.claim();await createExecutionWorkerOutcomeService(f.db,{now:f.now}).recordFailure(ref,{outcome:'waiting_user',errorCode:'SYNTHETIC_LOGIN_REQUIRED'});
  expect((await f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'resume',idempotencyKey:'resume-original'}))[0]?.status).toBe('queued');
  const acknowledged=await snapshot(f.db,f.executionId);expect(acknowledged.execution!.payload).toMatchObject({researchBlockedAcknowledgedThroughSequence:1,researchBlockedAcknowledgedCallIds:[]});
  const next=await f.claim(),ledger=createExecutionCallLedgerService(f.db,{budget:f.budget,now:f.now});
  const call=await ledger.reserve(next,{kind:'tool',operationKey:'later-block',inputDigest:'sha256:'+'f'.repeat(64),reservedTokens:0});await ledger.start(next,call.id);await ledger.settle(next,call.id,{status:'rejected'});
  await createExecutionWorkerOutcomeService(f.db,{now:f.now}).recordFailure(next,{outcome:'waiting_user',errorCode:'LATER_SYNTHETIC_BLOCK'});
  const before=await snapshot(f.db,f.executionId);expect((await f.tasks.command(f.ctx,{taskIds:[f.executionId],command:'resume',idempotencyKey:'resume-original'}))[0]?.runtimeStatus).toBe('waiting_user');expect(await snapshot(f.db,f.executionId)).toEqual(before);
  for(const change of [{accountId:'wrong-account'},{groupVersion:99},{membershipVersion:99}]){
   await f.db.update(aiTasks).set(change).where(eq(aiTasks.id,f.id));const damaged=await snapshot(f.db,f.executionId);await expect(f.retry('waiting-original')).rejects.toThrow();expect(await snapshot(f.db,f.executionId)).toEqual(damaged);
   await f.db.update(aiTasks).set({accountId:before.tasks[0]!.accountId,groupVersion:before.tasks[0]!.groupVersion,membershipVersion:before.tasks[0]!.membershipVersion}).where(eq(aiTasks.id,f.id));
  }
  await f.db.update(aiTasks).set({inputData:{awemeIds:[f.failed,f.saved]}}).where(eq(aiTasks.id,f.id));await expect(f.retry('waiting-original')).rejects.toMatchObject({name:'ConflictError'});await f.db.update(aiTasks).set({inputData:before.tasks[0]!.inputData}).where(eq(aiTasks.id,f.id));
  const payload=before.execution!.payload as Record<string,unknown>,map=payload[FIELD] as Record<string,Record<string,unknown>>;
  for(const bad of [{...map,[hash('waiting-original')]:{...map[hash('waiting-original')],extra:'forged'}},[],{invalid:map[hash('waiting-original')]}]){
   await f.db.update(executionTasks).set({payload:{...payload,[FIELD]:bad}}).where(eq(executionTasks.id,f.executionId));const damaged=await snapshot(f.db,f.executionId);await expect(f.retry('waiting-original')).rejects.toMatchObject({name:'ConflictError'});expect(await snapshot(f.db,f.executionId)).toEqual(damaged);
  }
 }finally{await f.client.close();}
},180000);
