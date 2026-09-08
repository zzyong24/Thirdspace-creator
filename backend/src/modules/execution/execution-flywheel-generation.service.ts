import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {eq,executionTasks,type Db} from '@creatoros/backend';
import {workerPortInputSchemas,structuredGenerationInputSchema,workerModelSpecSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import type {RequestContext} from '@creatoros/contract';
import {flywheelOutputSchema} from '@creatoros/ai-worker';
import {createExecutionLeaseService} from './execution-lease.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionWorkerCallPorts} from './execution-worker-call-ports.service';
import {createExecutionWorkerOutcomeService} from './execution-worker-outcome.service';
import {prepareExecutionModelIdentity} from './execution-model-identity.service';
import {createClaimedWorkerSupervision} from './claimed-worker-supervision';
import {ScheduledFlywheelSuspended} from '../ai-runtime/scheduled-flywheel-suspension';
import {bindScheduledFlywheel} from './scheduled-flywheel-binding';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const frozenSchema=z.object({input:structuredGenerationInputSchema,identity:z.json()}).strict();
const json=(value:unknown)=>z.json().parse(JSON.parse(JSON.stringify(value)));
export type FlywheelCapability='benchmark.teardown'|'topic.attribution'|'favorites.triage'|'knowledge.distill';
export interface FlywheelGenerationDeps {
 entryPath:string|(()=>string);
 resolveModelSpec(ctx:RequestContext,capability:FlywheelCapability):Promise<unknown>;
 budget:Parameters<typeof createExecutionCallLedgerService>[1]["budget"];
 now?:()=>string;
}
/** 固定业务阶段共用原任务账本与通用进程监督，外部只能提交真实workId及其事实facet。 */
export function createExecutionFlywheelGenerationService(db:Db,deps:FlywheelGenerationDeps){
 const leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),calls=createExecutionWorkerCallPorts(db,deps),outcomes=createExecutionWorkerOutcomeService(db,deps),supervision=createClaimedWorkerSupervision({entryPath:deps.entryPath});
 return {
 runWorker:supervision.run,
 async generate(ref:ExecutionRef,capability:FlywheelCapability,resourceId:string,facets:Record<string,string|undefined>){
  const verify=()=>leases.withLease(ref,'admission',scope=>bindScheduledFlywheel(scope));
  const bound=await verify(),stageKey=`${capability==='benchmark.teardown'?'benchmark':capability}:${resourceId}`,operationKey=`flywheel:${hash(stageKey)}`,outputSchema=flywheelOutputSchema(capability);
  const allowed:Record<string,readonly FlywheelCapability[]>={benchmark:['benchmark.teardown'],'self.detail':['topic.attribution'],'self.metrics':['topic.attribution'],favorites:['favorites.triage','knowledge.distill']};
  if(!allowed[bound.input.sourceKind]?.includes(capability))throw new Error('飞轮能力超出原调度范围');
  const spec=workerModelSpecSchema.parse(await deps.resolveModelSpec(bound.context,capability));
  const identity=json(prepareExecutionModelIdentity(capability,spec).identity);
  const saved=frozenSchema.parse(await leases.withLease(ref,'admission',async scope=>{
   const {payload,input}=await bindScheduledFlywheel(scope),stages=(payload.flywheelStages??{}) as Record<string,unknown>;
   if(stages[stageKey])return stages[stageKey];
   const value=json({identity,input:{kind:'model.structured',operationKey,capability,skillId:capability,skillSnapshot:input.skillSnapshot,facets,maxOutputTokens:8192,timeoutMs:600000}});
   await scope.tx.update(executionTasks).set({payload:{...payload,flywheelStages:{...stages,[stageKey]:value}}}).where(eq(executionTasks.id,scope.task.id));return value;
  }));
  if(saved.input.operationKey!==operationKey||saved.input.capability!==capability||!isDeepStrictEqual(identity,saved.identity))throw new Error('FLYWHEEL_FROZEN_AUTHORITY_CHANGED');
  const prefix=`${operationKey}/model/`,readCalls=async()=>(await ledger.inspect(ref)).calls.filter(row=>row.operationKey.startsWith(prefix));
  const prior=(await readCalls()).at(-1);if(prior?.status==='settled'&&prior.resultText)return outputSchema.parse(JSON.parse(prior.resultText));
  let closed=false,result:unknown,persisted:string|undefined,sequence=0;
  try{
   const budget=await ledger.initializeBudget(ref);
   await supervision.run({ref,deadlineAt:budget.deadlineAt === null ? null : Date.parse(budget.deadlineAt),verify,isClosed:()=>closed,close:()=>{closed=true;},hasDurableOutcome:()=>result!==undefined||persisted!==undefined,ports:{
    async validate(current,kind){if(closed||!isDeepStrictEqual(current,ref))throw new Error('FLYWHEEL_EXECUTION_CLOSED');await leases.withLease(ref,kind,scope=>bindScheduledFlywheel(scope));},
    async invoke(_current,port,raw){
     if(port==='readTaskContext'){await verify();return saved.input;}
     if(port==='resolveModelCredential'){await verify();if(workerPortInputSchemas.resolveModelCredential.parse(raw).capability!==capability)throw new Error('FLYWHEEL_CAPABILITY_INVALID');return spec;}
     if(port==='heartbeat'){await verify();return {ok:true};}
     if(port==='reserveGenerationCall'){
      const request=workerPortInputSchemas.reserveGenerationCall.parse(raw);if(request.operationKey!==`${prefix}${sequence+1}`)throw new Error('FLYWHEEL_OPERATION_INVALID');
      const max=request.request.maxOutputTokens;if(typeof max!=='number'||max<1||max>saved.input.maxOutputTokens||'headers' in request.request||'abortSignal' in request.request)throw new Error('FLYWHEEL_REQUEST_INVALID');
      const task=await leases.withLease(ref,'admission',async({task})=>task),recorded=await readCalls(),retry=recorded.find(row=>row.id===task.retryOfCallId&&row.operationKey===request.operationKey),encoded=JSON.stringify(request.request);
      if(encoded.length>4000000)throw new Error('FLYWHEEL_REQUEST_TOO_LARGE');
      const row=await ledger.reserve(ref,{operationKey:request.operationKey,kind:'model',inputDigest:`sha256:${hash(request.request)}`,reservedTokens:Buffer.byteLength(encoded)+1024+max,...(retry?{retryOfCallId:retry.id}:{})},(rows,current)=>{
       if(retry&&current.retryOfCallId!==retry.id)throw new Error('FLYWHEEL_RETRY_AUTHORITY_CHANGED');
       const original=rows.find(row=>row.id===current.retryOfCallId),latest=original?rows.filter(row=>row.operationKey===original.operationKey).at(-1):undefined;
       if(original&&latest?.status!=='settled'&&request.operationKey!==original.operationKey&&!rows.some(row=>row.operationKey===request.operationKey&&row.status==='settled'))throw new Error('FLYWHEEL_RETRY_SOURCE_REQUIRED');
      });sequence++;return {callId:row.id,status:row.status,...(row.providerResult?{providerResult:row.providerResult}:{}),...(row.rejectionCode?{rejectionCode:row.rejectionCode}:{})};
     }
     if(port==='startCall'){const input=workerPortInputSchemas.startCall.parse(raw);if(!(await readCalls()).some(row=>row.id===input.callId))throw new Error('FLYWHEEL_CALL_MISMATCH');return calls.startCall(ref,input);}
     if(port==='settleGenerationCall'){const {callId,...value}=workerPortInputSchemas.settleGenerationCall.parse(raw);const row=await ledger.settle(ref,callId,value,call=>{if(!call.operationKey.startsWith(prefix)||call.kind!=='model'||call.parentCallId)throw new Error('FLYWHEEL_CALL_MISMATCH');});return {callId:row.id,status:row.status};}
     if(port==='saveGenerationResult'){await verify();const input=workerPortInputSchemas.saveGenerationResult.parse(raw),value=outputSchema.parse(JSON.parse(input.text)),last=(await readCalls()).at(-1);if(last?.id!==input.callId||last.status!=='settled'||!last.providerResult)throw new Error('FLYWHEEL_RESULT_UNSETTLED');await ledger.settle(ref,last.id,{status:'settled',usage:{},resultText:JSON.stringify(value)});return {callId:last.id};}
     if(port==='commitResult'){
      const input=workerPortInputSchemas.commitResult.parse(raw);
      if(input.outcome!=='succeeded'){const value=await outcomes.recordFailure(ref,input);persisted=value.status;closed=true;return value;}
      await verify();const last=(await readCalls()).at(-1);if(last?.id!==input.callId||last.status!=='settled'||last.resultText!==input.text)throw new Error('FLYWHEEL_COMMIT_MISMATCH');result=outputSchema.parse(JSON.parse(input.text));closed=true;return {};
     }
     throw new Error('FLYWHEEL_PORT_UNAVAILABLE');
    },
   }});
   if(persisted)throw new ScheduledFlywheelSuspended(ref.executionTaskId,persisted);
   if(result===undefined)throw new Error('FLYWHEEL_RESULT_MISSING');return outputSchema.parse(result);
  }catch(error){
   if(error instanceof ScheduledFlywheelSuspended)throw error;
   const last=(await readCalls()).at(-1);if(last?.status==='settled'&&last.resultText){await verify();return outputSchema.parse(JSON.parse(last.resultText));}
   throw error;
  }
 },
 stop:()=>supervision.stop(),
 };
}
