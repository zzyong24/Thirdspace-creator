import { runDurableAgenticTool } from "@creatoros/ai-worker/durable-agentic-tool";
import type { WorkerPort } from "@creatoros/contract/execution-worker";
import { beforeAll,afterAll,it,expect } from "vitest";
import { z } from "zod";
import { createDb,type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
const ctx={userId:"tool-user",accountId:"tool-account",requestId:"test",source:"user" as const};
const budget={maxCalls:5,maxTokens:1000,deadlineMs:60000};
const output={status:"ok" as const,summary:"查询完成",evidence:[{entityId:"real-id"}],error:null,continuation:null,sideEffect:"none" as const};
let db:Db;let close:()=>Promise<void>;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
async function fixture(id:string){
 const now=()=>"2026-09-05T00:00:00.000Z";const tasks=createPersistentTaskService(db,{now});
 const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:{kind:"agentic.run",tools:[{name:"web.search",version:"1"}]}}});
 const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("claim missing");
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget});
 const tools={"web.search":{version:"1",parameters:z.object({query:z.string().min(1)}).strict(),effect:"none" as const}};
 const ports=createExecutionAgenticToolPorts(db,{now,budget,tools});
 async function model(key:string,input='{"query":"资料"}',name="web.search"){
  const c=await ledger.reserve(ref,{operationKey:key,kind:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});await ledger.start(ref,c.id);
  await ledger.settle(ref,c.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"tool-call",toolCallId:"tool-id",toolName:name,input}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});return {modelCallId:c.id,toolCallId:"tool-id"};
 }
 return {ref,ports,ledger,tasks,task,model};
}
it("同一真实模型工具调用并发预留幂等，重复只返回原回执，工具不虚增模型token",async()=>{
 const f=await fixture("once");const request=await f.model("m1");
 const [a,b]=await Promise.all([f.ports.reserve(f.ref,request),f.ports.reserve(f.ref,request)]);expect(a.callId).toBe(b.callId);expect(a.input).toEqual({query:"资料"});
 await f.ports.start(f.ref,{callId:a.callId});await f.ports.settle(f.ref,{callId:a.callId,status:"settled",output});
 const repeated=await f.ports.reserve(f.ref,request);expect(repeated.status).toBe("settled");expect(repeated.receipt?.output).toEqual(output);
 const state=await f.ledger.inspect(f.ref);expect(state.calls).toHaveLength(2);expect(state.spentTokens).toBe(15);
});
it("跨任务、未授权工具、非法参数和被新回合替代的调用不能预留",async()=>{
 const f=await fixture("authority");const other=await fixture("other");const first=await f.model("first");
 await expect(other.ports.reserve(other.ref,first)).rejects.toMatchObject({name:"ConflictError"});
 await f.model("new");await expect(f.ports.reserve(f.ref,first)).rejects.toMatchObject({name:"ConflictError"});
 const invalid=await f.model("invalid",'{"query":null}');await expect(f.ports.reserve(f.ref,invalid)).rejects.toThrow();
 const denied=await f.model("denied",'{}',"bash");await expect(f.ports.reserve(f.ref,denied)).rejects.toMatchObject({name:"ConflictError"});
});
it("未知副作用强制进入unknown并禁止同键重新启动",async()=>{
 const f=await fixture("unknown");const a=await f.ports.reserve(f.ref,await f.model("m"));await f.ports.start(f.ref,{callId:a.callId});
 const result=await f.ports.settle(f.ref,{callId:a.callId,status:"settled",output:{...output,sideEffect:"unknown"}});expect(result.status).toBe("unknown");
 await expect(f.ledger.start(f.ref,a.callId)).rejects.toMatchObject({name:"ConflictError"});
 await expect(f.ports.settle(f.ref,{callId:a.callId,status:"settled",output})).rejects.toMatchObject({name:"ConflictError"});
});
it("取消阻止新启动，已执行工具仍可结算；Worker不能自报更高副作用",async()=>{
 const f=await fixture("cancel");const request=await f.model("m");const a=await f.ports.reserve(f.ref,request);await f.ports.start(f.ref,{callId:a.callId});
 await expect(f.ports.settle(f.ref,{callId:a.callId,status:"settled",output:{...output,sideEffect:"committed"}})).rejects.toMatchObject({name:"ConflictError"});
 await f.tasks.command(ctx,{taskIds:[f.task.id],command:"cancel",idempotencyKey:"cancel"});
 await f.ports.settle(f.ref,{callId:a.callId,status:"settled",output});
 await expect(f.ports.reserve(f.ref,request)).rejects.toMatchObject({name:"ConflictError"});
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("settled");
});

it("已预留工具被新模型回合替代后不能启动，通用模型端口不可绕过",async()=>{
 const f=await fixture("stale-reservation");const request=await f.model("before");const a=await f.ports.reserve(f.ref,request);
 await f.model("after");await expect(f.ports.start(f.ref,{callId:a.callId})).rejects.toMatchObject({name:"ConflictError"});
 const {createExecutionWorkerCallPorts}=await import("./execution-worker-call-ports.service");
 const modelPorts=createExecutionWorkerCallPorts(db,{now:()=>"2026-09-05T00:00:00.000Z",budget});
 await expect(modelPorts.startCall(f.ref,{callId:a.callId})).rejects.toMatchObject({name:"ConflictError"});
});

it("两个并发执行器共享真实端口，失败启动者不能把成功执行者污染为unknown",async()=>{
 const f=await fixture("parallel-executors");const input=await f.model("m");let executions=0;let reserved=0;
 let releaseReservations!:()=>void;const reservationsReady=new Promise<void>(r=>{releaseReservations=r;});
 let releaseLoser!:()=>void;const loserFinished=new Promise<void>(r=>{releaseLoser=r;});
 const call=async(port:WorkerPort,data:unknown)=>{
  if(port==="reserveAgenticTool"){const result=await f.ports.reserve(f.ref,data);reserved++;if(reserved===2)releaseReservations();await reservationsReady;return result;}
  if(port==="startAgenticTool")return f.ports.start(f.ref,data);
  if(port==="settleAgenticTool")return f.ports.settle(f.ref,data);
  throw new Error("unexpected port");
 };
 const run=()=>runDurableAgenticTool(input,{signal:new AbortController().signal,call,execute:async()=>{executions++;await loserFinished;return output;}}).catch(error=>{releaseLoser();throw error;});
 const results=await Promise.allSettled([run(),run()]);
 expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(executions).toBe(1);
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("settled");
});
it("真实结算已落库但回执丢失，新执行器复用原结果，不重复工具动作",async()=>{
 const f=await fixture("lost-settlement");const input=await f.model("m");let executions=0;let drop=true;
 const call=async(port:WorkerPort,data:unknown)=>{
  if(port==="reserveAgenticTool")return f.ports.reserve(f.ref,data);
  if(port==="startAgenticTool")return f.ports.start(f.ref,data);
  if(port==="settleAgenticTool"){const result=await f.ports.settle(f.ref,data);if(drop && result.status==="settled"){drop=false;throw new Error("lost reply");}return result;}
  throw new Error("unexpected port");
 };
 const deps={signal:new AbortController().signal,call,execute:async()=>{executions++;return output;}};
 await expect(runDurableAgenticTool(input,deps)).rejects.toThrow();
 expect(await runDurableAgenticTool(input,{...deps,signal:new AbortController().signal})).toEqual(output);
 expect(executions).toBe(1);expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("settled");
});
