import {it,expect,vi} from "vitest";
import {createDb,aiTasks} from "@creatoros/backend";
import {createObservabilityCollector} from "./collector";
import {createObservabilityTaskLedger} from "./task-ledger";
import {createPersistentTaskService, registerPersistentTaskObserver} from "../execution/persistent-task.service";
import {createExecutionAuthorityService} from "../execution/execution-authority.service";
import {createExecutionWorkerOutcomeService} from "../execution/execution-worker-outcome.service";
it('actual worker outcome commits notify original attempt settlement before later claims',async()=>{
 const opened=await createDb();const ctx={userId:'isolated-outcome',accountId:'isolated-account',requestId:'outcome-probe',source:'user' as const};let at='2026-10-12T00:00:00.000Z';
 try{const collector=createObservabilityCollector(opened.db,{now:()=>at,uploadAvailable:()=>true,writeEncryptedContext:()=>{}});const ledger=createObservabilityTaskLedger(opened.db,collector);await collector.setConsent(ctx,{enabled:false,metricsEnabled:true,consentVersion:2});
 const registration=registerPersistentTaskObserver(opened.db,{observeAttempt:ledger.observeAttempt,observeSettlement:ledger.observeSettlement});const central=createPersistentTaskService(opened.db,{now:()=>at});
 await opened.db.insert(aiTasks).values({id:'independent-outcome-ai',userId:ctx.userId,accountId:ctx.accountId,taskType:'script.draft',idempotencyKey:'independent-outcome-ai',requestedAt:at});
 const budget={maxCalls:3,maxTokens:10000,deadlineMs:120000};const mapped=await createExecutionAuthorityService(opened.db,{now:()=>at}).bindAiTask(ctx,'independent-outcome-ai',{requestFingerprint:'sha256:'+'0'.repeat(64),modelInput:{kind:'model.generate',prompt:'virtual fixture',capability:'script',maxOutputTokens:128,operationKey:'generate'},budget});
 at='2026-10-12T00:01:00.000Z';const claimed=(await central.claimTask({taskId:mapped.executionTaskId,workerId:'independent-outcome-host'}))!;
 await vi.waitFor(async()=>expect((await opened.client.query('SELECT started_at FROM observability_attempt_clocks')).rows).toHaveLength(1),{timeout:120000});
 at='2026-10-12T00:01:10.000Z';const result=await createExecutionWorkerOutcomeService(opened.db,{now:()=>at}).recordFailure({executionTaskId:claimed.task.id,attempt:claimed.lease.attempt,fenceToken:claimed.lease.fenceToken},{outcome:'failed',errorCode:'VIRTUAL_FIXTURE_FAILURE'});
 expect(result.status).toBe('failed');await registration.drain();const rows=(await opened.client.query<{started_at:string;finished_at:string|null;result:string|null}>('SELECT started_at,finished_at,result FROM observability_attempt_clocks')).rows;expect(rows).toHaveLength(1);const row=rows[0];if(!row)throw new Error('missing committed observation');expect(row.finished_at).toBe(at);expect(row.result).toBe('failed');
 }finally{await opened.client.close()}
});
