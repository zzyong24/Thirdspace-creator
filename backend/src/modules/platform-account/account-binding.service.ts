import {createHash} from 'node:crypto';
import {and,eq,inArray,executionTasks,type Db} from '@creatoros/backend';
import {accountGroupCommands} from '../../schema/account-groups';
import {ENDPOINTS,type RequestContext,type CollectionRunResource} from '@creatoros/contract';
import {executionRouteSchema} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService,createExecutionLeaseService,type PersistentTaskClaim} from '../execution';
import {lockWorkspaceMembership} from './membership-lock.service';
import {OwnershipError,ConflictError,ValidationError} from './platform-account.errors';
export type BindingTransaction=Parameters<Parameters<Db['transaction']>[0]>[0];
export interface BindingIdentity {externalAccountId:string;accountHandle:string;followerBaseline?:number;collectionProof?:{proofSource:string;scopes:CollectionRunResource["capability"][];verifiedAt:string;expiresAt:string|null};}
export interface AccountBindingStagePort {
 createStaging(ctx:RequestContext,runId:string):Promise<{stagingKey:string}>;
 login(ctx:RequestContext,input:{stagingKey:string;signal:AbortSignal}):Promise<boolean>;
 identity(ctx:RequestContext,input:{stagingKey:string;signal:AbortSignal}):Promise<BindingIdentity|null>;
 /** 必须确认本run浏览器已停止且profile租约已释放；失败不能宣称cancelled。 */
 discard(ctx:RequestContext,input:{stagingKey:string;runId:string}):Promise<void>;
 /** 在DB事务外取得宿主profile租约；不得持组锁等待OS停止。 */
 prepareCommit?(ctx:RequestContext,input:{stagingKey:string;identity:BindingIdentity;signal:AbortSignal}):Promise<void>;
 /** 和run成功状态共用tx；FS adopt须可回滚，保留并恢复原目标profile。 */
 commit(ctx:RequestContext,input:{stagingKey:string;identity:BindingIdentity;signal:AbortSignal},tx:BindingTransaction):Promise<{accountId:string;rollbackProfile?:()=>Promise<void>;finalizeProfile?:()=>Promise<void>}>;
}
export interface AccountBindingDeps {db:Db;now:()=>string;nextId:(prefix:string)=>string;stage:AccountBindingStagePort;localStages?:Partial<Record<"xiaohongshu"|"kuaishou"|"wechatOfficial"|"wechatVideo",AccountBindingStagePort>>;capabilities:(ctx:RequestContext)=>Promise<Array<{platform:string;bind:{available:boolean;reason:string;method:string}}>>;wake?:()=>void;onProfileCleanupError?:(error:unknown,runId:string)=>void;
 /** 成功提交之后的默认任务补齐；失败不回滚身份或改变已成功回执。仅内部组合根。 */
 onBound?:(ctx:RequestContext,accountId:string,runId:string)=>Promise<void>;
 onBoundError?:(error:unknown,runId:string)=>void;}
