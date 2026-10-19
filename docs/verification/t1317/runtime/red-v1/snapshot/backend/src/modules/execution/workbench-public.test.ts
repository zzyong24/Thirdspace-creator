import {it,expect,vi} from "vitest";
import {createDb,executionCalls,OwnershipError} from "@creatoros/backend";
import {ENDPOINTS} from "@creatoros/contract";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchPublicService} from "./workbench-public.service";
import {createExecutionTransport} from "./execution.transport";
import type {ExecutionService} from "./execution.service";
import {createWorkbenchPublicTransport} from "./workbench-public.transport";
import {agenticToolOperationKey} from "./agentic-tool-binding";

const ctx={userId:"public-user",accountId:"public-account",requestId:"public-test",source:"user" as const};
it("安装版公共任务读侧可读取持久任务，并保持旧执行任务错误语义",async()=>{
 const {db,client}=await createDb();
 try{
  const persistent=createPersistentTaskService(db);
  const task=await persistent.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"test",idempotencyKey:"public",payload:{secret:"never expose"}});
  const legacy={get:vi.fn(async()=>{throw new OwnershipError("missing");})} as unknown as ExecutionService;
  const transport=createExecutionTransport(()=>legacy,()=>persistent);
  const input={params:{taskId:task.id},query:undefined,body:undefined};
  expect((await transport.request(ENDPOINTS.getExecutionTask,input,ctx) as {data:unknown}).data).toMatchObject({id:task.id,status:"queued"});
  await expect(transport.request(ENDPOINTS.getExecutionTask,input,{...ctx,accountId:"foreign"})).rejects.toThrow();
  legacy.get=vi.fn(async()=>{throw new Error("database unavailable");});
  await expect(transport.request(ENDPOINTS.getExecutionTask,input,ctx)).rejects.toThrow("database unavailable");
 }finally{await client.close();}
});

it("账本按序分页、限制大回执且不输出供应商配置/模型正文/租约",async()=>{
 const {db,client}=await createDb();
 try{
  const persistent=createPersistentTaskService(db),service=createWorkbenchPublicService(db);
  const task=await persistent.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"ledger",idempotencyKey:"ledger",payload:{secret:"secret-payload"}});
  const stamp=new Date().toISOString();
  await db.insert(executionCalls).values([1,2,3].map(sequence=>({id:`public-call-${sequence}`,executionTaskId:task.id,sequence,operationKey:`call-${sequence}`,kind:sequence===2?"model":"tool",inputDigest:"a".repeat(64),status:"settled",reservedTokens:0,resultText:sequence===2?"secret-model":"a".repeat(20000),providerResult:{secret:"secret-provider"},createdAt:stamp,updatedAt:stamp})));
  const first=await service.inspect(ctx,task.id,{afterSequence:0,limit:2});
  expect(first.calls.map(c=>c.sequence)).toEqual([1,2]);expect(first.hasMore).toBe(true);
  expect(first.calls[0]).toMatchObject({resultTruncated:true,resultText:"a".repeat(16000)});
  expect(first.calls[1]?.resultText).toBe(null);
  expect(JSON.stringify(first)).not.toContain("secret-");expect(JSON.stringify(first)).not.toContain("fenceToken");
  const next=await service.inspect(ctx,task.id,{afterSequence:first.nextSequence,limit:2});expect(next.calls.map(c=>c.sequence)).toEqual([3]);expect(next.hasMore).toBe(false);
  await expect(service.inspect({...ctx,accountId:"foreign"},task.id,{afterSequence:0,limit:1})).rejects.toThrow();
 }finally{await client.close();}
});

it("未知工具调用仍可读取冻结工具名和有界参数，模型正文不会进入公开投影",async()=>{
 const {db,client}=await createDb();
 try{
  const service=createWorkbenchPublicService(db),tasks=createPersistentTaskService(db);
  const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"unknown",idempotencyKey:"unknown",payload:{}});
  const stamp=new Date().toISOString(),input=JSON.stringify({expectedRevision:0,steps:[],extra:"a".repeat(17000)});
  await db.insert(executionCalls).values([
   {id:"unknown-model",executionTaskId:task.id,sequence:1,operationKey:"model-1",kind:"model",inputDigest:"a".repeat(64),status:"settled",reservedTokens:0,providerResult:{content:[{type:"text",text:"secret-model"},{type:"tool-call",toolCallId:"proposed",toolName:"plan_update",input}]},createdAt:stamp,updatedAt:stamp},
   {id:"unknown-tool",executionTaskId:task.id,sequence:2,operationKey:agenticToolOperationKey("unknown-model","proposed"),kind:"tool",inputDigest:"b".repeat(64),status:"unknown",reservedTokens:0,createdAt:stamp,updatedAt:stamp},
  ]);
  const result=await service.inspect(ctx,task.id,{afterSequence:0,limit:100});
  expect(result.calls[1]).toMatchObject({toolName:"plan_update",status:"unknown",inputText:input.slice(0,16000),inputTruncated:true});
  expect(JSON.stringify(result)).not.toContain("secret-model");
 }finally{await client.close();}
});

