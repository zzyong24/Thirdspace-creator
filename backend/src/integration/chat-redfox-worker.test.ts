import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createIntegrationCredentials} from "../modules/settings/integration-credentials";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {buildChatTools,type ChatToolDeps} from "../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";
import {createChatRedfoxTaskToolHost} from "../modules/ai-runtime/chat-redfox-tool-host";
import {createChatHostContextReader} from "../modules/ai/chat-host-context.service";
import {createAiRepository} from "../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
import {createExecutionCallLedgerService} from "../modules/execution/execution-call-ledger.service";
import {createExecutionChatToolPorts} from "../modules/execution/execution-chat-tool-ports.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
let db:Db,close:()=>Promise<void>,sequence=0;
const entryPath=resolve("../ai-worker/dist/execution-worker.cjs"),now=()=>new Date().toISOString(),budget={maxCalls:10,maxTokens:100000,deadlineMs:60000};
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
afterAll(async()=>close());
async function submit(searchConfigured=true,queryContext=true){
 const ctx={userId:"research-user",accountId:`research-${++sequence}`,requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++sequence}`});
 const conversation=await repo.createConversation({title:"搜索",projectId:null,scope:"global"}),message=await repo.createMessage(conversation.id,{role:"user",content:"寻找资料",attachments:[],modelMetadata:{}});
 const tools=(await prepareChatToolDefinitions(buildChatTools(["redfox.query"],{searchConfigured} as ChatToolDeps),{workerResearch:true})).definitions;
 const hostContext={schemaVersion:1 as const,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],researchContext:{selectionTitle:queryContext?"原主题":"",userMaterialQueryTerms:queryContext?["原材料"]:[],searchConfigured},skillSnapshot:{snapshotVersion:1 as const,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"事实",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"事实",template:"",tools:["redfox.query"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const modelInput={capability:"copilot.assist",system:"依据搜索结果继续",messages:[{role:"user" as const,content:"寻找资料"}],tools,maxSteps:6,maxOutputTokens:128,hostContext};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>modelInput}).submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id});
 return {ctx,submitted,resolveTools:createChatRedfoxTaskToolHost(createChatHostContextReader(db,{now}))};
}
async function fixture(){
 const f=await submit();const tasks=createPersistentTaskService(db,{now}),claim=(await tasks.claimTask({taskId:f.submitted.executionTaskId,workerId:"host"}))!;
 const ref={executionTaskId:f.submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},signal=new AbortController().signal;
 const tools=await f.resolveTools(f.ctx,{} as never,ref,signal),ports=createExecutionChatToolPorts(db,{now,budget,tools,resolveRedfoxCredential:async()=>({key:"never-model-secret",fingerprint:"fp"})}),ledger=createExecutionCallLedgerService(db,{now,budget});
 const model=await ledger.reserve(ref,{operationKey:"root",kind:"model",inputDigest:`sha256:${"a".repeat(64)}`,reservedTokens:128});await ledger.start(ref,model.id);
 await ledger.settle(ref,model.id,{status:"settled",usage:{},providerResult:{content:[{type:"tool-call",toolCallId:"search",toolName:"redfox_query",input:'{"action":"detail","workId":"123456"}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 const parent=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"search"});await ports.start(ref,{callId:parent.callId});
 return {...f,tasks,ref,ports,ledger,parent,signal};
}
it("宿主根据冻结工具绑定恢复凭据，跨调用被拒绝，结算不含密钥",async()=>{
 const f=await fixture(),other=await fixture();const prepared=await f.ports.redfox.prepare(f.ref,{callId:f.parent.callId},f.signal);
 expect(prepared).toMatchObject({input:{action:"detail",workId:"123456"},credential:{key:"never-model-secret"}});
 await expect(f.ports.redfox.prepare(f.ref,{callId:other.parent.callId},f.signal)).rejects.toThrow();
 const raw={callId:f.parent.callId,observation:{status:"ok",data:{id:"123456",title:"真实数据"}}};
 const result=await f.ports.redfox.settle(f.ref,raw);expect(result.data).toMatchObject({kind:"redfox.query",status:"ok"});expect(await f.ports.redfox.settle(f.ref,raw)).toEqual(result);
 expect(JSON.stringify((await f.ledger.inspect(f.ref)).calls)).not.toContain("never-model-secret");
});
it.each([true,false])("真实 Worker：两种模型配置共用独立未配置数据服务 mode=%s",async available=>{
 const f=await submit(available,false),requests:unknown[]=[];
 const server=createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk.toString();requests.push(JSON.parse(body));
  const first=requests.length===1,delta=first?{tool_calls:[{index:0,id:"search",type:"function",function:{name:"redfox_query",arguments:'{"action":"detail","workId":"123456"}'}}]}:{content:"没有搜索结果"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(c=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...c})}\n\n`).join("")+"data: [DONE]\n\n");
 });await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const host=createChatWorkerDispatcher(db,{now,budget,entryPath,workerId:"research-host",modelConcurrency:1,resolveTools:f.resolveTools,resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:available?"official-fixture":"custom-fixture",token:"fixture"})});
 try{
  await host.drainOnce();const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.submitted.executionTaskId));
  expect(task?.status).toBe("succeeded");expect(requests).toHaveLength(2);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.submitted.executionTaskId));expect(calls.filter(call=>call.kind==="tool")).toHaveLength(1);expect(calls.find(call=>call.kind==="tool")?.resultText).toContain('REDFOX_NOT_CONFIGURED');
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
},15000);

