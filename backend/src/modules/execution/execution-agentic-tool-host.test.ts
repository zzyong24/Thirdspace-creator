import {beforeAll,afterAll,it,expect} from "vitest";
import {z} from "zod";
import {createDb,aiTasks,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionAgenticToolPorts,type AgenticBackendTool} from "./execution-agentic-tool-ports.service";
const ctx={userId:"host-u",accountId:"host-a",requestId:"fixture",source:"user" as const};
const now=()=>"2026-09-05T00:00:00.000Z";
const budget={maxCalls:10,maxTokens:100000,deadlineMs:60000};
const output={status:"ok" as const,summary:"已读取",evidence:[{entityId:"actual-id"}],error:null,continuation:null,sideEffect:"none" as const};
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
async function fixture(id:string,execute:AgenticBackendTool["execute"],dryRun=false,modelInput='{"query":"素材"}'){
 const tasks=createPersistentTaskService(db,{now});const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:{kind:"agentic.run",dryRun,tools:[{name:"material.search",version:"1"}]}}});
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.material",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:now()});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const deps={now,budget,tools:{"material.search":{version:"1",parameters:z.object({query:z.string()}),effect:dryRun?"proposal" as const:"none" as const,execute}}};
 const ledger=createExecutionCallLedgerService(db,deps),ports=createExecutionAgenticToolPorts(db,deps);
 const m=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});await ledger.start(ref,m.id);await ledger.settle(ref,m.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"tool-call",toolCallId:"pi-tool",toolName:"material.search",input:modelInput}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
 const tool=await ports.reserve(ref,{modelCallId:m.id,toolCallId:"pi-tool"});await ports.start(ref,{callId:tool.callId});
 return {ref,ports,deps,tasks,ledger,callId:tool.callId};
}
it("两个宿主实例争抢只执行一次，回执先持久化再返回",async()=>{
 let count=0;const f=await fixture("host-once",async(c,input,scope)=>{count++;expect(c).toMatchObject({userId:ctx.userId,accountId:ctx.accountId});expect(input).toEqual({query:"素材"});expect(scope).toMatchObject({aiTaskId:"host-once",toolCallId:"pi-tool"});await new Promise(r=>setTimeout(r,30));return output;});
 const second=createExecutionAgenticToolPorts(db,f.deps);expect(await Promise.all([f.ports.execute(f.ref,{callId:f.callId}),second.execute(f.ref,{callId:f.callId})])).toEqual([output,output]);expect(count).toBe(1);
 const saved=(await f.ledger.inspect(f.ref)).calls.at(-1)!;expect(saved.status).toBe("settled");expect(saved.toolExecutionClaimId).toBeTruthy();
 await expect(f.ports.settle(f.ref,{callId:f.callId,status:"settled",output:{...output,summary:"换内容"}})).rejects.toThrow();
 expect(await second.execute(f.ref,{callId:f.callId})).toEqual(output);expect(count).toBe(1);
});
it("等待者超时与尝试结算unknown不能污染真实执行者",async()=>{
 let began!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{began=r;});const gate=new Promise<void>(r=>{release=r;});let count=0;
 const f=await fixture("host-waiter",async()=>{count++;began();await gate;return output;});const pending=f.ports.execute(f.ref,{callId:f.callId});await started;
 const waiter=createExecutionAgenticToolPorts(db,{...f.deps,waitForResultMs:1});await expect(waiter.execute(f.ref,{callId:f.callId})).rejects.toThrow("仍在执行");
 await expect(waiter.settle(f.ref,{callId:f.callId,status:"unknown"})).rejects.toThrow("实际执行者");expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("started");
 release();expect(await pending).toEqual(output);expect(count).toBe(1);expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("settled");
});
it("冻结预演在执行前阻止副作用handler，同时保留计划回执",async()=>{
 let count=0;const f=await fixture("host-dry",async()=>{count++;return output;},true);
 const result=await f.ports.execute(f.ref,{callId:f.callId});expect(result).toMatchObject({sideEffect:"none",data:{plan:{toolName:"material.search",input:{query:"素材"}}}});expect(count).toBe(0);expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("settled");
});
it("取消阻止领取，归属映射错误不调用handler",async()=>{
 let count=0;const f=await fixture("host-cancel",async()=>{count++;return output;});await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cancel"});await expect(f.ports.execute(f.ref,{callId:f.callId})).rejects.toThrow();
 const other=await fixture("host-owner",async()=>{count++;return output;});await db.update(aiTasks).set({accountId:"foreign"}).where(eq(aiTasks.id,"host-owner"));await expect(other.ports.execute(other.ref,{callId:other.callId})).rejects.toThrow();expect(count).toBe(0);
});
it("已发生的handler异常保持unknown，任何新实例都不能重执行",async()=>{
 let count=0;const f=await fixture("host-unknown",async()=>{count++;throw new Error("handler提交响应丢失");});await expect(f.ports.execute(f.ref,{callId:f.callId})).rejects.toThrow("未确认");
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("unknown");await expect(createExecutionAgenticToolPorts(db,f.deps).execute(f.ref,{callId:f.callId})).rejects.toThrow();expect(count).toBe(1);
});
it("旧领取执行者不能在换fence后覆盖结果",async()=>{
 const f=await fixture("host-fence",async()=>{await db.update(executionTasks).set({fenceToken:"new-fence"}).where(eq(executionTasks.id,f.ref.executionTaskId));return output;});await expect(f.ports.execute(f.ref,{callId:f.callId})).rejects.toThrow();
 const [row]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.callId));expect(row?.status).toBe("started");expect(row?.resultText).toBeNull();
});

