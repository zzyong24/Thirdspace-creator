import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {createRuntimeDb,aiTasks,executionEvidence,eq} from "../src/index";
import {createPersistentTaskService} from "../src/modules/execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../src/modules/execution/execution-call-ledger.service";
import {createExecutionAgenticToolPorts} from "../src/modules/execution/execution-agentic-tool-ports.service";
import {createExecutionResearchEvidenceService,verifyReadEvidence} from "../src/modules/execution/execution-research-evidence.service";
// 只连接显式隔离的/tmp PostgreSQL fixture，禁止回退至应用配置。
const fixture=JSON.parse(readFileSync(process.argv[2]!,"utf8")) as {url:string;root:string};
assert.ok(fixture.root.startsWith("/tmp/t915-pg-"));assert.equal(new URL(fixture.url).searchParams.get("host"),`${fixture.root}/socket`);
const first=await createRuntimeDb({connectionString:fixture.url});
const second=await createRuntimeDb({connectionString:fixture.url});
try{
 const ctx={userId:randomUUID(),accountId:randomUUID(),requestId:"evidence-probe",source:"user" as const},id=randomUUID();
 const tasks=createPersistentTaskService(first.db);
 const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:{kind:"agentic.run",tools:[{name:"web.read",version:"1"}]}}});
 await first.db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.research",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString()});
 const claim=await tasks.claimTask({taskId:task.id,workerId:"first"});assert.ok(claim);
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const deps={budget:{maxCalls:30,maxTokens:100000,deadlineMs:120_000},tools:{"web.read":{version:"1",effect:"none" as const,parameters:z.object({url:z.string(),offset:z.number().int().nonnegative().default(0),snapshotId:z.string().optional(),evidenceRef:z.string().optional()})}}};
 const ledger=createExecutionCallLedgerService(first.db,deps),ports=createExecutionAgenticToolPorts(first.db,deps);
 const services=[first,second].map(connection=>createExecutionResearchEvidenceService(connection.db,deps));
 async function read(input:Record<string,unknown>){
  const key=randomUUID();const model=await ledger.reserve(ref,{kind:"model",operationKey:key,inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"tool-call",toolCallId:key,toolName:"web.read",input:JSON.stringify(input)}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
  const tool=await ports.reserve(ref,{modelCallId:model.id,toolCallId:key});await ports.start(ref,{callId:tool.callId});return {callId:tool.callId,modelSequence:model.sequence};
 }
 const url="https://example.com/request",observation={sourceUrl:"https://example.com/final",title:"持久网页",fullText:"完整正文".repeat(8000)};
 const initial=await read({url});
 const outputs=await Promise.all(Array.from({length:20},(_,i)=>services[i%2]!.settleRead(ref,{callId:initial.callId,observation})));
 for(const output of outputs)assert.deepEqual(output,outputs[0]);
 let rows=await first.db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,task.id));assert.equal(rows.length,1);
 const firstPage=outputs[0]!.data as {evidenceRef:string;snapshotId:string;nextOffset:number};
 const next=await read({url,offset:firstPage.nextOffset,snapshotId:firstPage.snapshotId,evidenceRef:firstPage.evidenceRef});
 const later=await services[1]!.readWindow(ref,{callId:next.callId});assert.equal((later.data as {text:string}).text,observation.fullText.slice(12000,24000));
 assert.equal((await second.db.transaction(tx=>verifyReadEvidence(tx,task.id,[firstPage.evidenceRef],next.modelSequence))).length,1);
 await assert.rejects(services[1]!.settleRead(ref,{callId:initial.callId,observation:{...observation,fullText:"替换"}}));
 const failed=await read({url:"https://example.com/rollback"});
 await first.pool.query(`CREATE FUNCTION fail_probe_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${failed.callId}' AND NEW.status = 'settled' THEN RAISE EXCEPTION 'injected settle failure'; END IF; RETURN NEW; END $$;`);
 await first.pool.query("CREATE TRIGGER fail_probe_evidence_settle BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION fail_probe_evidence();");
 try{await assert.rejects(services[1]!.settleRead(ref,{callId:failed.callId,observation}));rows=await first.db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,task.id));assert.equal(rows.length,1);}
 finally{await first.pool.query("DROP TRIGGER fail_probe_evidence_settle ON execution_calls;");await first.pool.query("DROP FUNCTION fail_probe_evidence();");}
 await services[1]!.settleRead(ref,{callId:failed.callId,observation});
 await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});await tasks.acknowledgeControl({taskId:task.id,workerId:"first",attempt:ref.attempt});
 await tasks.command(ctx,{taskIds:[task.id],command:"resume",idempotencyKey:"resume"});const resumed=await tasks.claimTask({taskId:task.id,workerId:"second"});assert.ok(resumed);
 const newRef={...ref,attempt:resumed.lease.attempt,fenceToken:resumed.lease.fenceToken};assert.deepEqual(await services[1]!.readWindow(newRef,{callId:next.callId}),later);
 await assert.rejects(services[0]!.readWindow(ref,{callId:next.callId}));
 console.log(JSON.stringify({status:"passed",independentPools:2,concurrentSettlements:20,initialSnapshots:1,persistentWindowByteIdentical:true,changedBodyRejected:true,atomicRollbackOnLedgerFailure:true,resumeSameWindow:true,oldFenceRejected:true,postgresVersion:(await first.pool.query("SHOW server_version")).rows[0].server_version}));
}finally{await first.pool.end();await second.pool.end();}
