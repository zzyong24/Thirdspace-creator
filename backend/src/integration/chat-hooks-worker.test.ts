import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {z} from "zod";
import {createDb,executionTasks,executionCalls,aiMessages,eq,type Db} from "@creatoros/backend";
import {createAiRepository} from "../modules/ai/ai.repository";
import type {ChatHostContext} from "../modules/ai/chat-host-context";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
import {createExecutionStreamService} from "../modules/execution/execution-stream.service";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
let db:Db,close:()=>Promise<void>,seq=0;
const entryPath=resolve("../ai-worker/dist/execution-worker.cjs");
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
afterAll(async()=>close());
it.each(["success","cancel"])("同一真实Worker内部开场生成：%s",async(mode)=>{
 const ctx={userId:"hooks-worker-u",accountId:`hooks-worker-a-${++seq}`,requestId:"test",source:"user" as const},now=()=>new Date().toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-${++seq}`});
 const conversation=await repo.createConversation({title:"开场",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"生成开场",attachments:[],modelMetadata:{}});
 const parameters=z.object({topic:z.string().optional()}).strict();
 const hostContext:ChatHostContext={schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],scriptHooksContext:{selectionTitle:"真实主题",positioningBrief:"原定位",projectBriefHard:"",userMaterialHardBrief:"",userMaterialRefBrief:"",knowledgeBrief:""},scriptHooksGeneration:{version:1,maxOutputTokens:2048},skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"策略",template:"",tools:["script.hooks"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"生成开场候选",messages:[{role:"user",content:"生成开场"}],maxSteps:6,maxOutputTokens:128,tools:[{name:"script.hooks",version:"hooks-worker-v1",effect:"proposal",execution:"worker.script-hooks",description:"生成开场",parameters:z.record(z.string(),z.json()).parse(z.toJSONSchema(parameters))}],hostContext})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const requests:Record<string,unknown>[]=[];
 let childOpened=false;
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();const input=JSON.parse(body);requests.push(input);
  if(!input.stream){childOpened=true;res.writeHead(200,{"content-type":"application/json"});if(mode==="cancel"){res.write('{"id":');return;}res.end(JSON.stringify({id:"child",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,message:{role:"assistant",content:'[{"text":"真实开场","angle":"场景"}]'},finish_reason:"stop"}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}}));return;}
  const first=requests.length===1;
  const delta=first?{tool_calls:[{index:0,id:"hooks",type:"function",function:{name:"script_hooks",arguments:"{}"}}]}:{content:"候选已准备好"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"root",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const host=createChatWorkerDispatcher(db,{entryPath,workerId:"hooks-host",budget:{maxCalls:10,maxTokens:100000,deadlineMs:60000},modelConcurrency:1,tools:{"script.hooks":{version:"hooks-worker-v1",effect:"proposal",execution:"worker.script-hooks",parameters,approve:async()=>({status:"not-applicable"})}},resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
 try{
  const draining=host.drainOnce();
  if(mode==="cancel"){
   await vi.waitFor(()=>expect(childOpened).toBe(true));
   await createPersistentTaskService(db).command(ctx,{taskIds:[submission.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
  }
  await draining;
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
  if(mode==="cancel"){
   expect(task?.status).toBe("cancelled");expect(requests).toHaveLength(2);
   const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
   expect(calls.find(call=>call.parentCallId)).toMatchObject({status:"unknown",totalTokens:null});return;
  }
  expect(task?.status).toBe("succeeded");expect(requests).toHaveLength(3);
  expect(JSON.stringify(requests[1]?.messages)).toContain("真实主题");
  expect(JSON.stringify(requests[2]?.messages)).toContain("真实开场");
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  expect(calls.filter(call=>call.kind==="model")).toHaveLength(3);
  expect(calls.filter(call=>call.parentCallId)).toHaveLength(1);
  expect(calls.reduce((sum,call)=>sum+(call.totalTokens??0),0)).toBe(17);
  const messages=await db.select().from(aiMessages).where(eq(aiMessages.conversationId,conversation.id));
  expect(JSON.stringify(messages.find(message=>message.role==="assistant")?.parts)).toContain("真实开场");
  const page=await createExecutionStreamService(db).read(ctx,submission.executionTaskId,{});
  expect(page.events.filter(event=>event.chunk.type==="text-delta").map(event=>event.chunk.delta).join("")).toBe("候选已准备好");
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},15000);
