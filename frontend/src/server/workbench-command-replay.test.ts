// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {createDb,aiTasks,type Db} from "@creatoros/backend";
import {chatWorkerInputSchema,workerToolResultReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {chatInputDigest} from "../../../backend/src/modules/ai/chat-turn-submission.service";
import {createPersistentTaskService} from "../../../backend/src/modules/execution/persistent-task.service";
import {createExecutionLeaseService} from "../../../backend/src/modules/execution/execution-lease.service";
import {createExecutionCallLedgerService} from "../../../backend/src/modules/execution/execution-call-ledger.service";
import {createExecutionChatToolPorts} from "../../../backend/src/modules/execution/execution-chat-tool-ports.service";
import {createChatWorkbenchCapabilityHost} from "../../../backend/src/modules/ai-runtime/chat-workbench-capability-host";
import {defineWorkbenchChatTool} from "../../../backend/src/modules/ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../../../backend/src/modules/ai-runtime/chat-tool-definitions";
import {createNativeFilesWorkbenchHost} from "./workbench-native-host";
import {NativeFileError,type NativeCommandAction,type NativeFileAction} from "./workbench-native-client";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());
const budget={maxCalls:100,maxTokens:10000,deadlineMs:60000};
const runInput={argv:["verify.js"],cwd:".",runtimeId:"bundled-node",timeoutMs:10000};
type Proposal={name:string;input:Record<string,unknown>};

// 真 PGlite 任务/租约/模型与工具账本 → 正式能力装配 → 正式 native host；仅系统 I/O 使用隔离内存端口。
async function fixture(){
 const id=randomUUID(),ctx={userId:`u-${id}`,accountId:`a-${id}`,requestId:id,source:"user" as const};
 const state={version:1,content:"v1",writes:0,failAfterLaunch:false,beforeReply:async()=>{}};
 const processes=new Map<string,{operationId:string;state:string;stdout:string}>();
 const filePort=vi.fn(async(_ref:ExecutionRef,_id:string,action:NativeFileAction)=>{
  if(action.kind!=="write")throw Error("unexpected file operation");
  if(action.expectedVersion!==state.version)throw new NativeFileError("VERSION_CONFLICT",false,state.version);
  state.version++;state.writes++;state.content=Buffer.from(action.contentBase64,"base64").toString("utf8");
  return {version:state.version};
 });
 const commandPort=vi.fn(async(_ref:ExecutionRef,operationId:string,action:NativeCommandAction)=>{
  if(action.kind==="command_run"){
   expect(processes.has(operationId)).toBe(false);
   const process={operationId,state:"running",stdout:state.content};processes.set(operationId,process);
   await state.beforeReply();
   if(state.failAfterLaunch)throw new NativeFileError("NATIVE_RESULT_UNKNOWN",true);
   return {operationId,state:process.state,stdoutRef:`command:${operationId}:stdout`,stderrRef:`command:${operationId}:stderr`,exitCode:null};
  }
  const process=processes.get(action.targetOperationId);
  if(!process)throw new NativeFileError("INVALID_COMMAND",false);
  if(action.kind==="command_read")return {contentBase64:Buffer.from(process.stdout).toString("base64"),more:false,nextOffset:process.stdout.length};
  return {operationId:process.operationId,state:process.state,exitCode:process.state==="running"?null:0};
 });
 const host=createNativeFilesWorkbenchHost(db,{platform:"darwin",desktop:true,socketPath:"isolated-command-test.sock",filePort,commandPort})!;
 const prepared=await prepareChatToolDefinitions(Object.fromEntries(host.catalog.map(descriptor=>[
  descriptor.name,defineWorkbenchChatTool(descriptor,async()=>{throw Error("must use host");}),
 ])),{workbenchCapabilities:host.catalog});
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",operationKey:id,capability:"copilot.assist",userId:ctx.userId,accountId:ctx.accountId,conversationId:id,sourceMessageId:id,system:"测试命令",messages:[{role:"user",content:"修脚本后重新运行"}],maxSteps:12,maxOutputTokens:128,tools:prepared.definitions,workbenchCapabilities:host.catalog,workbenchPlatform:host.platform});
 const tasks=createPersistentTaskService(db),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:{modelInputDigest:chatInputDigest(input)}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const leases=createExecutionLeaseService(db),ledger=createExecutionCallLedgerService(db,{budget});
 const resolveTools=createChatWorkbenchCapabilityHost(host,ref=>leases.withLease(ref,"admission",async({task,context})=>({userId:context.userId,accountId:context.accountId!,taskId:task.id,attempt:task.attempt,fenceToken:task.fenceToken!,leaseId:task.leaseOwner!})),async()=>{});
 const tools=await resolveTools(ctx,input,ref,new AbortController().signal),newPorts=()=>createExecutionChatToolPorts(db,{budget,tools}),ports=newPorts();
 async function round(proposals:Proposal[]){
  const key=randomUUID(),model=await ledger.reserve(ref,{kind:"model",operationKey:key,inputDigest:`sha256:${"a".repeat(64)}`,reservedTokens:1});
  await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:1},providerResult:{content:proposals.map((p,i)=>({type:"tool-call",toolCallId:`${key}-${i}`,toolName:p.name.replaceAll(".","_"),input:JSON.stringify(p.input)})),finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]}});
  const calls=[];
  for(let i=0;i<proposals.length;i++){
   const request={modelCallId:model.id,toolCallId:`${key}-${i}`},reserved=await ports.reserve(ref,request);
   await ports.start(ref,{callId:reserved.callId});calls.push({callId:reserved.callId,request});
  }
  return calls;
 }
 const execute=(call:{callId:string})=>ports.execute(ref,{callId:call.callId});
 const receipt=async(callId:string)=>workerToolResultReceiptSchema.parse(JSON.parse((await ledger.inspect(ref)).calls.find(c=>c.id===callId)!.resultText!));
 return {state,processes,commandPort,round,execute,receipt,newPorts,ref,ledger};
}

