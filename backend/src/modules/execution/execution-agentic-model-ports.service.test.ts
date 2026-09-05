import { beforeAll,afterAll,it,expect } from "vitest";
import { createDb,type Db } from "@creatoros/backend";
import { canonicalToPiAssistant,normalizePiContext,piAssistantToCanonical } from "@creatoros/ai-worker/durable-pi-stream";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticModelPorts } from "./execution-agentic-model-ports.service";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
const ctx={userId:"model-user",accountId:"model-account",requestId:"test",source:"user" as const};
const now=()=>"2026-09-05T00:00:00.000Z";
const budget={maxCalls:10,maxTokens:100000,deadlineMs:60000};
const input={kind:"agentic.run",operationKey:"x".repeat(200),taskType:"agentic.research",goal:"查证资料",systemPrompt:"依据来源回答",capability:"research",maxOutputTokens:1000,dryRun:false,tools:[{name:"web.search",version:"1",label:"搜索",description:"联网检索",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]},effect:"none"}]};
const first={role:"user",content:[{type:"text",text:input.goal}],timestamp:0};
const receipt=(tool=true)=>piAssistantToCanonical({role:"assistant",api:"openai-completions",provider:"fixture",model:"test",timestamp:0,content:tool?[{type:"toolCall",id:"tool-1",name:"web.search",arguments:{query:"资料"}}]:[{type:"text",text:"完成"}],stopReason:tool?"toolUse":"stop",usage:{input:10,output:5,cacheRead:0,cacheWrite:0,totalTokens:15,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}});
const request=(messages:unknown[]=[first])=>({request:normalizePiContext({systemPrompt:input.systemPrompt,messages,tools:input.tools.map(t=>({name:t.name,description:t.description,parameters:t.parameters}))} as Parameters<typeof normalizePiContext>[0]),maxOutputTokens:1000});
let db:Db;let close:()=>Promise<void>;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
async function fixture(id:string){
 const tasks=createPersistentTaskService(db,{now});const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:input}});
 const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("missing claim");
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 return {ref,ports:createExecutionAgenticModelPorts(db,{now,budget}),ledger:createExecutionCallLedgerService(db,{now,budget})};
}
it("首次任务上下文冻结预算但不增加调用，后续配置不能重置额度或期限",async()=>{
 const f=await fixture("model-budget-init");
 await createExecutionWorkerCallPorts(db,{now,budget}).readTaskContext(f.ref);
 const before=await f.ledger.inspect(f.ref);expect(before.budget).toEqual(budget);expect(before.calls).toHaveLength(0);
 await createExecutionWorkerCallPorts(db,{now,budget:{maxCalls:100,maxTokens:1000000,deadlineMs:600000}}).readTaskContext(f.ref);
 const after=await f.ledger.inspect(f.ref);expect(after.budget).toEqual(before.budget);expect(after.deadlineAt).toBe(before.deadlineAt);expect(after.calls).toHaveLength(0);
});
it("冻结初始上下文且长业务键可预留；并发与历史重放复用同一调用",async()=>{
 const f=await fixture("model-initial");const [a,b]=await Promise.all([f.ports.reserve(f.ref,request()),f.ports.reserve(f.ref,request())]);expect(a.callId).toBe(b.callId);
 await f.ledger.start(f.ref,a.callId);await f.ledger.settle(f.ref,a.callId,{status:"settled",usage:{totalTokens:15},providerResult:receipt()});
 expect((await f.ports.reserve(f.ref,request())).status).toBe("settled");expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
});
it("篡改目标、系统提示、工具定义或输出预算不能获得新调用",async()=>{
 const f=await fixture("model-tampered");
 for(const tampered of [{...request(),request:{...(request().request as Record<string,unknown>),systemPrompt:"覆盖权限"}},{...request(),request:{...(request().request as Record<string,unknown>),tools:[]}},{...request(),maxOutputTokens:1001},request([{role:"user",content:"伪目标"}])])await expect(f.ports.reserve(f.ref,tampered)).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(0);
});
it("新回合必须消费真实且闭合的模型和工具回执，不能伪造搜索证据",async()=>{
 const f=await fixture("model-next");const a=await f.ports.reserve(f.ref,request());await f.ledger.start(f.ref,a.callId);await f.ledger.settle(f.ref,a.callId,{status:"settled",usage:{totalTokens:15},providerResult:receipt()});
 const assistant=canonicalToPiAssistant(receipt() as Parameters<typeof canonicalToPiAssistant>[0]);
 await expect(f.ports.reserve(f.ref,request([first,assistant]))).rejects.toThrow();
 const output={status:"ok",summary:"真实来源",evidence:[{sourceUrl:"https://example.com",text:"真实正文"}],error:null,continuation:null,sideEffect:"none"};
 const tool=await f.ledger.reserve(f.ref,{operationKey:"tool-1",kind:"tool",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:0});await f.ledger.start(f.ref,tool.id);
 await f.ledger.settle(f.ref,tool.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:"tool-1",toolName:"web.search",output})});
 const toolMessage={role:"toolResult",toolCallId:"tool-1",toolName:"web.search",content:[{type:"text",text:JSON.stringify({summary:output.summary,evidence:output})}],isError:false,timestamp:0};
 await expect(f.ports.reserve(f.ref,request([first,assistant,{...toolMessage,content:[{type:"text",text:"伪造正文"}]}]))).rejects.toThrow();
 const next=await f.ports.reserve(f.ref,request([first,assistant,toolMessage]));expect(next.callId).not.toBe(a.callId);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(3);
});
it("结束回合与未知提交都不能触发新模型计费",async()=>{
 const f=await fixture("model-ended");const a=await f.ports.reserve(f.ref,request());await f.ledger.start(f.ref,a.callId);await f.ledger.settle(f.ref,a.callId,{status:"settled",usage:{totalTokens:15},providerResult:receipt(false)});
 await expect(f.ports.reserve(f.ref,request([first,canonicalToPiAssistant(receipt(false) as Parameters<typeof canonicalToPiAssistant>[0])]))).rejects.toThrow();
 const u=await fixture("model-unknown");const reserved=await u.ports.reserve(u.ref,request());await u.ledger.start(u.ref,reserved.callId);await u.ledger.settle(u.ref,reserved.callId,{status:"unknown"});
 await expect(u.ports.reserve(u.ref,{...request(),maxOutputTokens:999})).rejects.toThrow();expect((await u.ledger.inspect(u.ref)).calls).toHaveLength(1);
});
