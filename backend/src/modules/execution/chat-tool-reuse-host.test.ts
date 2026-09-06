import { beforeAll,afterAll,it,expect } from "vitest";
import { z } from "zod";
import { createDb,aiTasks,type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticToolPorts,type AgenticBackendTool } from "./execution-agentic-tool-ports.service";
let db:Db,close:()=>Promise<void>,seq=0;
const ctx={userId:"reuse-u",accountId:"reuse-a",requestId:"test",source:"user" as const};
const now=()=>new Date().toISOString(),budget={maxCalls:10,maxTokens:10000,deadlineMs:60000};
const output={status:"ok" as const,summary:"已有结果",evidence:[],data:{id:"actual"},error:null,continuation:null,sideEffect:"none" as const};
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close());
async function fixture(execute:NonNullable<AgenticBackendTool["execute"]>,options:{kind?:"chat.run"|"agentic.run";args?:string[];effect?:"none"|"proposal"}={}){
  const id=`reuse-${++seq}`,kind=options.kind??"chat.run",args=options.args??["same","same"],effect=options.effect??"none";
  const tools=[{name:"web.read",version:"1",description:"读取",parameters:{type:"object"},effect}];
  const tasks=createPersistentTaskService(db,{now});
  const input=kind==="chat.run"?{kind,operationKey:id,capability:"copilot.assist",userId:ctx.userId,accountId:ctx.accountId,conversationId:"conv",sourceMessageId:"source",system:"读资料",messages:[{role:"user",content:"读资料"}],maxSteps:6,maxOutputTokens:128,tools}:{kind,tools,dryRun:false};
  const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:input}});
  await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:now()});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;
  const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const ledger=createExecutionCallLedgerService(db,{now,budget});
  const ports=createExecutionAgenticToolPorts(db,{now,budget,tools:{"web.read":{version:"1",parameters:z.object({query:z.string()}),effect,execute}}});
  const model=await ledger.reserve(ref,{kind:"model",operationKey:id,inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:args.map((query,index)=>({type:"tool-call",toolCallId:`tool-${index}`,toolName:kind==="chat.run"?"web_read":"web.read",input:JSON.stringify({query})})),finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
  const ids:string[]=[];
  for(let i=0;i<args.length;i++){const row=await ports.reserve(ref,{modelCallId:model.id,toolCallId:`tool-${i}`});await ports.start(ref,{callId:row.callId});ids.push(row.callId);}
  async function waitClaim(index:number){const end=Date.now()+5000;while(!(await ledger.inspect(ref)).calls.find(row=>row.id===ids[index])?.toolExecutionClaimId){if(Date.now()>end)throw Error("claim timeout");await new Promise(resolve=>setTimeout(resolve,5));}}
  return {ports,ref,ids,ledger,waitClaim};
}
it.each(["chat.run","agentic.run"] as const)("同参并发执行：%s 只对聊天复用，保留 Pi 逐次动作语义",async kind=>{
  let calls=0,release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  const f=await fixture(async()=>{calls++;await held;return output;},{kind});
  const first=f.ports.execute(f.ref,{callId:f.ids[0]});await f.waitClaim(0);
  const second=f.ports.execute(f.ref,{callId:f.ids[1]});await f.waitClaim(1);
  release();expect(await Promise.all([first,second])).toEqual([output,output]);expect(calls).toBe(kind==="chat.run"?1:2);
  const state=(await f.ledger.inspect(f.ref)).calls,receipt=JSON.parse(state.at(-1)!.resultText!);
  expect(receipt.reusedCallId).toBe(kind==="chat.run"?f.ids[0]:undefined);
  expect(await f.ports.execute(f.ref,{callId:f.ids[1]})).toEqual(output);
  expect(calls).toBe(kind==="chat.run"?1:2);
});
it("前序结果未知时，后续同参调用不执行且不覆盖原调用",async()=>{
  let count=0;const f=await fixture(async()=>{count++;throw Error("提交未知");});
  await expect(f.ports.execute(f.ref,{callId:f.ids[0]})).rejects.toThrow();
  await expect(f.ports.execute(f.ref,{callId:f.ids[1]})).rejects.toThrow();
  expect(count).toBe(1);expect((await f.ledger.inspect(f.ref)).calls.slice(1).map(row=>row.status)).toEqual(["unknown","unknown"]);
});
it("无副作用瞬态错误允许下一次真实调用，第三个并发调用复用成功结果",async()=>{
  let count=0,release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  const transient={...output,status:"error" as const,data:undefined,error:{code:"transient" as const,retryable:true,recovery:"稍后重试"}};
  const f=await fixture(async()=>{count++;if(count===1){await held;return transient;}return output;},{args:["same","same","same"]});
  const first=f.ports.execute(f.ref,{callId:f.ids[0]});await f.waitClaim(0);
  const second=f.ports.execute(f.ref,{callId:f.ids[1]});await f.waitClaim(1);
  const third=f.ports.execute(f.ref,{callId:f.ids[2]});await f.waitClaim(2);release();
  await Promise.all([first,second,third]);expect(count).toBe(2);
  const state=(await f.ledger.inspect(f.ref)).calls;expect(JSON.parse(state.at(-1)!.resultText!).reusedCallId).toBe(f.ids[1]);
});
it("参数不同不复用，已确认候选副作用即使部分完成也不重复产生",async()=>{
  let count=0;const partial={...output,status:"partial" as const,sideEffect:"proposal" as const};
  const f=await fixture(async()=>{count++;return partial;},{args:["same","other","same"],effect:"proposal"});
  for(const callId of f.ids)await f.ports.execute(f.ref,{callId});
  expect(count).toBe(2);const last=(await f.ledger.inspect(f.ref)).calls.at(-1)!;expect(JSON.parse(last.resultText!).reusedCallId).toBe(f.ids[0]);
});
it("取消等待复用的调用不会重复执行或污染仍在完成的原调用",async()=>{
  let count=0,release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  const f=await fixture(async()=>{count++;await held;return output;});
  const first=f.ports.execute(f.ref,{callId:f.ids[0]});await f.waitClaim(0);
  const controller=new AbortController(),second=f.ports.execute(f.ref,{callId:f.ids[1]},controller.signal);
  const rejected=expect(second).rejects.toThrow();await f.waitClaim(1);controller.abort();await rejected;
  release();expect(await first).toEqual(output);expect(count).toBe(1);
  expect((await f.ledger.inspect(f.ref)).calls.slice(1).map(row=>row.status)).toEqual(["settled","unknown"]);
});
