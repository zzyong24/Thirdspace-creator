import {afterAll,beforeAll,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {createDb,aiTasks,type Db} from "@creatoros/backend";
import {agenticToolOutcomeSchema,chatWorkerInputSchema,workerToolResultReceiptSchema} from "@creatoros/contract/execution-worker";
import {chatInputDigest} from "../ai/chat-turn-submission.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionChatToolPorts,type ChatBackendTool} from "./execution-chat-tool-ports.service";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());
const budget={maxCalls:100,maxTokens:10000,deadlineMs:60000};
const readNames=["files.read","files.stat","execution.status","execution.read","browser.observe","browser.extract"];
type Proposal={name:string;input?:Record<string,string|number>};

// 真正的租约、聊天冻结输入和模型/工具账本；状态端口隔离在内存中，不操作产品文件或浏览器。
async function fixture(){
 const id=randomUUID(),ctx={userId:`u-${id}`,accountId:`a-${id}`,requestId:id,source:"user" as const};
 const state={version:0,content:"",writes:0,failAfterWrite:false},reads=new Map<string,number>();
 const tools:Record<string,ChatBackendTool>={};
 for(const name of [...readNames,"files.write","files.edit"]){
  const effect=readNames.includes(name)?"none" as const:"committed" as const;
  tools[name]={version:"1",effect,parameters:z.object({path:z.string().optional(),expectedVersion:z.number().int().optional(),content:z.string().optional()}).strict(),
   approve:async()=>({status:"not-applicable"}),
   execute:async(_ctx,raw)=>{
    const input=z.object({expectedVersion:z.number().optional(),content:z.string().optional()}).parse(raw);
    if(effect==="none")reads.set(name,(reads.get(name)??0)+1);
    else{
     if(input.expectedVersion!==undefined&&input.expectedVersion!==state.version)return agenticToolOutcomeSchema.parse({status:"error",summary:"版本冲突",evidence:[],error:{code:"invalid_input",retryable:false,recovery:"重新读取版本"},continuation:null,sideEffect:"none"});
     state.version++;state.writes++;state.content=input.content??state.content;
     if(state.failAfterWrite)throw Error("写入后回执中断");
    }
    return agenticToolOutcomeSchema.parse({status:"ok",summary:"真实端口结果",evidence:[],data:{version:state.version,content:state.content},error:null,continuation:null,sideEffect:effect});
   }};
 }
 const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",operationKey:id,capability:"copilot.assist",userId:ctx.userId,accountId:ctx.accountId,conversationId:id,sourceMessageId:id,system:"观察当前状态",messages:[{role:"user",content:"测试"}],maxSteps:12,maxOutputTokens:128,
  tools:Object.entries(tools).map(([name,tool])=>({name,version:tool.version,effect:tool.effect,description:name,parameters:{type:"object"}}))});
 const tasks=createPersistentTaskService(db),task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:{modelInputDigest:chatInputDigest(input)}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{budget}),newPorts=()=>createExecutionChatToolPorts(db,{budget,tools}),ports=newPorts();
 async function round(proposals:Proposal[]){
  const key=randomUUID(),model=await ledger.reserve(ref,{kind:"model",operationKey:key,inputDigest:`sha256:${"a".repeat(64)}`,reservedTokens:1});
  await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:1},providerResult:{content:proposals.map((p,i)=>({type:"tool-call",toolCallId:`${key}-${i}`,toolName:p.name.replaceAll(".","_"),input:JSON.stringify(p.input??{})})),finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]}});
  const calls=[];
  for(let i=0;i<proposals.length;i++){
   const request={modelCallId:model.id,toolCallId:`${key}-${i}`},reserved=await ports.reserve(ref,request);
   await ports.start(ref,{callId:reserved.callId});calls.push({callId:reserved.callId,request});
  }
  return calls;
 }
 const execute=(call:{callId:string})=>ports.execute(ref,{callId:call.callId});
 const receipt=async(callId:string)=>workerToolResultReceiptSchema.parse(JSON.parse((await ledger.inspect(ref)).calls.find(c=>c.id===callId)!.resultText!));
 return {state,reads,round,ports,newPorts,ref,ledger,execute,receipt};
}

