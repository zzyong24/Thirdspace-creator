import {afterAll, beforeAll, expect, it} from "vitest";
import {randomUUID} from "node:crypto";
import {createDb, aiTasks, executionTasks, executionCalls, eq, type Db} from "@creatoros/backend";
import {chatWorkerInputSchema} from "@creatoros/contract/execution-worker";
import {chatInputDigest} from "../ai/chat-turn-submission.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionChatToolPorts} from "../execution/execution-chat-tool-ports.service";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createWorkbenchPlanService} from "../execution/workbench-plan.service";
import {createChatWorkbenchPlanToolHost} from "./chat-workbench-plan-tool-host";
import {chatWorkbenchPlanCapability} from "./chat-workbench-plan-tool";
import {defineWorkbenchChatTool} from "./chat-tool-gate";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";

let db:Db, close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());

it("计划工具使用冻结版本与原租约，模型不能凭文本伪造完成",async()=>{
  const owner={userId:"plan-host-user",accountId:"plan-host-account",requestId:"test",source:"user" as const};
  const tasks=createPersistentTaskService(db);
  const task=await tasks.enqueue(owner,{kind:"ai_task",ownerType:"ai_task",ownerId:"plan-host",idempotencyKey:"plan-host",payload:{modelInput:{kind:"chat.run"}}});
  const claim=await tasks.claimTask({taskId:task.id,workerId:"plan-host"});
  if(!claim)throw new Error("claim missing");
  const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
  const prepared=await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]});
  const input={tools:prepared.definitions} as never;
  const host=createChatWorkbenchPlanToolHost(db);
  const result=await host(owner,input,ref,new AbortController().signal);
  const tool=result["plan.update"]!;
  const step={stepId:"read",title:"读取资料",dependsOn:[],status:"pending",operationRefs:[],artifactRefs:[]};
  const scope={execution:ref,aiTaskId:"plan-host",callId:"plan-call",toolCallId:"tc",signal:new AbortController().signal};
  expect(await tool.execute!(owner,{expectedRevision:0,steps:[step]},scope)).toMatchObject({status:"ok",sideEffect:"committed"});
  expect(await createWorkbenchPlanService(db).read(owner,task.id)).toMatchObject({planRevision:1,steps:[step]});
  expect(await tool.execute!(owner,{expectedRevision:1,steps:[{...step,status:"succeeded",operationRefs:["invented"]}]},scope)).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input"}});
  await expect(host(owner,{tools:[{...prepared.definitions[0],version:"wrong"}]} as never,ref,new AbortController().signal)).rejects.toThrow();
  await tasks.command(owner,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});
  await expect(tool.execute!(owner,{expectedRevision:1,steps:[step]},scope)).rejects.toThrow();
});

const planStep={stepId:"read",title:"读取资料",dependsOn:[],status:"pending",operationRefs:[],artifactRefs:[]};
async function publicFixture(steps:unknown[]){
  const id=randomUUID(),owner={userId:id,accountId:id,requestId:id,source:"user" as const};
  const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
  const prepared=await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]});
  const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",recoverMissingFinal:true,operationKey:"turn",capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,system:"计划",messages:[{role:"user",content:"建立计划"}],maxSteps:4,maxOutputTokens:128,tools:prepared.definitions});
  const tasks=createPersistentTaskService(db),task=await tasks.enqueue(owner,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
  await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:{modelInputDigest:chatInputDigest(input)}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const tools=await createChatWorkbenchPlanToolHost(db)(owner,input,ref,new AbortController().signal);
  const budget={maxCalls:10,maxTokens:10000,deadlineMs:60000},ledger=createExecutionCallLedgerService(db,{budget});
  const model=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});
  await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:[{type:"tool-call",toolCallId:"plan",toolName:"plan_update",input:JSON.stringify({expectedRevision:0,steps})}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
  const ports=createExecutionChatToolPorts(db,{budget,tools});
  const reserved=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"plan"});await ports.start(ref,{callId:reserved.callId});
  return {owner,task,ref,ports,tools,ledger,callId:reserved.callId,input,budget};
}

it.each([
  ["伪造 operationRefs",[{...planStep,status:"succeeded",operationRefs:["invented"]}]],
  ["成功步骤没有回执",[{...planStep,status:"succeeded"}]],
  ["缺失依赖触发 Zod",[{...planStep,dependsOn:["missing"]}]],
] as const)("公共聊天 host 的%s返回 invalid_input，计划零写入且原调用正常结算",async(_name,steps)=>{
  const f=await publicFixture([...steps]);
  const result=await f.ports.execute(f.ref,{callId:f.callId});
  expect(result).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input"}});
  expect(result.error?.recovery).toBeTruthy();
  expect(await createWorkbenchPlanService(db).read(f.owner,f.task.id)).toBeNull();
  const call=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.callId)!;
  expect(call.status).toBe("settled");expect(JSON.parse(call.resultText!).output).toEqual(result);
  expect(await f.ports.execute(f.ref,{callId:f.callId})).toEqual(result);
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
});

it.each([new Error("数据库连接中断"),Object.assign(new Error("网络响应丢失"),{name:"ConflictError"})])("底层异常 %s 仍为 unknown，不能伪装零副作用校验失败",async error=>{
  const f=await publicFixture([planStep]);
  const unavailable=new Proxy(db,{get(target,key,receiver){if(key==="select")return ()=>{throw error;};return Reflect.get(target,key,receiver);}});
  const tools=await createChatWorkbenchPlanToolHost(unavailable)(f.owner,f.input,f.ref,new AbortController().signal);
  const ports=createExecutionChatToolPorts(db,{budget:f.budget,tools});
  await expect(ports.execute(f.ref,{callId:f.callId})).rejects.toThrow("未确认");
  const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.callId));
  expect(call).toMatchObject({status:"unknown",resultText:null});
  expect(await createWorkbenchPlanService(db).read(f.owner,f.task.id)).toBeNull();
});

it("事务已保存后取消不能返回 sideEffect none，原计划和未知回执均保留",async()=>{
  const f=await publicFixture([planStep]),controller=new AbortController();
  const cancelAfterCommit=new Proxy(db,{get(target,key,receiver){
    if(key==="transaction")return async(...args:Parameters<Db["transaction"]>)=>{
      const result=await target.transaction(...args);controller.abort(new Error("保存后取消"));return result;
    };
    return Reflect.get(target,key,receiver);
  }});
  const tools=await createChatWorkbenchPlanToolHost(cancelAfterCommit)(f.owner,f.input,f.ref,controller.signal);
  const ports=createExecutionChatToolPorts(db,{budget:f.budget,tools});
  await expect(ports.execute(f.ref,{callId:f.callId},controller.signal)).rejects.toThrow("未确认");
  expect(await createWorkbenchPlanService(db).read(f.owner,f.task.id)).toMatchObject({planRevision:1,steps:[planStep]});
  const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.callId));
  expect(call).toMatchObject({status:"unknown",resultText:null});
});