type Start=typeof ENDPOINTS.startAccountBinding.body['_output'];
/** 宿主冻结的路由属于执行协议；其余字段仍按原扫码业务严格校验。 */
function bindingInput(payload:unknown):Start{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return ENDPOINTS.startAccountBinding.body.parse(payload);
 const {executionRoute,...body}=payload as Record<string,unknown>;
 if(executionRoute!==undefined)executionRouteSchema.parse(executionRoute);
 return ENDPOINTS.startAccountBinding.body.parse(body);
}
type Run=typeof ENDPOINTS.getAccountBinding.response['_output'];
type Task=Awaited<ReturnType<ReturnType<typeof createPersistentTaskService>['get']>>;
type Phase='waiting_verification'|'verifying'|'finalizing';
type Checkpoint={phase?:Phase;stagingKey?:string;externalAccountId?:string;accountId?:string;cleanupPending?:boolean;error?:string};
const terminal=new Set(['succeeded','failed','cancelled']);
const checkpoint=(value:unknown):Checkpoint=>value&&typeof value==='object'?value as Checkpoint:{};
/** 只投影协议字段，不按平台名、昵称或内容语义推断身份。 */
function dto(task:Task):Run{
 if(task.kind!=='account_binding'||!task.groupId)throw new OwnershipError('绑定记录不存在');
 const payload=taskPayload(task),state=checkpoint(task.checkpoint);
 const status:Run['status']=task.status==='running'?state.phase??'waiting_verification':task.status==='queued'?'queued':task.status==='cancel_requested'?'cancel_requested':task.status==='cancelled'?'cancelled':task.status==='succeeded'?'succeeded':'failed';
 if(status==='succeeded'&&!state.accountId)throw new ConflictError('绑定回执缺少真实账号ID，请核对原任务');
 return {runId:task.id,groupId:task.groupId,platform:payload.platform,status,accountId:state.accountId??null,error:state.error??task.errorMessage,createdAt:task.createdAt,updatedAt:task.updatedAt};
}
// payload由已验证的start请求冻结；公开status不返回staging目录或profile资料。
function taskPayload(task:Task):Start{return (task as Task&{bindingPayload?:Start}).bindingPayload!;}
export function createAccountBindingService(deps:AccountBindingDeps){
 const {db,now}=deps,tasks=createPersistentTaskService(db,{now,nextId:deps.nextId}),leases=createExecutionLeaseService(db,{now});
 const workerId=deps.nextId('account-binding-worker');
 function stageFor(platform:string):AccountBindingStagePort{
  if(platform==='douyin')return deps.stage;
  if(platform==='xiaohongshu'||platform==='kuaishou'||platform==='wechatOfficial'||platform==='wechatVideo'){const selected=deps.localStages?.[platform];if(selected)return selected;}
  throw new ValidationError('此平台未提供真实扫码绑定端口');
 }
 const active=new Map<string,{controller:AbortController;promise:Promise<void>;kind:"run"|"cleanup"}>();
 const stopFailures=new Map<string,unknown>();let draining:Promise<void>|null=null,stopping=false;
 // 查询只限本业务拥有的execution kind；状态写入全部经唯一任务/lease服务。
 async function read(ctx:RequestContext,id:string,store:Db|BindingTransaction=db){const task=await createPersistentTaskService(store as Db,{now,nextId:deps.nextId}).get(ctx,id);if(task.kind!=='account_binding')throw new OwnershipError('绑定记录不存在');const [row]=await store.select({payload:executionTasks.payload}).from(executionTasks).where(and(eq(executionTasks.id,id),eq(executionTasks.userId,ctx.userId),eq(executionTasks.kind,'account_binding')));if(!row)throw new OwnershipError('绑定记录不存在');return Object.assign(task,{bindingPayload:row.payload as Start});}
 async function guard(ref:{executionTaskId:string;attempt:number;fenceToken:string},signal:AbortSignal){signal.throwIfAborted();await leases.withLease(ref,'admission',async({tx,task,context})=>{const frozen=await lockWorkspaceMembership(tx,{...context,accountId:null});if(frozen.groupVersion!==task.groupVersion)throw new ConflictError('账号组已改变，请在原组重新发起绑定');});signal.throwIfAborted();}
 async function execute(claim:PersistentTaskClaim,signal:AbortSignal){
  const ctx:RequestContext={userId:claim.task.userId,accountId:null,groupId:claim.task.groupId,requestId:`binding:${claim.task.id}`,source:'user'};
  const tuple={taskId:claim.task.id,workerId:claim.lease.workerId,attempt:claim.lease.attempt},ref={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  let stagingKey:string|undefined,externalAccountId:string|undefined,stage:AccountBindingStagePort|undefined;let receipt:Awaited<ReturnType<AccountBindingStagePort["commit"]>>|undefined;
  const save=async(phase:Phase)=>{await tasks.saveCheckpoint({...tuple,checkpoint:{phase,stagingKey,externalAccountId}});};
  try{
   stage=stageFor(bindingInput(claim.payload).platform);
   await guard(ref,signal);const created=await stage.createStaging(ctx,claim.task.id);stagingKey=created.stagingKey;if(!stagingKey)throw new ValidationError('临时扫码环境没有返回真实标识');
   await save('waiting_verification');await guard(ref,signal);
   const loggedIn=await stage.login(ctx,{stagingKey,signal});signal.throwIfAborted();if(!loggedIn)throw new ValidationError('未检测到完成扫码，请重新发起绑定');
   await guard(ref,signal);await save('verifying');const identity=await stage.identity(ctx,{stagingKey,signal});signal.throwIfAborted();if(!identity?.externalAccountId?.trim()||!identity.accountHandle?.trim())throw new ValidationError('扫码已结束，但未读到真实平台身份，请重试');
   externalAccountId=identity.externalAccountId;await guard(ref,signal);await save('finalizing');
   await stage.prepareCommit?.(ctx,{stagingKey,identity,signal});
   await guard(ref,signal); // 宿主等待后重新验证原组版本与本run执行权。
   await leases.withLease(ref,'admission',async({tx,task,context})=>{
    signal.throwIfAborted();const frozen=await lockWorkspaceMembership(tx,{...context,accountId:null});if(frozen.groupVersion!==task.groupVersion)throw new ConflictError('账号组已改变，请在原组重新发起绑定');
    const result=await stage!.commit({...context,accountId:null},{stagingKey:stagingKey!,identity,signal},tx);receipt=result;if(!result.accountId)throw new ValidationError('绑定未返回真实账号ID');
    const atomicTasks=createPersistentTaskService(tx as unknown as Db,{now,nextId:deps.nextId});
    await atomicTasks.saveCheckpoint({...tuple,checkpoint:{phase:'finalizing',stagingKey,externalAccountId,accountId:result.accountId}});
    await atomicTasks.finish({...tuple,fenceToken:ref.fenceToken,status:'succeeded'});
   });
   stopFailures.delete(claim.task.id);
   try{await receipt?.finalizeProfile?.();}catch(error){
    // DB与登录身份已成功；备份清理失败不等于扫码进程未停止。生产adapter记录并重试清理。
    try{deps.onProfileCleanupError?.(error,claim.task.id);}catch{/* 诊断失败不能回滚已提交的真实账号与profile。 */}
   }
   if(receipt?.accountId&&deps.onBound){
    try{await deps.onBound({...ctx,accountId:receipt.accountId,source:'ingestion'},receipt.accountId,claim.task.id);}
    catch(error){try{deps.onBoundError?.(error,claim.task.id);}catch{/* 默认任务诊断失败不能回滚已提交绑定。 */}}
   }
  }catch(error){
   const message=error instanceof Error?error.message:'绑定未完成，请重试';
   try{await receipt?.rollbackProfile?.();if(stagingKey&&stage)await stage.discard(ctx,{stagingKey,runId:claim.task.id});stopFailures.delete(claim.task.id);}
   catch(cleanupError){await tasks.saveCheckpoint({...tuple,checkpoint:{stagingKey,externalAccountId,cleanupPending:true,error:`${message}；扫码环境停止尚未确认，请刷新原任务状态`}}).catch(()=>{});stopFailures.set(claim.task.id,cleanupError);return;}
   const current=await read(ctx,claim.task.id);
   if(terminal.has(current.status))return;
   if(current.status==='cancel_requested'){await tasks.acknowledgeControl(tuple);return;}
   await tasks.saveCheckpoint({...tuple,checkpoint:{error:message}});await tasks.finish({...tuple,fenceToken:ref.fenceToken,status:'failed',errorCode:'ACCOUNT_BINDING_FAILED',errorMessage:message});
  }
 }
 function launch(id:string,control:{signal:AbortSignal},kind:"run"|"cleanup",action:(signal:AbortSignal)=>Promise<void>){
  const controller=new AbortController();const abort=()=>controller.abort(Error('绑定执行已停止，请重新发起'));control.signal.addEventListener('abort',abort,{once:true});if(control.signal.aborted)abort();
  const entry={controller,promise:Promise.resolve(),kind};active.set(id,entry);
  entry.promise=Promise.resolve().then(()=>action(controller.signal)).catch(error=>{stopFailures.set(id,error);}).finally(()=>{control.signal.removeEventListener('abort',abort);active.delete(id);});
 }
 async function recover(control:{signal:AbortSignal}){
  const rows=await db.select().from(executionTasks).where(and(eq(executionTasks.kind,'account_binding'),inArray(executionTasks.status,['running','cancel_requested'])));
  for(const row of rows){if(active.has(row.id)||(!row.leaseOwner)||(row.status!=='cancel_requested'&&row.leaseExpiresAt&&Date.parse(row.leaseExpiresAt)>Date.parse(now())))continue;
   launch(row.id,control,"cleanup",async()=>{const ctx:RequestContext={userId:row.userId,accountId:null,groupId:row.groupId,requestId:`binding-recovery:${row.id}`,source:'user'},state=checkpoint(row.checkpoint);if(state.stagingKey)await stageFor(bindingInput(row.payload).platform).discard(ctx,{stagingKey:state.stagingKey,runId:row.id});const current=await read(ctx,row.id);if(terminal.has(current.status))return;const tuple={taskId:row.id,workerId:row.leaseOwner!,attempt:row.attempt};if(current.status==='cancel_requested')await tasks.acknowledgeControl(tuple);else await tasks.finish({...tuple,fenceToken:row.fenceToken??undefined,status:'failed',errorCode:'ACCOUNT_BINDING_INTERRUPTED',errorMessage:'上次扫码执行已停止并清理，请重新发起绑定'});stopFailures.delete(row.id);});
  }
 }
 async function reserveInTransaction(ctx:RequestContext,input:Start,tx:BindingTransaction):Promise<Run>{
   if(!ctx.groupId||ctx.groupId!==input.groupId)throw new OwnershipError('请先进入要绑定的账号组');
   if(stopping)throw new ConflictError('应用正在停止，请稍后重试');
   const capability=(await deps.capabilities(ctx)).find(row=>row.platform===input.platform)?.bind;
   const key=`account-binding:${input.idempotencyKey}`,hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    await tx.insert(accountGroupCommands).values({userId:ctx.userId,key,kind:'account_binding',inputHash:hash,result:{pending:true},createdAt:now()}).onConflictDoNothing();
    const [memo]=await tx.select().from(accountGroupCommands).where(and(eq(accountGroupCommands.userId,ctx.userId),eq(accountGroupCommands.key,key))).for('update');if(!memo||memo.kind!=='account_binding'||memo.inputHash!==hash)throw new ConflictError('同次绑定请求的账号组或平台已改变，请重新发起');
    const prior=(memo.result as {runId?:string}).runId;if(prior)return dto(await read({...ctx,accountId:null},prior,tx));
    stageFor(input.platform);
    if(!capability?.available||capability.method!=='qr')throw new ValidationError(capability?.reason??'此平台未提供真实扫码绑定端口');
    const frozen=await lockWorkspaceMembership(tx,{...ctx,accountId:null});if(frozen.groupVersion!==input.expectedGroupVersion)throw new ConflictError('账号组版本已改变，请重新读取后绑定');
    const task=await createPersistentTaskService(tx as unknown as Db,{now,nextId:deps.nextId}).enqueue({...ctx,accountId:null},{kind:'account_binding',ownerType:'account_binding',ownerId:deps.nextId('account-binding'),idempotencyKey:key,payload:input,maxAttempts:1});
    await tx.update(accountGroupCommands).set({result:{runId:task.id}}).where(and(eq(accountGroupCommands.userId,ctx.userId),eq(accountGroupCommands.key,key)));return dto(Object.assign(task,{bindingPayload:input}));

 }
 return {
  reserveInTransaction,
  // 保留同一实例的停止状态、active controller与drain；不构造第二个扫码执行器。
  wakeReserved(){deps.wake?.();},
  async start(ctx:RequestContext,input:Start):Promise<Run>{
   const result=await db.transaction(tx=>reserveInTransaction(ctx,input,tx));
   deps.wake?.();return result;
  },
  async status(ctx:RequestContext,id:string):Promise<Run>{return dto(await read({...ctx,accountId:null},id));},
  async cancel(ctx:RequestContext,id:string):Promise<Run>{
   const current=await read({...ctx,accountId:null},id);
   if(!terminal.has(current.status)){
    if(current.status!=="cancel_requested")try{await tasks.command({...ctx,accountId:null},{taskIds:[id],command:'cancel',idempotencyKey:`binding-cancel:${id}`});}
    catch(error){const latest=await read({...ctx,accountId:null},id);if(latest.status!=="cancel_requested"&&!terminal.has(latest.status))throw error;}
    active.get(id)?.controller.abort(Error('用户取消绑定'));deps.wake?.();
   }
   return dto(await read({...ctx,accountId:null},id));
  },
  async drainAccountBindingQueue(control:{signal:AbortSignal;shouldStop():boolean},options:{waitForCompletion?:boolean}={}){
   if(stopping||control.shouldStop())return;
   if(!draining){draining=Promise.resolve().then(async()=>{await recover(control);for(const [id,entry]of active){if(entry.kind!=="run")continue;const row=(await db.select().from(executionTasks).where(eq(executionTasks.id,id)))[0];if(row?.leaseOwner===workerId){await tasks.heartbeat({taskId:id,workerId,attempt:row.attempt,leaseSeconds:360}).catch(()=>entry.controller.abort(Error('绑定执行凭证已变化')));if(row.status==='cancel_requested')entry.controller.abort(Error('用户取消绑定'));}}
    if([...active.values()].some(entry=>entry.kind==="run"))return;const claim=await tasks.claimNext({workerId,kinds:['account_binding'],leaseSeconds:360});if(claim)launch(claim.task.id,control,"run",signal=>execute(claim,signal));}).finally(()=>{draining=null;});}await draining;if(options.waitForCompletion)await Promise.all([...active.values()].map(entry=>entry.promise));
  },
  async stop(){stopping=true;for(const entry of active.values())entry.controller.abort(Error('应用正在停止，扫码绑定尚未完成'));await draining;await Promise.all([...active.values()].map(entry=>entry.promise));if(stopFailures.size)throw Object.assign(new AggregateError([...stopFailures.values()],'扫码浏览器停止尚未确认'),{resourceStopUnconfirmed:true});},
 };
}
export type AccountBindingService=ReturnType<typeof createAccountBindingService>;