it("对账唤醒只回收指定的原任务",async()=>{
 const {db,client}=await createDb();
 try{
  let time="2026-09-21T00:00:00.000Z";
  const service=createPersistentTaskService(db,{now:()=>time});
  const a=await service.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"a",idempotencyKey:"a",payload:{}});
  const b=await service.enqueue({...ctx,accountId:"foreign"},{kind:"ai_task",ownerType:"ai_task",ownerId:"b",idempotencyKey:"b",payload:{}});
  await service.claimTask({taskId:a.id,workerId:"w"});await service.claimTask({taskId:b.id,workerId:"w"});
  time="2026-09-21T01:00:00.000Z";
  await service.recoverExpiredLeases({taskId:a.id,includeSafeUnknownResults:true});
  expect((await service.get(ctx,a.id)).status).toBe("queued");
  expect((await service.get({...ctx,accountId:"foreign"},b.id)).status).toBe("running");
 }finally{await client.close();}
});


it("异常模型提案经正式 transport 保留诊断，分页仍能找到前页来源而不夹带历史大参数",async()=>{
 const {db,client}=await createDb();
 try{
  const service=createWorkbenchPublicService(db),tasks=createPersistentTaskService(db);
  const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"malformed",idempotencyKey:"malformed",payload:{}});
  const stamp=new Date().toISOString();
  await db.insert(executionCalls).values([
   {id:"malformed-model",executionTaskId:task.id,sequence:1,operationKey:"model-malformed",kind:"model",inputDigest:"a".repeat(64),status:"settled",reservedTokens:0,providerResult:{content:[{type:"tool-call",toolCallId:"broken",input:"{}"},{type:"tool-call",toolName:"files_write",toolCallId:42,input:{bad:true}},{type:"tool-call",toolName:"plan_update",toolCallId:"valid",input:"{}"}]},createdAt:stamp,updatedAt:stamp},
   {id:"malformed-tool",executionTaskId:task.id,sequence:2,operationKey:agenticToolOperationKey("malformed-model","valid"),kind:"tool",inputDigest:"b".repeat(64),status:"unknown",reservedTokens:0,createdAt:stamp,updatedAt:stamp},
   {id:"old-large-model",executionTaskId:task.id,sequence:3,operationKey:"model-large",kind:"model",inputDigest:"c".repeat(64),status:"settled",reservedTokens:0,providerResult:{content:[{type:"tool-call",toolName:"files_write",toolCallId:"large",input:"not-current-page".repeat(10000)}]},createdAt:stamp,updatedAt:stamp},
  ]);
  const transport=createWorkbenchPublicTransport({tasks:service,stream:{read:vi.fn()},artifacts:{} as Parameters<typeof createWorkbenchPublicTransport>[0]["artifacts"],capabilities:vi.fn(),render:vi.fn(),reconcile:vi.fn()});
  const first=await transport.request(ENDPOINTS.inspectWorkbenchTask,{params:{taskId:task.id},query:{afterSequence:0,limit:1},body:undefined},ctx);
  const data=ENDPOINTS.inspectWorkbenchTask.response.parse((first as {data:unknown}).data);
  expect(data.calls[0]!.proposedTools).toEqual([
   {toolCallId:"broken",toolName:null,inputText:"{}",inputTruncated:false,invalid:true},
   {toolCallId:null,toolName:"files_write",inputText:'{"bad": true}',inputTruncated:false,invalid:true},
   {toolCallId:"valid",toolName:"plan_update",inputText:"{}",inputTruncated:false,invalid:false},
  ]);
  const next=await service.inspect(ctx,task.id,{afterSequence:1,limit:1});
  expect(next.calls[0]).toMatchObject({id:"malformed-tool",toolName:"plan_update",inputText:"{}",proposedTools:[]});
  expect(JSON.stringify(next)).not.toContain("not-current-page");
 }finally{await client.close();}
});
