import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {createRuntimeDb,aiTasks} from "../src/index";
import {createPersistentTaskService} from "../src/modules/execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../src/modules/execution/execution-call-ledger.service";
import {createExecutionAgenticToolPorts} from "../src/modules/execution/execution-agentic-tool-ports.service";
// 只使用显式隔离测试库，禁止回退至应用环境配置。
const fixture=JSON.parse(readFileSync(process.argv[2]!,"utf8")) as {url:string;root:string};
assert.ok(fixture.root.startsWith("/tmp/t915-pg-"));
assert.equal(new URL(fixture.url).searchParams.get("host"),`${fixture.root}/socket`);
const first=await createRuntimeDb({connectionString:fixture.url});
const second=await createRuntimeDb({connectionString:fixture.url});
try {
 const ctx={userId:randomUUID(),accountId:randomUUID(),requestId:"tool-host-probe",source:"user" as const};
 const aiTaskId=randomUUID();const tasks=createPersistentTaskService(first.db);
 const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:aiTaskId,idempotencyKey:aiTaskId,payload:{modelInput:{kind:"agentic.run",dryRun:false,tools:[{name:"material.search",version:"1"}]}}});
 await first.db.insert(aiTasks).values({id:aiTaskId,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.material",status:"running",executionTaskId:task.id,idempotencyKey:aiTaskId,requestedAt:new Date().toISOString()});
 const claim=await tasks.claimTask({taskId:task.id,workerId:"host-probe"});assert.ok(claim);
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 let executions=0;
 const output={status:"ok" as const,summary:"真实调用回执",evidence:[],error:null,continuation:null,sideEffect:"none" as const};
 const deps={budget:{maxCalls:10,maxTokens:100000,deadlineMs:120_000},tools:{"material.search":{version:"1",parameters:z.object({query:z.string()}),effect:"none" as const,execute:async()=>{executions++;await new Promise(resolve=>setTimeout(resolve,100));return output;}}}};
 const ledger=createExecutionCallLedgerService(first.db,deps);
 const ports=[first,second].map(connection=>createExecutionAgenticToolPorts(connection.db,deps));
 const model=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});
 await ledger.start(ref,model.id);
 await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"tool-call",toolCallId:"pi-tool",toolName:"material.search",input:'{"query":"素材"}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
 const call=await ports[0]!.reserve(ref,{modelCallId:model.id,toolCallId:"pi-tool"});await ports[0]!.start(ref,{callId:call.callId});
 const replies=await Promise.all(Array.from({length:20},(_,i)=>ports[i%2]!.execute(ref,{callId:call.callId})));
 assert.equal(executions,1);for(const reply of replies)assert.deepEqual(reply,output);
 const saved=(await ledger.inspect(ref)).calls.at(-1)!;assert.equal(saved.status,"settled");assert.ok(saved.toolExecutionClaimId);
 await assert.rejects(ports[1]!.settle(ref,{callId:call.callId,status:"settled",output:{...output,summary:"篡改"}}));
 assert.deepEqual(await ports[1]!.execute(ref,{callId:call.callId}),output);assert.equal(executions,1);
 console.log(JSON.stringify({status:"passed",independentPools:2,concurrentExecuteRequests:20,actualHandlerExecutions:executions,persistedBeforeReply:true,replayWithoutExecution:true,changedReceiptRejected:true,postgresVersion:(await first.pool.query("SHOW server_version")).rows[0].server_version}));
} finally {await first.pool.end();await second.pool.end();}