it("write v1→read/stat→edit v2→新 read/stat 返回 v2；同 operation 回放保持旧回执且不重放写入",async()=>{
 const f=await fixture();
 const [write]=await f.round([{name:"files.write",input:{content:"第一版"}}]);await f.execute(write!);
 const old=await f.round([{name:"files.read"},{name:"files.stat"}]);
 const original=await Promise.all(old.map(f.execute));expect(original.map(o=>o.data)).toEqual([{version:1,content:"第一版"},{version:1,content:"第一版"}]);
 const [edit]=await f.round([{name:"files.edit",input:{expectedVersion:1,content:"第二版"}}]);const saved=await f.execute(edit!);
 const fresh=await f.round([{name:"files.read"},{name:"files.stat"}]);
 for(const c of fresh){expect((await f.execute(c)).data).toEqual({version:2,content:"第二版"});expect((await f.receipt(c.callId)).reusedCallId).toBeUndefined();}
 const restarted=f.newPorts();
 for(let i=0;i<old.length;i++)expect(await restarted.execute(f.ref,{callId:old[i]!.callId})).toEqual(original[i]);
 expect(await restarted.reserve(f.ref,edit!.request)).toMatchObject({callId:edit!.callId,status:"settled"});
 expect(await restarted.execute(f.ref,{callId:edit!.callId})).toEqual(saved);
 expect(f.state.writes).toBe(2);expect(f.reads.get("files.read")).toBe(2);expect(f.reads.get("files.stat")).toBe(2);
});

it("同模型批次 read→write→read 也必须重新观察；重复写提案保持原防重放",async()=>{
 const f=await fixture(),[first,write,last,duplicate]=await f.round([{name:"files.read"},{name:"files.write",input:{content:"批次内更新"}},{name:"files.read"},{name:"files.write",input:{content:"批次内更新"}}]);
 expect((await f.execute(first!)).data).toMatchObject({version:0});const saved=await f.execute(write!);
 expect((await f.execute(last!)).data).toEqual({version:1,content:"批次内更新"});
 expect(await f.execute(duplicate!)).toEqual(saved);expect((await f.receipt(duplicate!.callId)).reusedCallId).toBe(write!.callId);
 expect(f.state.writes).toBe(1);expect(f.reads.get("files.read")).toBe(2);
});

it.each(["execution.status","execution.read","browser.observe","browser.extract"])("%s 无本任务写入时，跨模型批次仍读到外界新状态",async name=>{
 const f=await fixture(),[first]=await f.round([{name}]);const old=await f.execute(first!);
 // 独立任务进度/浏览器页面自行变化，不经过本任务写工具。
 f.state.version=9;f.state.content="外界状态已推进";
 const [next]=await f.round([{name}]);expect((await f.execute(next!)).data).toEqual({version:9,content:"外界状态已推进"});
 expect((await f.receipt(next!.callId)).reusedCallId).toBeUndefined();expect(f.reads.get(name)).toBe(2);expect(f.state.writes).toBe(0);
 expect(await f.newPorts().execute(f.ref,{callId:first!.callId})).toEqual(old);expect(f.reads.get(name)).toBe(2);
});

it("写入结果 unknown 后，同 operation 和同参新提案均不能重新执行写入",async()=>{
 const f=await fixture();f.state.failAfterWrite=true;
 const [first,next]=await f.round([{name:"files.write",input:{content:"已写入"}},{name:"files.write",input:{content:"已写入"}}]);
 await expect(f.execute(first!)).rejects.toThrow("未确认");
 await expect(f.newPorts().execute(f.ref,{callId:first!.callId})).rejects.toThrow();
 await expect(f.execute(next!)).rejects.toThrow("未确认");
 expect(f.state.writes).toBe(1);
 expect((await f.ledger.inspect(f.ref)).calls.filter(c=>c.kind==="tool").map(c=>c.status)).toEqual(["unknown","unknown"]);
});
