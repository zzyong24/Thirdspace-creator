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
async function fixture(id:string,execute:AgenticBackendTool["execute"],dryRun=false){
 const tasks=createPersistentTaskService(db,{now});const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:{kind:"agentic.run",dryRun,tools:[{name:"material.search",version:"1"}]}}});
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.material",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:now()});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const deps={now,budget,tools:{"material.search":{version:"1",parameters:z.object({query:z.string()}),effect:dryRun?"proposal" as const:"none" as const,execute}}};
 const ledger=createExecutionCallLedgerService(db,deps),ports=createExecutionAgenticToolPorts(db,deps);
 const m=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});await ledger.start(ref,m.id);await ledger.settle(ref,m.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"tool-call",toolCallId:"pi-tool",toolName:"material.search",input:'{"query":"素材"}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
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
