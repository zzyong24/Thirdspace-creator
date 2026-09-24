import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {afterAll,beforeAll,expect,it} from "vitest";
import {z} from "zod";
import {workbenchFileRequestSchema,workbenchResultSchema,type WorkbenchCapability} from "@creatoros/contract/agent-workbench";
import {createDb,executionCalls,executionTasks,eq,type Db} from "@creatoros/backend";
import {createAiRepository} from "../modules/ai/ai.repository";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createChatWorkerDispatcher} from "../modules/execution/model-worker-dispatcher";
import {createWorkbenchPlanService} from "../modules/execution/workbench-plan.service";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
import {createChatWorkbenchPlanToolHost} from "../modules/ai-runtime/chat-workbench-plan-tool-host";
import {chatWorkbenchPlanCapability} from "../modules/ai-runtime/chat-workbench-plan-tool";
import {defineWorkbenchChatTool} from "../modules/ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../modules/ai-runtime/chat-tool-definitions";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
afterAll(async()=>close?.());

it("真实 Worker 遇到非法产物引用和伪造计划回执后收到 invalid_input，自动纠错完成原任务",async()=>{
 const ctx={userId:"plan-repair-user",accountId:"plan-repair-account",requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-plan-repair`});
 const conversation=await repo.createConversation({title:"计划纠错",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"创建并核验计划",attachments:[],modelMetadata:{}});
 const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
 const [definition]=(await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]})).definitions;
 const submission=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"根据工具错误修正参数，保留原任务。",messages:[{role:"user",content:"创建并核验计划"}],maxSteps:8,maxOutputTokens:256,tools:[definition!]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const step={stepId:"plan",title:"建立计划",dependsOn:[],status:"pending",operationRefs:[],artifactRefs:[]};
 let requests=0;const bodies:string[]=[],plansBeforeRepair:unknown[]=[];
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{void(async()=>{
  requests++;bodies.push(body);
  if(requests===2||requests===3)plansBeforeRepair.push(await createWorkbenchPlanService(db).read(ctx,submission.executionTaskId));
  if(requests>5)throw new Error("计划纠错不应重复调用");
  let args:Record<string,unknown>|null={expectedRevision:0,steps:[step]};
  if(requests===1)args={expectedRevision:0,steps:[{...step,artifactRefs:[null]}]};
  if(requests===2)args={expectedRevision:0,steps:[{...step,status:"succeeded",operationRefs:["invented"]}]};
  if(requests===4){
   const ref=[...body.matchAll(/原工具调用 ID: ([^；\]]+)/g)].at(-1)?.[1];
   if(!ref)throw new Error("纠错后的真实计划调用回执缺失");
   args={expectedRevision:1,steps:[{...step,status:"succeeded",operationRefs:[ref]}]};
  }
  if(requests===5)args=null;
  const delta=args?{tool_calls:[{index:0,id:`repair-${requests}`,type:"function",function:{name:"plan_update",arguments:JSON.stringify(args)}}]}:{content:"已按真实回执修正并完成计划。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:args?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 })().catch(error=>{res.writeHead(500);res.end(String(error));});});});
 await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
 const host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"plan-repair",budget:{maxCalls:12,maxTokens:100000,deadlineMs:60000},pollMs:100,modelConcurrency:1,resolveTools:createChatWorkbenchPlanToolHost(db),resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
 try{
  host.start();
  await expect.poll(async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)))[0]?.status,{timeout:15000}).toBe("succeeded");
  expect(requests).toBe(5);expect(plansBeforeRepair).toEqual([null,null]);
  expect(bodies[1]).toContain("invalid_input");expect(bodies[2]).toContain("invalid_input");
  const calls=(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId))).sort((a,b)=>a.sequence-b.sequence);
  const tools=calls.filter(call=>call.kind==="tool");expect(tools).toHaveLength(4);expect(calls.every(call=>call.status==="settled")).toBe(true);
  for(const call of tools.slice(0,2))expect(JSON.parse(call.resultText!).output).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input"}});
  expect(await createWorkbenchPlanService(db).read(ctx,submission.executionTaskId)).toMatchObject({planRevision:2,steps:[{status:"succeeded",operationRefs:[tools[2]!.id]}]});
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
},30000);

it("真实子进程连续规划、读取与凭回执完成原任务",async()=>{
 const ctx={userId:"plan-e2e-user",accountId:"plan-e2e-account",requestId:"test",source:"user" as const};
 const now=()=>new Date().toISOString();
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:prefix=>`${prefix}-plan-e2e`});
 const conversation=await repo.createConversation({title:"计划 E2E",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"读取资料并完成计划",attachments:[],modelMetadata:{}});
 const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
 const [planDefinition]=(await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]})).definitions;
 const submission=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"先规划，再读取，最后凭真实 operationRef 完成计划",messages:[{role:"user",content:"读取资料并完成计划"}],maxSteps:8,maxOutputTokens:256,tools:[planDefinition!,{name:"source.read",version:"1",effect:"none",description:"读取资料",parameters:{type:"object",properties:{},additionalProperties:false}}]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 let requestCount=0;const bodies:string[]=[];
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
  bodies.push(body);requestCount++;
  let toolName:string|null=null,args:Record<string,unknown>={};
  if(requestCount===1){toolName="plan_update";args={expectedRevision:0,steps:[{stepId:"read",title:"读取资料",dependsOn:[],status:"pending",operationRefs:[],artifactRefs:[]}]};}
  if(requestCount===2)toolName="source_read";
  if(requestCount===3){
   const ref=body.match(/原工具调用 ID: ([^；\]]+)/g)?.at(-1)?.match(/ID: ([^；\]]+)/)?.[1];
   if(!ref){res.writeHead(500);res.end("missing operation ref");return;}
   toolName="plan_update";args={expectedRevision:1,steps:[{stepId:"read",title:"读取资料",dependsOn:[],status:"succeeded",operationRefs:[ref],artifactRefs:[]}]};
  }
  const delta=toolName?{tool_calls:[{index:0,id:`call-${requestCount}`,type:"function",function:{name:toolName,arguments:JSON.stringify(args)}}]}:{content:"资料已读取，计划已核验。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:toolName?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const planHost=createChatWorkbenchPlanToolHost(db);
 const host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"plan-e2e",budget:{maxCalls:15,maxTokens:100000,deadlineMs:60000},pollMs:100,modelConcurrency:1,
  resolveTools:async(c,input,ref,signal)=>({...await planHost(c,input,ref,signal),"source.read":{version:"1",effect:"none" as const,parameters:z.object({}).strict(),approve:async()=>({status:"not-applicable" as const}),execute:async()=>({status:"ok" as const,summary:"真实资料",data:{kind:"source",text:"证据"},evidence:[],error:null,continuation:null,sideEffect:"none" as const})}}),
  resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"}),
 });
 try{
  host.start();
  await expect.poll(async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)))[0]?.status,{timeout:15000}).toBe("succeeded");
  expect(requestCount).toBe(4);
  const plan=await createWorkbenchPlanService(db).read(ctx,submission.executionTaskId);
  expect(plan?.steps[0]).toMatchObject({status:"succeeded"});
  const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  expect(rows.find(row=>row.id===plan!.steps[0]!.operationRefs[0])).toMatchObject({kind:"tool",status:"settled"});
  expect(bodies[2]).toContain("原工具调用 ID:");
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);

it("真实子进程连续调用两次文件写入协议后，凭两条已结算回执完成原计划和原任务",async()=>{
 const ctx={userId:"plan-files-user",accountId:"plan-files-account",requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-plan-files`});
 const conversation=await repo.createConversation({title:"文件写入协议",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"连续调用两次文件写入能力并核对调用回执",attachments:[],modelMetadata:{}});
 const fileCapability:WorkbenchCapability={
  name:"files.write",schemaVersion:1,description:"写入任务文件的协议夹具；本测试不连接文件宿主。",
  inputSchema:{type:"object",additionalProperties:false,properties:{operation:{type:"string",enum:["write"]},path:{type:"string"},content:{type:"string"}},required:["operation","path","content"]},
  resultSchema:{type:"object"},effects:["task_write"],requiredCapabilities:["workbench.files"],platforms:["macos","windows","linux"],
 };
 const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
 const filePrototype=defineWorkbenchChatTool(fileCapability,async()=>{throw new Error("unused");});
 const definitions=(await prepareChatToolDefinitions({"plan.update":prototype,"files.write":filePrototype},{workbenchCapabilities:[chatWorkbenchPlanCapability,fileCapability]})).definitions;
 const submission=await createChatTurnSubmissionService(db,{assemble:async()=>({
  capability:"copilot.assist",system:"先建立计划，依次调用两次 files.write，最后只凭两次原工具调用 ID 完成计划。",
  messages:[{role:"user",content:"连续调用两次文件写入能力并核对调用回执"}],maxSteps:10,maxOutputTokens:256,tools:definitions,
 })}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 let requestCount=0;
 const bodies:string[]=[];
 const writes:Array<{path:string;content:string;callId:string}>=[];
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
  bodies.push(body);requestCount++;
  if(requestCount>5){res.writeHead(500);res.end("FIXTURE_UNBOUNDED_LOOP");return;}
  let toolName:string|null=null,args:Record<string,unknown>={};
  if(requestCount===1){toolName="plan_update";args={expectedRevision:0,steps:[
   {stepId:"first",title:"调用第一项文件写入能力",dependsOn:[],status:"pending",operationRefs:[],artifactRefs:[]},
   {stepId:"second",title:"调用第二项文件写入能力",dependsOn:["first"],status:"pending",operationRefs:[],artifactRefs:[]},
  ]};}
  if(requestCount===2){toolName="files_write";args={operation:"write",path:"notes/first.md",content:"第一份协议内容"};}
  if(requestCount===3){toolName="files_write";args={operation:"write",path:"notes/second.md",content:"第二份协议内容"};}
  if(requestCount===4){
   const refs=[...body.matchAll(/原工具调用 ID: ([^；\]]+)/g)].map(match=>match[1]).filter(ref=>writes.some(write=>write.callId===ref));
   if(refs.length!==2 || refs[0]===refs[1]){res.writeHead(500);res.end("missing distinct file call refs");return;}
   toolName="plan_update";args={expectedRevision:1,steps:[
    {stepId:"first",title:"调用第一项文件写入能力",dependsOn:[],status:"succeeded",operationRefs:[refs[0]],artifactRefs:[]},
    {stepId:"second",title:"调用第二项文件写入能力",dependsOn:["first"],status:"succeeded",operationRefs:[refs[1]],artifactRefs:[]},
   ]};
  }
  const delta=toolName?{tool_calls:[{index:0,id:`file-call-${requestCount}`,type:"function",function:{name:toolName,arguments:JSON.stringify(args)}}]}:{content:"两次文件能力的协议回执已核对；未验证文件落盘。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:toolName?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const planHost=createChatWorkbenchPlanToolHost(db);
 const host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"plan-files",budget:{maxCalls:15,maxTokens:100000,deadlineMs:60000},pollMs:100,modelConcurrency:1,
  resolveTools:async(c,input,ref,signal)=>({...await planHost(c,input,ref,signal),"files.write":{
   version:definitions.find(item=>item.name==="files.write")!.version,effect:"committed" as const,
   parameters:z.object({operation:z.literal("write"),path:z.string(),content:z.string()}).strict(),approve:async()=>({status:"not-applicable" as const}),
   execute:async(_ctx,raw,scope)=>{
    const parsed=workbenchFileRequestSchema.parse(raw);
    if(parsed.operation!=="write")throw new Error("预期文件写入请求");
    // 只记录宿主端口接到的调用；不写文件，也不把夹具回执称为落盘证据。
    writes.push({path:parsed.path,content:parsed.content,callId:scope.callId});
    return {status:"ok" as const,summary:"文件能力协议夹具已接收",data:{kind:"workbench.result",result:workbenchResultSchema.parse({status:"succeeded",operationId:scope.callId,content:[{type:"text",text:"仅协议回执；未连接文件宿主"}],artifactRefs:[],progressCursor:null})},evidence:[],error:null,continuation:null,sideEffect:"none" as const};
   },
  }}),
  resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"}),
 });
 try{
  host.start();
  try{await expect.poll(async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)))[0]?.status,{timeout:15000}).toBe("succeeded");}
  catch(error){const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));throw new Error(JSON.stringify({status:task?.status,lastErrorCode:task?.lastErrorCode,lastErrorMessage:task?.lastErrorMessage,requestCount,writes}),{cause:error});}
  expect(requestCount).toBe(5);
  expect(writes).toMatchObject([{path:"notes/first.md",content:"第一份协议内容"},{path:"notes/second.md",content:"第二份协议内容"}]);
  expect(bodies[2]).toContain(writes[0]!.callId);
  expect(bodies[3]).toContain(writes[1]!.callId);
  const plan=await createWorkbenchPlanService(db).read(ctx,submission.executionTaskId);
  expect(plan).toMatchObject({planRevision:2,steps:[{status:"succeeded"},{status:"succeeded"}]});
  const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  for(const [index,step] of plan!.steps.entries()){
   expect(step.operationRefs).toEqual([writes[index]!.callId]);
   expect(rows.find(row=>row.id===step.operationRefs[0])).toMatchObject({kind:"tool",status:"settled"});
  }
  expect(bodies[3]).toContain("原工具调用 ID:");
  expect(rows.filter(row=>row.kind==="tool"&&row.status==="settled")).toHaveLength(4);
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);