it("run→edit→同参新run绑定新进程；新ID可status/read，同operation重放及其他mutation防重放保留",async()=>{
 const f=await fixture(),[first]=await f.round([{name:"execution.run",input:runInput}]);
 const original=await f.execute(first!);
 const edit={name:"files.edit",input:{path:"verify.js",expectedVersion:1,content:"v2"}};
 const [write]=await f.round([edit]);const written=await f.execute(write!);
 const [second]=await f.round([{name:"execution.run",input:runInput}]);
 expect(await f.execute(second!)).toMatchObject({data:{workbench:{operationId:second!.callId}}});
 expect(f.processes.size).toBe(2);expect(f.processes.get(second!.callId)?.stdout).toBe("v2");
 expect((await f.receipt(second!.callId)).reusedCallId).toBeUndefined();
 f.processes.get(second!.callId)!.state="exited";
 const reads=await f.round([{name:"execution.status",input:{targetOperationId:second!.callId}},{name:"execution.read",input:{targetOperationId:second!.callId,stream:"stdout"}}]);
 expect(await f.execute(reads[0]!)).toMatchObject({status:"ok",summary:expect.stringContaining('"state":"exited"')});
 expect(await f.execute(reads[1]!)).toMatchObject({status:"ok",summary:expect.stringContaining('"text":"v2"')});
 const restarted=f.newPorts();
 expect(await restarted.reserve(f.ref,first!.request)).toMatchObject({callId:first!.callId,status:"settled"});
 expect(await restarted.execute(f.ref,{callId:first!.callId})).toEqual(original);
 expect(f.processes.size).toBe(2);
 const [duplicate]=await f.round([edit]);expect(await f.execute(duplicate!)).toEqual(written);
 expect(f.state.writes).toBe(1);expect((await f.receipt(duplicate!.callId)).reusedCallId).toBe(write!.callId);
 // 无新文件写入也允许明确的新命令操作，不靠文件名/脚本内容猜执行语义。
 const [third]=await f.round([{name:"execution.run",input:runInput}]);
 expect(await f.execute(third!)).toMatchObject({data:{workbench:{operationId:third!.callId}}});
 expect(f.processes.size).toBe(3);
});

it("同模型批次run→edit→run仍分别执行",async()=>{
 const f=await fixture(),[first,edit,last]=await f.round([{name:"execution.run",input:runInput},{name:"files.edit",input:{path:"verify.js",expectedVersion:1,content:"same-round-v2"}},{name:"execution.run",input:runInput}]);
 await f.execute(first!);await f.execute(edit!);
 expect(await f.execute(last!)).toMatchObject({data:{workbench:{operationId:last!.callId}}});
 expect([...f.processes.values()].map(p=>p.stdout)).toEqual(["v1","same-round-v2"]);
});

it("前序未结算先等待；已确认启动后新operation独立执行，同call并发只启动一次",async()=>{
 const f=await fixture();let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});f.state.beforeReply=()=>held;
 const [first,next]=await f.round([{name:"execution.run",input:runInput},{name:"execution.run",input:runInput}]);
 const firstResult=f.execute(first!);await vi.waitFor(()=>expect(f.processes.size).toBe(1));
 const replay=f.newPorts().execute(f.ref,{callId:first!.callId}),nextResult=f.execute(next!);
 await vi.waitFor(async()=>expect((await f.ledger.inspect(f.ref)).calls.find(c=>c.id===next!.callId)?.toolExecutionClaimId).toBeTruthy());
 expect(f.processes.size).toBe(1);release();
 const [original,replayed,second]=await Promise.all([firstResult,replay,nextResult]);
 expect(replayed).toEqual(original);expect(second).toMatchObject({data:{workbench:{operationId:next!.callId}}});
 expect(f.processes.size).toBe(2);expect((await f.receipt(next!.callId)).reusedCallId).toBeUndefined();
});

it("命令启动后回执未知：同operation及同参新提案均保持unknown guard，不重启进程",async()=>{
 const f=await fixture();f.state.failAfterLaunch=true;
 const [first,next]=await f.round([{name:"execution.run",input:runInput},{name:"execution.run",input:runInput}]);
 await expect(f.execute(first!)).rejects.toThrow("未确认");
 await expect(f.newPorts().execute(f.ref,{callId:first!.callId})).rejects.toThrow();
 await expect(f.execute(next!)).rejects.toThrow("未确认");
 expect(f.processes.size).toBe(1);expect(f.commandPort).toHaveBeenCalledOnce();
 expect((await f.ledger.inspect(f.ref)).calls.filter(c=>c.kind==="tool").map(c=>c.status)).toEqual(["unknown","unknown"]);
});
