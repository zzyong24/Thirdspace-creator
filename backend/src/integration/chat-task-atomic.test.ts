import {runDurableAgenticTool} from "../../../ai-worker/src/execution/durable-agentic-tool";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {z} from "zod";
import {createDb,aiTasks,executionCalls,executionTasks,eq,type Db} from "@creatoros/backend";
import {createAiService,type ServiceDeps} from "../modules/ai/ai.service";
import {createChatTurnSubmissionService} from "../modules/ai/chat-turn-submission.service";
import {createPersistentTaskService} from "../modules/execution/persistent-task.service";
import {createExecutionGenerationPorts} from "../modules/execution/execution-generation-ports.service";
import {createExecutionCallLedgerService} from "../modules/execution/execution-call-ledger.service";
import {createExecutionChatToolPorts,type ChatBackendTool} from "../modules/execution/execution-chat-tool-ports.service";
let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close());
const budget={maxCalls:6,maxTokens:100000,deadlineMs:60000};
async function fixture(second=false,start=true){
 let time=Date.now();const now=()=>new Date(time).toISOString();
 const ctx={userId:"atomic-host",accountId:`account-${++seq}`,requestId:"test",source:"user" as const};
 const ai=createAiService({db,now,nextId:(prefix:string)=>`${prefix}-${++seq}`} as ServiceDeps);
 const conversation=await ai.createConversation(ctx,{title:"原子提交",scope:"global"});
 const source=await ai.createMessage(ctx,conversation.id,{content:"立论点"});
 const parameters=z.object({topic:z.string()}).strict();
 const definition={name:"planning.thesis",version:"atomic-test-v1",effect:"committed",execution:"host.task-submit",description:"论点",parameters:z.toJSONSchema(parameters)};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"策略",messages:[{role:"user",content:"立论点"}],maxSteps:6,maxOutputTokens:128,tools:[definition] as never})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const tasks=createPersistentTaskService(db,{now});const claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:"worker",leaseSeconds:10}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget});
 const model=await generation.reserveGenerationCall(ref,{operationKey:`chat:${source.id}/model/1`,request:{maxOutputTokens:128}});await ledger.start(ref,model.callId);
 await generation.settleGenerationCall(ref,{callId:model.callId,status:"settled",providerResult:{content:[{type:"tool-call",toolCallId:"submit",toolName:"planning_thesis",input:'{"topic":"原主题"}'},...(second?[{type:"tool-call",toolCallId:"submit2",toolName:"planning_thesis",input:'{"topic":"原主题"}'}]:[])],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]},usage:{inputTokens:2,outputTokens:3}});
 const prepare=vi.fn(async(context:typeof ctx,input:any,scope:any)=>({task:await ai.prepareTaskCommit(context,{taskType:"planning.thesis",attemptId:scope.attemptId,inputData:{topic:input.topic}}),result:(task:any)=>({status:"ok",summary:"已提交论点任务",data:{kind:"planning.thesis",taskId:task.id,projectId:null,error:null},evidence:[],error:null,continuation:null,sideEffect:"committed"})}));
 const wakeTask=vi.fn(async(_context:typeof ctx,_taskId:string)=>{});
 const approve=vi.fn(async()=>({status:"not-applicable" as const}));
 const host=createExecutionChatToolPorts(db,{now,budget,tools:{"planning.thesis":{...definition,parameters,approve,prepareTask:prepare,wakeTask} as unknown as ChatBackendTool}});
 const request={modelCallId:model.callId,toolCallId:"submit"};const call=await host.reserve(ref,request);if(start)await host.start(ref,{callId:call.callId});
 const children=()=>ai.listTasks(ctx,{taskType:"planning.thesis",limit:100,offset:0});
 return {ctx,ai,wakeTask,host,ref,call,request,prepare,approve,children,ledger,tasks,advance:()=>{time+=31000;}};
}
it("实际宿主原子提交子任务与父回执，ACK丢失后回放不再创建",async()=>{
 const f=await fixture();
 let saved:any;await expect((async()=>{saved=await f.host.execute(f.ref,{callId:f.call.callId});throw new Error("ACK lost");})()).rejects.toThrow("ACK lost");
 const replay=await f.host.execute(f.ref,{callId:f.call.callId});expect(replay).toEqual(saved);expect(f.prepare).toHaveBeenCalledTimes(1);
 expect((await f.children()).rows).toHaveLength(1);expect((await f.host.reserve(f.ref,f.request)).status).toBe("settled");
 const [parent]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.callId));expect(parent).toMatchObject({status:"settled",totalTokens:0});
 const [child]=await db.select().from(aiTasks).where(eq(aiTasks.id,saved.data.taskId));expect(child!.runtimeData).toMatchObject({hostTaskSubmission:{executionTaskId:f.ref.executionTaskId,callId:f.call.callId,inputDigest:parent!.inputDigest}});
});
it("准备期间取消，迟到准备不创建子任务",async()=>{
 const f=await fixture(),original=f.prepare.getMockImplementation()!;let release!:()=>void;
 f.prepare.mockImplementation(async(...args)=>{await new Promise<void>(r=>{release=r;});return original(...args);});
 const pending=f.host.execute(f.ref,{callId:f.call.callId});await vi.waitFor(()=>expect(release).toBeDefined());
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cancel-original"});release();await expect(pending).rejects.toThrow();
 expect((await f.children()).rows).toHaveLength(0);
});
it("父回执生成失败回滚子任务，不留下孤立已提交任务",async()=>{
 const f=await fixture(),original=f.prepare.getMockImplementation()!;
 f.prepare.mockImplementation(async(...args)=>{const value=await original(...args);return {...value,result:()=>{throw new Error("receipt failed");}};});
 await expect(f.host.execute(f.ref,{callId:f.call.callId})).rejects.toThrow();expect((await f.children()).rows).toHaveLength(0);
});
it("提交前过期只恢复纯事务声明，旧凭证不能提交",async()=>{
 const f=await fixture();f.advance();await f.tasks.recoverExpiredLeases();
 const next=(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"new-worker"}))!;expect(next).toBeTruthy();
 const ref={executionTaskId:f.ref.executionTaskId,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken};
 await expect(f.host.execute(f.ref,{callId:f.call.callId})).rejects.toThrow();
 const restored=await f.host.reserve(ref,f.request);expect(restored.status).toBe("reserved");await f.host.start(ref,{callId:f.call.callId});
 await f.host.execute(ref,{callId:f.call.callId});expect((await f.children()).rows).toHaveLength(1);
});
it.each(["unknown","claimed","usage","digest","legacy"])("不能把未证明的宿主状态当纯事务重放：%s",async variant=>{
 const f=await fixture();
 if(variant==="legacy"){
  const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  const payload=structuredClone(row!.payload) as any;payload.modelInput.tools[0].execution="host";
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
 }else{
  const patch=variant==="unknown"?{status:"unknown"}:variant==="claimed"?{toolExecutionClaimId:"old-host-claim"}:variant==="usage"?{usage:{totalTokens:1},totalTokens:1}:{inputDigest:`sha256:${"f".repeat(64)}`};
  await db.update(executionCalls).set(patch).where(eq(executionCalls.id,f.call.callId));
 }
 f.advance();await f.tasks.recoverExpiredLeases();
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect(row!.status).toBe("unknown_result");
 expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"new-worker"})).toBeNull();
 expect((await f.children()).rows).toHaveLength(0);
});
it("Worker不能伪造事务提交回执或把未提交事实结算为未知",async()=>{
 const f=await fixture();
 await expect(f.host.settle(f.ref,{callId:f.call.callId,status:"unknown"})).rejects.toThrow("宿主原子");
 await expect(f.host.settle(f.ref,{callId:f.call.callId,status:"settled",output:{status:"ok",summary:"伪造",data:{kind:"planning.thesis",taskId:"fake"},evidence:[],error:null,continuation:null,sideEffect:"committed"}})).rejects.toThrow();
 expect((await f.children()).rows).toHaveLength(0);
});
it("准备后权限被撤销，不能创建子任务",async()=>{
 const f=await fixture(),original=f.prepare.getMockImplementation()!;
 f.prepare.mockImplementation(async(...args)=>{const result=await original(...args);f.approve.mockResolvedValue({status:"denied",reason:"用户拒绝"} as never);return result;});
 expect(await f.host.execute(f.ref,{callId:f.call.callId})).toMatchObject({status:"blocked",sideEffect:"none",error:{code:"permission"}});expect((await f.children()).rows).toHaveLength(0);
});
it("保留 Worker 真实拒绝回执路径，拒绝不创建子任务",async()=>{
 const f=await fixture();f.approve.mockResolvedValue({status:"denied",reason:"用户拒绝"} as never);
 const output={status:"blocked",summary:"用户未允许本次操作",evidence:[],data:{denied:true},error:{code:"permission",retryable:false,recovery:"用户已拒绝，本次不执行。"},continuation:null,sideEffect:"none"};
 expect((await f.host.settle(f.ref,{callId:f.call.callId,status:"settled",output})).status).toBe("settled");
 expect((await f.children()).rows).toHaveLength(0);expect(f.prepare).not.toHaveBeenCalled();
});
it("同一模型回合并发重复工具调用共享原任务回执",async()=>{
 const f=await fixture(true);const second=await f.host.reserve(f.ref,{...f.request,toolCallId:"submit2"});await f.host.start(f.ref,{callId:second.callId});
 const [first,again]=await Promise.all([f.host.execute(f.ref,{callId:f.call.callId}),f.host.execute(f.ref,{callId:second.callId})]);
 expect(again).toEqual(first);expect((await f.children()).rows).toHaveLength(1);
 const [row]=await db.select().from(executionCalls).where(eq(executionCalls.id,second.callId));expect(JSON.parse(row!.resultText!)).toMatchObject({reusedCallId:f.call.callId});
});
it("真实 Worker 工具函数在提交 ACK 丢失后回读已确认回执继续执行",async()=>{
 const f=await fixture(false,false),signal=new AbortController().signal;let attempts=0;
 const result=await runDurableAgenticTool(f.request,{signal,call:async(port,raw)=>{
  if(port==="reserveAgenticTool")return f.host.reserve(f.ref,raw);
  if(port==="startAgenticTool")return f.host.start(f.ref,raw);
  if(port==="settleAgenticTool")return f.host.settle(f.ref,raw);
  throw new Error("unexpected port");
 },execute:async()=>{attempts++;await f.host.execute(f.ref,{callId:f.call.callId});throw new Error("ACK lost after commit");}});
 expect(result).toMatchObject({status:"ok",sideEffect:"committed"});expect(attempts).toBe(1);expect((await f.children()).rows).toHaveLength(1);
});
it("纯准备阶段的瞬时读取失败返回无副作用错误，不伪装未知提交",async()=>{
 const f=await fixture();f.prepare.mockRejectedValue(Object.assign(new Error("private endpoint detail"),{statusCode:503}));
 const output=await f.host.execute(f.ref,{callId:f.call.callId});
 expect(output).toMatchObject({status:"error",sideEffect:"none",error:{code:"transient",retryable:true}});
 expect(JSON.stringify(output)).not.toContain("private endpoint detail");expect((await f.children()).rows).toHaveLength(0);
 expect((await f.host.reserve(f.ref,f.request)).status).toBe("settled");
});

it("真实原子回执才唤醒同一个子任务，回读可补偿唤醒失败且不重提",async()=>{
 const f=await fixture();f.wakeTask.mockRejectedValueOnce(new Error("wake temporarily unavailable"));
 const result=await f.host.execute(f.ref,{callId:f.call.callId});
 expect(result).toMatchObject({status:"ok",sideEffect:"committed"});
 expect(f.wakeTask).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId:f.ctx.userId,accountId:f.ctx.accountId,source:"ai"}),(result.data as any).taskId);
 expect((await f.host.reserve(f.ref,f.request)).status).toBe("settled");
 expect(f.wakeTask).toHaveBeenLastCalledWith(expect.objectContaining({userId:f.ctx.userId,accountId:f.ctx.accountId,source:"ai"}),(result.data as any).taskId);
 expect(f.wakeTask).toHaveBeenCalledTimes(2);expect(f.prepare).toHaveBeenCalledTimes(1);expect((await f.children()).rows).toHaveLength(1);
});
