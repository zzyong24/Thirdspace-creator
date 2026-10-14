import {it,expect,vi} from "vitest";
const bridge=vi.hoisted(()=>({tasks:null as any}));
vi.mock("../execution/worker-supervisor",()=>({createWorkerSupervisor:()=>({start:async()=>['model.generate'],run:async(ref:any)=>{await bridge.tasks.finish({taskId:ref.executionTaskId,workerId:'independent-host',attempt:ref.attempt,fenceToken:ref.fenceToken,status:'succeeded'})},cancel:()=>{},stop:async()=>{},stopExecutionTree:async()=>true})}));
import {createDb,aiTasks} from "@creatoros/backend";
import {createObservabilityCollector} from "./collector";
import {createObservabilityTaskLedger} from "./task-ledger";
import {createPersistentTaskService, registerPersistentTaskObserver} from "../execution/persistent-task.service";
import {createExecutionAuthorityService} from "../execution/execution-authority.service";
import {createModelWorkerDispatcher} from "../execution/model-worker-dispatcher";
it('actual dispatcher claims see the installed central observer',async()=>{
 const opened=await createDb();const ctx={userId:'isolated-dispatcher',accountId:'isolated-account',requestId:'dispatcher-probe',source:'user' as const};let at='2026-10-12T00:00:00.000Z';let dispatcher:any;
 try{const collector=createObservabilityCollector(opened.db,{now:()=>at,uploadAvailable:()=>true,writeEncryptedContext:()=>{}});const ledger=createObservabilityTaskLedger(opened.db,collector);await collector.setConsent(ctx,{enabled:false,metricsEnabled:true,consentVersion:2});
 const registration=registerPersistentTaskObserver(opened.db,{observeAttempt:ledger.observeAttempt,observeSettlement:ledger.observeSettlement});const central=createPersistentTaskService(opened.db,{now:()=>at});bridge.tasks=createPersistentTaskService(opened.db,{now:()=>at});
 await opened.db.insert(aiTasks).values({id:'independent-ai',userId:ctx.userId,accountId:ctx.accountId,taskType:'script.draft',idempotencyKey:'independent-ai',requestedAt:at});
 const budget={maxCalls:3,maxTokens:10000,deadlineMs:120000};const mapped=await createExecutionAuthorityService(opened.db,{now:()=>at}).bindAiTask(ctx,'independent-ai',{requestFingerprint:'sha256:'+'0'.repeat(64),modelInput:{kind:'model.generate',prompt:'virtual fixture',capability:'script',maxOutputTokens:128,operationKey:'generate'},budget});
 at='2026-10-12T00:01:00.000Z';dispatcher=createModelWorkerDispatcher(opened.db,{now:()=>at,entryPath:'/tmp/independent-no-process-started',workerId:'independent-host',budget,modelConcurrency:1,resolveModelCredential:async()=>{throw Error('must not call model')},projectCandidate:()=>{throw Error('must not use model')}});await dispatcher.drainOnce();
 expect((await central.get(ctx,mapped.executionTaskId)).status).toBe('succeeded');await registration.drain();await ledger.sweep(ctx);const clocks=(await opened.client.query('SELECT task_id FROM observability_attempt_clocks')).rows;console.log(JSON.stringify({actualDispatcherTask:mapped.executionTaskId,clocks:clocks.length}));expect(clocks).toHaveLength(1);
 const batch=await collector.sealBatch(ctx,{appVersion:'1.2.0-independent',osName:'macos'});expect(JSON.parse(batch!.body).operations.reduce((n:number,v:any)=>n+v.attemptSuccess,0)).toBe(1);
 }finally{await dispatcher?.stop();await opened.client.close()}
});
