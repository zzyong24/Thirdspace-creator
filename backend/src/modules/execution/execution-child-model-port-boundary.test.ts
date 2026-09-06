import {beforeAll,afterAll,it,expect} from "vitest";
import {createDb,type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionWorkerCallPorts} from "./execution-worker-call-ports.service";
import {createExecutionGenerationPorts} from "./execution-generation-ports.service";
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>"2026-09-06T10:00:00.000Z",budget={maxCalls:5,maxTokens:10000,deadlineMs:60000};
const ctx={userId:"child-port-u",accountId:"child-port-a",requestId:"test",source:"user" as const};
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close());
async function fixture(){
 const tasks=createPersistentTaskService(db,{now}),id=`child-port-${++seq}`;
 const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget});
 const parent=await ledger.reserve(ref,{kind:"tool",operationKey:"parent",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:0});await ledger.start(ref,parent.id);
 const child=await ledger.reserve(ref,{kind:"model",operationKey:"child",parentCallId:parent.id,inputDigest:"sha256:"+"b".repeat(64),reservedTokens:10});
 return {ref,ledger,child,calls:createExecutionWorkerCallPorts(db,{now,budget}),generation:createExecutionGenerationPorts(db,{now,budget})};
}
const receipt={content:[{type:"text",text:"[]"}],finishReason:{unified:"stop"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]};
it("通用模型端口不能启动内部模型，不能绕开父工具授权",async()=>{
 const f=await fixture();await expect(f.calls.startCall(f.ref,{callId:f.child.id})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("reserved");
});
it.each(["settleCall","settleGenerationCall"] as const)("通用 %s 不能结算内部模型",async method=>{
 const f=await fixture();await f.ledger.start(f.ref,f.child.id);
 const result=method==="settleCall"?f.calls.settleCall(f.ref,{callId:f.child.id,status:"unknown"}):f.generation.settleGenerationCall(f.ref,{callId:f.child.id,status:"settled",providerResult:receipt,usage:{}});
 await expect(result).rejects.toThrow();expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("started");
});
it("通用结构化结果端口不能覆盖内部模型回执",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.child.id);await f.ledger.settle(f.ref,f.child.id,{status:"settled",providerResult:receipt,usage:{}});
 const text=JSON.stringify({object:{},generation:{finishReason:"stop",usage:{inputTokens:null,outputTokens:null,cachedTokens:null,totalTokens:null},attempts:[]}});
 await expect(f.generation.saveGenerationResult(f.ref,{callId:f.child.id,text})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.resultText).toBeNull();
});
