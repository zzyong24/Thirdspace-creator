import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {buildChatTools,type ChatToolDeps} from "../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";
import {createChatResearchTaskToolHost} from "../modules/ai-runtime/chat-research-tool-host";
import {createChatHostContextReader} from "../modules/ai/chat-host-context.service";
import {createAiRepository} from "../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../modules/execution/execution-call-ledger.service";
import {createExecutionChatToolPorts} from "../modules/execution/execution-chat-tool-ports.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
let db:Db,close:()=>Promise<void>,sequence=0;
const entryPath=resolve("../ai-worker/dist/execution-worker.cjs"),now=()=>new Date().toISOString(),budget={maxCalls:10,maxTokens:100000,deadlineMs:180000};
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe",timeout:180000});},180000);
afterAll(async()=>close());
async function submit(searchConfigured=true,queryContext=true){
 const ctx={userId:"research-user",accountId:`research-${++sequence}`,requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++sequence}`});
 const conversation=await repo.createConversation({title:"搜索",projectId:null,scope:"global"}),message=await repo.createMessage(conversation.id,{role:"user",content:"寻找资料",attachments:[],modelMetadata:{}});
 const tools=(await prepareChatToolDefinitions(buildChatTools(["material.gather"],{searchConfigured} as ChatToolDeps),{workerResearch:true})).definitions;
 const hostContext={schemaVersion:1 as const,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],researchContext:{selectionTitle:queryContext?"原主题":"",userMaterialQueryTerms:queryContext?["原材料"]:[],searchConfigured},skillSnapshot:{snapshotVersion:1 as const,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"事实",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"事实",template:"",tools:["material.gather"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const modelInput={capability:"copilot.assist",system:"依据搜索结果继续",messages:[{role:"user" as const,content:"寻找资料"}],tools,maxSteps:6,maxOutputTokens:128,hostContext};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>modelInput}).submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id});
 return {ctx,submitted,resolveTools:createChatResearchTaskToolHost(createChatHostContextReader(db,{now}))};
}
async function fixture(){
 const f=await submit();const tasks=createPersistentTaskService(db,{now}),claim=(await tasks.claimTask({taskId:f.submitted.executionTaskId,workerId:"host"}))!;
 const ref={executionTaskId:f.submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},signal=new AbortController().signal;
 const tools=await f.resolveTools(f.ctx,{} as never,ref,signal),ports=createExecutionChatToolPorts(db,{now,budget,tools}),ledger=createExecutionCallLedgerService(db,{now,budget});
 const model=await ledger.reserve(ref,{operationKey:"root",kind:"model",inputDigest:`sha256:${"a".repeat(64)}`,reservedTokens:128});await ledger.start(ref,model.id);
 await ledger.settle(ref,model.id,{status:"settled",usage:{},providerResult:{content:[{type:"tool-call",toolCallId:"search",toolName:"material_gather",input:'{"query":" 用户  查询 "}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 const parent=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"search"});await ports.start(ref,{callId:parent.callId});
 return {...f,tasks,ref,ports,ledger,parent,signal};
}
it("原任务与原模型决定查询，结果卡由宿主生成且结算幂等",async()=>{
 const f=await fixture();expect(await f.ports.research.prepare(f.ref,{callId:f.parent.callId},f.signal)).toEqual({available:true,query:"用户 查询",count:10});
 await expect(f.ports.research.prepare(f.ref,{callId:f.parent.callId,query:"篡改"})).rejects.toThrow();
 const raw={callId:f.parent.callId,observation:{status:"ok",results:[{title:"真实页面",url:"https://example.com/a",snippet:"真实摘要"}]}};
 const out=await f.ports.research.settle(f.ref,raw);expect(out.data).toMatchObject({kind:"material.gather",items:[{title:"真实页面",whyRelevant:"真实摘要",sourceUrl:"https://example.com/a"}]});
 expect(await f.ports.research.settle(f.ref,raw)).toEqual(out);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
});
it("未知、跨任务、非法观察和取消后的准备不能变成成功搜索",async()=>{
 const f=await fixture(),other=await fixture();await expect(f.ports.research.prepare(f.ref,{callId:other.parent.callId})).rejects.toThrow();
 for(const url of ["file:///tmp/a","https://user:pass@example.com/a"]){await expect(f.ports.research.settle(f.ref,{callId:f.parent.callId,observation:{status:"ok",results:[{title:"伪",url,snippet:"伪"}]}})).rejects.toThrow();}
 await expect(f.ports.research.settle(f.ref,{callId:f.parent.callId,observation:{status:"ok",results:[],items:[{title:"伪卡"}]}})).rejects.toThrow();
 await f.ledger.settle(f.ref,f.parent.callId,{status:"unknown"});
 await expect(f.ports.research.settle(f.ref,{callId:f.parent.callId,observation:{status:"ok",results:[]}})).rejects.toThrow();
 await other.tasks.command(other.ctx,{taskIds:[other.submitted.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
 await expect(other.ports.research.prepare(other.ref,{callId:other.parent.callId})).rejects.toThrow();
});
it.each([true,false])("真实 Worker：空查询及未装配不启动搜索 available=%s",async available=>{
 const f=await submit(available,false),requests:unknown[]=[];
 const server=createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk.toString();requests.push(JSON.parse(body));
  const first=requests.length===1,delta=first?{tool_calls:[{index:0,id:"search",type:"function",function:{name:"material_gather",arguments:"{}"}}]}:{content:"没有搜索结果"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(c=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...c})}\n\n`).join("")+"data: [DONE]\n\n");
 });await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const host=createChatWorkerDispatcher(db,{now,budget,entryPath,workerId:"research-host",modelConcurrency:1,resolveTools:f.resolveTools,resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
 try{
  await host.drainOnce();const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.submitted.executionTaskId));
  expect(task?.status).toBe(available?"succeeded":"partial");expect(requests).toHaveLength(2);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.submitted.executionTaskId));expect(calls.filter(call=>call.kind==="tool")).toHaveLength(1);expect(calls.find(call=>call.kind==="tool")?.resultText).toContain(available?'"grounding":"web"':'"grounding":"unavailable"');
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
},180000);
it("浏览器修复后显式恢复认可旧阻断，新模型新调用继续搜索",async()=>{
 const f=await fixture();
 const blocked=await f.ports.research.settle(f.ref,{callId:f.parent.callId,observation:{status:"blocked",summary:"浏览器不可用",recoveryState:"browser_runtime_unavailable",error:{code:"permission",retryable:false,recovery:"修复浏览器后恢复"}}});
 expect(blocked.data).toMatchObject({recoveryState:"browser_runtime_unavailable"});
 const {createExecutionWorkerOutcomeService}=await import("../modules/execution/execution-worker-outcome.service");
 const {createExecutionCheckpointService}=await import("../modules/execution/execution-checkpoint.service");
 await createExecutionWorkerOutcomeService(db,{now}).recordFailure(f.ref,{outcome:"waiting_user",errorCode:"CHAT_TOOL_REQUIRES_USER"});
 await f.tasks.command(f.ctx,{taskIds:[f.submitted.executionTaskId],command:"resume",idempotencyKey:"browser-fixed"});
 const claim=(await f.tasks.claimTask({taskId:f.submitted.executionTaskId,workerId:"new-worker"}))!,ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 expect((await createExecutionCheckpointService(db,{now}).read(ref)).acknowledgedBlockedCallIds).toEqual([f.parent.callId]);
 expect(await f.ports.reserve(ref,{modelCallId:(await f.ledger.inspect(ref)).calls[0]!.id,toolCallId:"search"})).toMatchObject({status:"settled",callId:f.parent.callId});
 const model=await f.ledger.reserve(ref,{operationKey:"new-root",kind:"model",inputDigest:`sha256:${"b".repeat(64)}`,reservedTokens:128});await f.ledger.start(ref,model.id);
 await f.ledger.settle(ref,model.id,{status:"settled",usage:{},providerResult:{content:[{type:"tool-call",toolCallId:"new-search",toolName:"material_gather",input:'{"query":"新查询"}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 const parent=await f.ports.reserve(ref,{modelCallId:model.id,toolCallId:"new-search"});await f.ports.start(ref,{callId:parent.callId});
 expect(await f.ports.research.prepare(ref,{callId:parent.callId})).toMatchObject({query:"新查询"});
 expect((await f.ports.research.settle(ref,{callId:parent.callId,observation:{status:"ok",results:[{title:"新观察",url:"https://example.com/new",snippet:"真实新结果"}]}})).status).toBe("ok");
 expect((await f.ledger.inspect(ref)).calls).toHaveLength(4);
});