it.each(["official-fixture","custom-fixture"])("配置密钥后真实 Worker：查询→提交→原taskId结果，%s",async modelName=>{
 const f=await submit(),requests:unknown[]=[];
 const dir=mkdtempSync(join(tmpdir(),"redfox-worker-")),callsFile=join(dir,"calls.jsonl"),wrapper=join(dir,"entry.cjs");
 const key="isolated-protocol-fixture-key",credentials=createIntegrationCredentials(db,Buffer.alloc(32,5));await credentials.save(f.ctx,key);
 writeFileSync(wrapper,`
 const fs=require('node:fs');const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const u=String(url);
  if(u.startsWith('https://redfox.hk/')){
   const body=JSON.parse(init.body);const authorized=init.headers.REDFOX_API_KEY===${JSON.stringify(key)};
   fs.appendFileSync(${JSON.stringify(callsFile)},JSON.stringify({url:u,body,authorized})+'\\n');
   if(!authorized)return new Response('',{status:401});
   const data=u.includes('/submit/')?{taskId:'fixture-task'}:u.includes('/result/')?{taskId:body.taskId,status:'completed',text:'协议样例文案'}:{workId:'123456',title:'协议样例详情'};
   return new Response(JSON.stringify({code:2000,data}));
  }
  if(u.startsWith('http://127.0.0.1:'))return original(url,init);
  throw Error('TEST_EXTERNAL_NETWORK_BLOCKED');
 };require(${JSON.stringify(entryPath)});`);
 const actions=[{action:"detail",workId:"123456"},{action:"transcriptSubmit",url:`https://www.douyin.com/video/12345${sequence}`},{action:"transcriptResult",taskId:"fixture-task"}];
 const server=createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk.toString();requests.push(JSON.parse(body));const action=actions[requests.length-1];const delta=action?{tool_calls:[{index:0,id:`rf-${requests.length}`,type:"function",function:{name:"redfox_query",arguments:JSON.stringify(action)}}]}:{content:"已读取详情并获取原任务文案"};
 const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:action?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(c=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:modelName,...c})}\n\n`).join("")+"data: [DONE]\n\n");});await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const host=createChatWorkerDispatcher(db,{now,budget,entryPath:wrapper,workerId:"redfox-configured",modelConcurrency:1,resolveTools:f.resolveTools,resolveRedfoxCredential:ctx=>credentials.resolve(ctx),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:modelName,token:"fixture-model-token"})});
 try{await host.drainOnce();const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.submitted.executionTaskId));expect(task?.status).toBe("succeeded");expect(requests).toHaveLength(4);const apiCalls=readFileSync(callsFile,'utf8').trim().split('\n').map(x=>JSON.parse(x));expect(apiCalls).toHaveLength(3);expect(apiCalls.every(x=>x.authorized)).toBe(true);expect(apiCalls[2].body).toEqual({taskId:"fixture-task"});const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,f.submitted.executionTaskId));expect(JSON.stringify(calls)).not.toContain(key);expect(JSON.stringify(requests)).not.toContain(key);expect(calls.filter(x=>x.kind==="tool")).toHaveLength(3);}
 finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
},20000);