it.each(['{"query":null}','{invalid-json'])("参数错误%s持久化为可恢复错误，零handler调用且不能伪报成功",async(raw)=>{
 let count=0;const f=await fixture("invalid-"+raw,async()=>{count++;return output;},false,raw);
 await expect(f.ports.settle(f.ref,{callId:f.callId,status:"settled",output})).rejects.toThrow();
 const result=await f.ports.execute(f.ref,{callId:f.callId});expect(result).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input",retryable:false}});expect(count).toBe(0);
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("settled");
 expect(await f.ports.execute(f.ref,{callId:f.callId})).toEqual(result);expect(count).toBe(0);
});

it("v2 产物工具只走专用原子结算；v1 同名工具仍走旧结算路径",async()=>{
 async function artifact(protocolVersion:1|2){
  const id=`artifact-protocol-${protocolVersion}`,tasks=createPersistentTaskService(db,{now}),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{artifactProtocolVersion:protocolVersion,modelInput:{kind:"agentic.run",dryRun:false,tools:[{name:"artifact.register",version:"1"}]}}});
  await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.artifact",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:now()});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},ledger=createExecutionCallLedgerService(db,{now,budget});
  const model=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"d".repeat(64),reservedTokens:20});await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:1},providerResult:{content:[{type:"tool-call",toolCallId:"artifact-tool",toolName:"artifact.register",input:'{"path":"报告.md","mime":"text/markdown"}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]}});
  let atomic=0;const outcome={status:"ok" as const,summary:"已登记",evidence:[],data:{workbench:{operationId:"placeholder",status:"succeeded",artifactRefs:["wa@1"],progressCursor:null,content:[{type:"text",text:"{}"}]}},error:null,continuation:null,sideEffect:"committed" as const};
  const tools:Record<string,AgenticBackendTool>={"artifact.register":{version:"1",parameters:z.object({path:z.string(),mime:z.literal("text/markdown")}).strict(),effect:"committed",execute:async(_ctx,_input,scope)=>({...outcome,data:{workbench:{...outcome.data.workbench,operationId:scope.callId}}}),commitAndSettle:async(_ctx,_input,result,scope)=>{
   atomic++;const receipt={schemaVersion:1,kind:"tool",toolCallId:scope.toolCallId,toolName:"artifact.register",output:result};
   await db.update(executionCalls).set({status:"settled",resultText:JSON.stringify(receipt),usage:{totalTokens:0},totalTokens:0,updatedAt:now()}).where(eq(executionCalls.id,scope.callId));return result;
  }}};
  const ports=createExecutionAgenticToolPorts(db,{now,budget,tools}),reserved=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"artifact-tool"});await ports.start(ref,{callId:reserved.callId});
  return {ports,ref,ledger,callId:reserved.callId,atomic:()=>atomic};
 }
 const v2=await artifact(2),v2Result=await v2.ports.execute(v2.ref,{callId:v2.callId});expect(v2Result).toMatchObject({sideEffect:"committed"});expect(v2.atomic()).toBe(1);expect((await v2.ledger.inspect(v2.ref)).calls.at(-1)?.status).toBe("settled");
 const v1=await artifact(1),v1Result=await v1.ports.execute(v1.ref,{callId:v1.callId});expect(v1Result).toMatchObject({sideEffect:"committed"});expect(v1.atomic()).toBe(0);expect((await v1.ledger.inspect(v1.ref)).calls.at(-1)?.status).toBe("settled");
});