it("暂停在途模型流后保留计划与已结算回执，恢复要求对账且不重发",async()=>{
 const ctx={userId:"plan-resume-user",accountId:"plan-resume-account",requestId:"test",source:"user" as const};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-plan-resume`});
 const conversation=await repo.createConversation({title:"计划恢复",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"创建计划并继续",attachments:[],modelMetadata:{}});
 const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
 const [definition]=(await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]})).definitions;
 const submission=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"遵循已有计划",messages:[{role:"user",content:"创建计划并继续"}],maxSteps:6,maxOutputTokens:256,tools:[definition!]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 let requests=0,stoppedStream=false;
 const server=createServer((req,res)=>{let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
  requests++;
  if(requests===2){res.writeHead(200,{"content-type":"text/event-stream"});res.write(": waiting\n\n");res.on("close",()=>{stoppedStream=true;});return;}
  let toolName:string|null=null,args:Record<string,unknown>={};
  if(requests===1){toolName="plan_update";args={expectedRevision:0,steps:[{stepId:"plan",title:"建立计划",dependsOn:[],status:"pending",operationRefs:[],artifactRefs:[]}]};}
  if(requests===3){
   const ref=body.match(/原工具调用 ID: ([^；\]]+)/)?.[1];
   if(!ref){res.writeHead(500);res.end("missing restored receipt");return;}
   toolName="plan_update";args={expectedRevision:1,steps:[{stepId:"plan",title:"建立计划",dependsOn:[],status:"succeeded",operationRefs:[ref],artifactRefs:[]}]};
  }
  const delta=toolName?{tool_calls:[{index:0,id:`resume-call-${requests}`,type:"function",function:{name:toolName,arguments:JSON.stringify(args)}}]}:{content:"原计划已核验。"};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:toolName?"tool_calls":"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{"content-type":"text/event-stream"});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture",...chunk})}\n\n`).join("")+"data: [DONE]\n\n");
 });});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const planHost=createChatWorkbenchPlanToolHost(db);
 const host=createChatWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"plan-resume",budget:{maxCalls:10,maxTokens:100000,deadlineMs:60000},pollMs:100,modelConcurrency:1,resolveTools:planHost,resolveModelCredential:async()=>({apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"fixture",token:"fixture"})});
 const status=async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId)))[0]?.status;
 const tasks=createPersistentTaskService(db);
 try{
  host.start();
  await expect.poll(async()=>({requests,revision:(await createWorkbenchPlanService(db).read(ctx,submission.executionTaskId))?.planRevision}),{timeout:15000}).toMatchObject({requests:2,revision:1});
  await tasks.command(ctx,{taskIds:[submission.executionTaskId],command:"pause",idempotencyKey:"pause-plan"});
  await expect.poll(status,{timeout:15000}).toBe("paused");
  expect(stoppedStream).toBe(true);
  expect((await createWorkbenchPlanService(db).read(ctx,submission.executionTaskId))?.planRevision).toBe(1);
  await tasks.command(ctx,{taskIds:[submission.executionTaskId],command:"resume",idempotencyKey:"resume-plan"});
  await expect.poll(status,{timeout:15000}).toBe("unknown_result");
  const plan=await createWorkbenchPlanService(db).read(ctx,submission.executionTaskId);
  expect(plan).toMatchObject({planRevision:1,steps:[{status:"pending"}]});
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
  expect(task?.lastErrorCode).toBe("CHAT_CHECKPOINT_REQUIRES_RECONCILIATION");
  const rows=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submission.executionTaskId));
  expect(rows.filter(row=>row.kind==="tool"&&row.status==="settled")).toHaveLength(1);
  expect(requests).toBe(2);
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30000);
