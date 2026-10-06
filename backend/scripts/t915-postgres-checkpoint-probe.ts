import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRuntimeDb } from "../src/index";
import { createPersistentTaskService } from "../src/modules/execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../src/modules/execution/execution-call-ledger.service";
import { createExecutionCheckpointService } from "../src/modules/execution/execution-checkpoint.service";

// 仅显式隔离fixture，禁止回退到应用数据库。
const fixture=JSON.parse(readFileSync(process.argv[2]!,"utf8")) as {url:string;root:string};
assert.ok(fixture.root.startsWith("/tmp/t915-pg-"));
assert.equal(new URL(fixture.url).searchParams.get("host"),`${fixture.root}/socket`);
const first=await createRuntimeDb({connectionString:fixture.url});
const second=await createRuntimeDb({connectionString:fixture.url});
try {
  const ctx={userId:randomUUID(),accountId:randomUUID(),requestId:"checkpoint-probe",source:"user" as const};
  const tasks=createPersistentTaskService(first.db);
  const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:randomUUID(),idempotencyKey:randomUUID(),payload:{}});
  const claim=await tasks.claimTask({taskId:task.id,workerId:"first"});assert.ok(claim);
  const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const budget={maxCalls:10,maxTokens:1000,deadlineMs:120_000};
  const ledger=createExecutionCallLedgerService(first.db,{budget});
  const services=[first,second].map(c=>createExecutionCheckpointService(c.db));
  async function settle(key:string){
    const call=await ledger.reserve(ref,{operationKey:key,kind:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});
    await ledger.start(ref,call.id);await ledger.settle(ref,call.id,{status:"settled",usage:{totalTokens:15},resultText:key});return {role:"assistant" as const,callId:call.id};
  }
  const a=await settle("一");
  const initial={expectedRevision:0,expectedLedgerSequence:1,messages:[a]};
  const repeated=await Promise.all(Array.from({length:30},(_,i)=>services[i%2]!.save(ref,initial)));
  assert.ok(repeated.every(receipt=>receipt.revision===1));
  const b=await settle("二");
  const competing=await Promise.allSettled([
    services[0]!.save(ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[a,b]}),
    services[1]!.save(ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[a]}),
  ]);
  assert.equal(competing.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(competing.filter(result=>result.status==="rejected").length,1);
  const latest=await services[0]!.read(ref);assert.equal(latest.revision,2);
  await assert.rejects(services[1]!.save(ref,initial));
  await tasks.command(ctx,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});
  await tasks.acknowledgeControl({taskId:task.id,workerId:"first",attempt:ref.attempt});
  await tasks.command(ctx,{taskIds:[task.id],command:"resume",idempotencyKey:"resume"});
  const next=await tasks.claimTask({taskId:task.id,workerId:"second"});assert.ok(next);
  const resumed=await services[1]!.read({...ref,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken});
  assert.equal(resumed.revision,2);assert.equal(resumed.knownSpentTokens,30);assert.deepEqual(resumed.budget,budget);
  await assert.rejects(services[0]!.save(ref,{expectedRevision:2,expectedLedgerSequence:2,messages:[a,b]}));
  console.log(JSON.stringify({status:"passed",independentPools:2,concurrentRepeatedSaves:30,revisionAfterRepeatedSaves:1,competingWrites:2,acceptedCompetingWrites:1,rejectedCompetingWrites:1,recoveredRevision:resumed.revision,recoveredSpentTokens:resumed.knownSpentTokens,oldFenceRejected:true,postgresVersion:(await first.pool.query("SHOW server_version")).rows[0].server_version}));
} finally {await first.pool.end();await second.pool.end();}
