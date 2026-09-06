import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createDb,executionTasks,executionCalls,assets,eq,type Db} from "@creatoros/backend";
import {createAssetRepository,createAssetsService,createLocalFsObjectStorage} from "../modules/assets";
import {createBrowserSessionsService} from "../modules/browser-sessions";
import {buildChatTools,type ChatToolDeps} from "../modules/ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";
import {createChatTaskToolHost} from "../modules/ai-runtime/chat-task-tool-host";
import type {ContextReaders} from "../modules/ai-runtime/chat-runner";
import {createChatHostContextReader} from "../modules/ai/chat-host-context.service";
import {createAiRepository} from "../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
let db:Db,close:()=>Promise<void>,root:string,sequence=0;
const now=()=>new Date().toISOString(),entryPath=resolve("../ai-worker/dist/execution-worker.cjs"),budget={maxCalls:10,maxTokens:100000,deadlineMs:60000};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();root=await mkdtemp(join(tmpdir(),"t915-web-entry-"));execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
afterAll(async()=>{await close();await rm(root,{recursive:true,force:true});});

it.each(["cache","permission"] as const)("正式构建 Worker 与后端贯通：%s",async mode=>{
 const ctx={userId:"web-entry-user",accountId:`web-entry-${++sequence}`,requestId:"entry-test",source:"user" as const},ids={now,nextId:(prefix:string)=>`${prefix}-${++sequence}`};
 const url=mode==="cache"?"https://example.com/cached-source":"http://127.0.0.1:9/private";
 const repo=createAiRepository(db,{...ctx,...ids});
 const conversation=await repo.createConversation({title:"网页入口",projectId:null,scope:"global"}),message=await repo.createMessage(conversation.id,{role:"user",content:"阅读网页",attachments:[],modelMetadata:{}});
 const tools=(await prepareChatToolDefinitions(buildChatTools(["web.read"],{} as ChatToolDeps),{workerWebRead:true})).definitions;
 const hostContext={schemaVersion:1 as const,chatContext:{surface:"topics",webReadUrl:url},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1 as const,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"fixed",platformPolicyVersion:"1",platformPolicy:"事实",skills:[{skillId:"chatbox.topic",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"事实",template:"",tools:["web.read"],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"按正文回答",messages:[{role:"user" as const,content:"阅读网页"}],tools,maxSteps:4,maxOutputTokens:128,hostContext})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id});
 const storage=createLocalFsObjectStorage({rootPath:root,publicBaseUrl:"/blob"},{nextKey:()=>`entry-key-${++sequence}`}),assetsService=createAssetsService(createAssetRepository(db,ids),async()=>storage,ids);
 if(mode==="cache"){
  const asset=await assetsService.createGeneratedAsset(ctx,{assetType:"document",name:"正文·缓存入口",bytes:new TextEncoder().encode("缓存入口的真实完整正文。".repeat(200)),mimeType:"text/plain",pending:true});
  await assetsService.mergeAiAnnotation(ctx,asset.id,{sourceUrl:url});
 }
 const requests:string[]=[];
 const server=createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk.toString();requests.push(body);
  const first=requests.length===1,delta=first?{tool_calls:[{index:0,id:"read-source",type:"function",function:{name:"web_read",arguments:JSON.stringify({url:"https://ignored.example/model-url",offset:0,maxChars:1000})}}]}:{content:"已依据网页正文回答"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:first?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(c=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...c})}\n\n`).join("")+"data: [DONE]\n\n");
 });await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const resolveSearch=vi.fn(async()=>({provider:"browser",baseUrl:null,model:"",token:""}));
 const host=createChatWorkerDispatcher(db,{now,budget,entryPath,workerId:"web-entry-host",modelConcurrency:1,resolveTools:createChatTaskToolHost(createChatHostContextReader(db,{now}),{} as ContextReaders,{webRead:true}),webRead:{assets:assetsService,objectStorageForCtx:async()=>storage,sessions:createBrowserSessionsService({db,...ids,masterKey:Buffer.alloc(32,7)}),resolveSearch},resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture-private-model-key"})});
 try{
  await host.drainOnce();const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
  expect(task?.status).toBe(mode==="cache"?"succeeded":"waiting_user");expect(requests).toHaveLength(mode==="cache"?2:1);
  const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId)),toolCalls=calls.filter(c=>c.kind==="tool");
  expect(toolCalls).toHaveLength(1);expect(toolCalls[0]?.status).toBe("settled");
  expect(toolCalls[0]?.resultText).toContain(mode==="cache"?'"fromCache":true':'"code":"permission"');
  if(mode==="cache"){expect(requests[1]).toContain("缓存入口的真实完整正文");expect(requests[1]).toContain(url);}
  expect(await db.select().from(assets).where(eq(assets.accountId,ctx.accountId))).toHaveLength(mode==="cache"?1:0);
  expect(resolveSearch).not.toHaveBeenCalled();expect(JSON.stringify({task,calls,requests})).not.toContain("fixture-private-model-key");
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);
