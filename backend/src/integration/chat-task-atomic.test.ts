import {createSubmittedTaskPreparationService} from "../modules/execution/submitted-task-preparation.service";
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
async function fixture(second=false,start=true,toolName:"planning.thesis"|"material.generate"|"review.script"|"publish.package"="planning.thesis",mixed=false){
 const childType=toolName==="material.generate"?"asset.generate":toolName==="review.script"?"script.review":toolName==="publish.package"?"publish.platform_adapt":"planning.thesis";
 const modelToolName=toolName.replaceAll(".","_");
 let time=Date.now();const now=()=>new Date(time).toISOString();
 const ctx={userId:"atomic-host",accountId:`account-${++seq}`,requestId:"test",source:"user" as const};
 const ai=createAiService({db,now,nextId:(prefix:string)=>`${prefix}-${++seq}`} as ServiceDeps);
 const conversation=await ai.createConversation(ctx,{title:"原子提交",scope:"global"});
 const source=await ai.createMessage(ctx,conversation.id,{content:"立论点"});
 const parameters=z.object({topic:z.string()}).strict();
 const definition={name:toolName,version:"atomic-test-v1",effect:"committed",execution:"host.task-submit",description:"论点",parameters:z.toJSONSchema(parameters)};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"策略",messages:[{role:"user",content:"立论点"}],maxSteps:6,maxOutputTokens:128,tools:[definition,...(mixed?[{...definition,name:"planning.thesis"}]:[])] as never})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const tasks=createPersistentTaskService(db,{now});const claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:"worker",leaseSeconds:10}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget}),generation=createExecutionGenerationPorts(db,{now,budget});
 const model=await generation.reserveGenerationCall(ref,{operationKey:`chat:${source.id}/model/1`,request:{maxOutputTokens:128}});await ledger.start(ref,model.callId);
 await generation.settleGenerationCall(ref,{callId:model.callId,status:"settled",providerResult:{content:[{type:"tool-call",toolCallId:"submit",toolName:modelToolName,input:'{"topic":"原主题"}'},...(second?[{type:"tool-call",toolCallId:"submit2",toolName:modelToolName,input:'{"topic":"原主题"}'}]:[])],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]},usage:{inputTokens:2,outputTokens:3}});
 const prepare=vi.fn(async(context:typeof ctx,input:any,scope:any)=>({task:await ai.prepareTaskCommit(context,{taskType:childType,attemptId:scope.attemptId,inputData:toolName==="material.generate"?{kind:"image",prompt:input.topic}:{topic:input.topic}}),result:(task:any)=>({status:"ok",summary:"已提交论点任务",data:{kind:toolName==="review.script"?"review.report":toolName,taskId:task.id,projectId:null,error:null},evidence:[],error:null,continuation:null,sideEffect:"committed"})}));
 const wakeTask=vi.fn(async(_context:typeof ctx,_taskId:string)=>{});
 const approve=vi.fn(async()=>({status:"not-applicable" as const}));
 const host=createExecutionChatToolPorts(db,{now,budget,tools:{[toolName]:{...definition,parameters,approve,prepareTask:prepare,wakeTask} as unknown as ChatBackendTool,...(mixed?{"planning.thesis":{...definition,name:"planning.thesis",parameters,approve,prepareTask:async()=>{throw new Error("本用例未调用额外论点工具");},wakeTask} as unknown as ChatBackendTool}:{})}});
 const request={modelCallId:model.callId,toolCallId:"submit"};const call=await host.reserve(ref,request);if(start)await host.start(ref,{callId:call.callId});
 const children=()=>ai.listTasks(ctx,{taskType:childType,limit:100,offset:0});
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

it.each(["planning.thesis","material.generate","review.script","publish.package"] as const)("%s 准备瞬断的次数和退避持久保存，重建补偿服务不重置，最多三次",async toolName=>{
 const f=await fixture(false,true,toolName,toolName==="material.generate"),result=await f.host.execute(f.ref,{callId:f.call.callId}),id=(result.data as any).taskId;
 const child=await f.ai.getTask(f.ctx,id);let time=Date.parse(child.requestedAt);
 const prepare=vi.fn(async()=>{throw Object.assign(new Error("private temporary text"),{statusCode:503,responseHeaders:{"retry-after":"2"}});});
 const fail=vi.fn(f.ai.markFailed),options={deadlineMs:60000,now:()=>time,random:()=>0,prepare,fail};
 let recovery=createSubmittedTaskPreparationService(db,options);
 await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(1);await recovery.stop();
 recovery=createSubmittedTaskPreparationService(db,options);
 await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(1);
 time+=2000;await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(2);
 time+=2000;await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(3);
 expect((await f.ai.getTask(f.ctx,id)).status).toBe("failed");
 await recovery.prepare(f.ctx,id);expect(prepare).toHaveBeenCalledTimes(3);
 const [raw]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));
 expect((raw!.runtimeData as any).hostTaskPreparation).toMatchObject({attempts:3,errorCode:"http_503",deadlineAt:new Date(Date.parse(child.requestedAt)+60000).toISOString()});
 expect(JSON.stringify(raw!.runtimeData)).not.toContain("private temporary text");await recovery.stop();
});
it.each(["planning.thesis","material.generate"].flatMap(toolName=>["account","origin","receipt","attempt","type"].map(variant=>({toolName:toolName as "planning.thesis"|"material.generate",variant}))))("$toolName 补偿必须核对真实父提交，不能用 $variant 冒充可派发任务",async({toolName,variant})=>{
 const f=await fixture(false,true,toolName,toolName==="material.generate"),result=await f.host.execute(f.ref,{callId:f.call.callId}),id=(result.data as any).taskId;
 const prepare=vi.fn(async()=>{}),recovery=createSubmittedTaskPreparationService(db,{deadlineMs:60000,prepare,fail:f.ai.markFailed});
 if(variant==="origin"){const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));await db.update(aiTasks).set({runtimeData:{...(task!.runtimeData as any),hostTaskSubmission:{...(task!.runtimeData as any).hostTaskSubmission,inputDigest:"changed"}}}).where(eq(aiTasks.id,id));}
 if(variant==="receipt"){const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.callId));const receipt=JSON.parse(call!.resultText!);receipt.output.data.taskId="other";await db.update(executionCalls).set({resultText:JSON.stringify(receipt)}).where(eq(executionCalls.id,f.call.callId));}
 if(variant==="type")await db.update(aiTasks).set({taskType:toolName==="material.generate"?"planning.thesis":"asset.generate"}).where(eq(aiTasks.id,id));
 if(variant==="attempt")await db.update(aiTasks).set({attemptId:"other-attempt-id"}).where(eq(aiTasks.id,id));
 await expect(recovery.prepare(variant==="account"?{...f.ctx,accountId:"other"}:f.ctx,id)).rejects.toThrow();expect(prepare).not.toHaveBeenCalled();await recovery.stop();
});
it("子任务原期限耗尽时不再准备，也不重设 requestedAt",async()=>{
 const f=await fixture(),result=await f.host.execute(f.ref,{callId:f.call.callId}),id=(result.data as any).taskId,child=await f.ai.getTask(f.ctx,id);
 const prepare=vi.fn(async()=>{}),recovery=createSubmittedTaskPreparationService(db,{deadlineMs:1000,now:()=>Date.parse(child.requestedAt)+1001,prepare,fail:f.ai.markFailed});
 await recovery.prepare(f.ctx,id);expect(prepare).not.toHaveBeenCalled();expect(await f.ai.getTask(f.ctx,id)).toMatchObject({status:"failed",requestedAt:child.requestedAt});await recovery.stop();
});
it("停止等待在途准备收口，停止后不再重领；并发回读共用同一准备",async()=>{
 const f=await fixture(),result=await f.host.execute(f.ref,{callId:f.call.callId}),id=(result.data as any).taskId;
 let release!:()=>void,observed:AbortSignal|undefined;const prepare=vi.fn(async(_ctx:any,_id:string,signal:AbortSignal)=>{observed=signal;await new Promise<void>(r=>{release=r;});signal.throwIfAborted();});
 const recovery=createSubmittedTaskPreparationService(db,{deadlineMs:60000,prepare,fail:f.ai.markFailed});
 const pending=recovery.prepare(f.ctx,id);const rejected=expect(pending).rejects.toThrow();await vi.waitFor(()=>expect(release).toBeDefined());
 expect(recovery.prepare({...f.ctx,requestId:"another"},id)).toBe(pending);
 let stopped=false;const stop=recovery.stop().then(()=>{stopped=true;});await Promise.resolve();expect(observed!.aborted).toBe(true);expect(stopped).toBe(false);
 release();await rejected;await stop;expect(stopped).toBe(true);
 await expect(recovery.prepare(f.ctx,id)).rejects.toThrow();expect(prepare).toHaveBeenCalledTimes(1);
});

it.each(["stop","continuous"])("实际纯准备挂起后 %s 保留原取消权，迟到读取不能再创建执行映射",async reason=>{
 const {createStructuredBusinessExecutionService}=await import("../modules/ai-runtime/structured-business-execution.service");
 const f=await fixture(),result=await f.host.execute(f.ref,{callId:f.call.callId}),id=(result.data as any).taskId;
 const [child]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));
 await db.update(aiTasks).set({runtimeData:{...(child!.runtimeData as any),skillSnapshot:{snapshotVersion:1,userId:f.ctx.userId,accountId:f.ctx.accountId,resolvedAt:new Date().toISOString(),platformPolicyVersion:"1",platformPolicy:"test",skills:[{skillId:"planning.thesis",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"test",template:"test",tools:[],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}}}).where(eq(aiTasks.id,id));
 let release!:()=>void;const prepare=vi.fn(async()=>{await new Promise<void>(r=>{release=r;});return {};});
 const business=createStructuredBusinessExecutionService(db,{budget,maxOutputTokens:128,adapters:{"planning.thesis":{skillId:"planning.thesis",capability:"planning.thesis",prepare,project:()=>{throw new Error("unused");}}}});
 await business.recoverQueued(async()=>{});expect(prepare).not.toHaveBeenCalled();
 const recovery=createSubmittedTaskPreparationService(db,{deadlineMs:120000,prepare:(c,id,signal)=>business.prepare(c,id,signal),fail:f.ai.markFailed});
 let preparationError:unknown;const work=recovery.prepare(f.ctx,id).catch(error=>{preparationError=error;});let stopped=false;
 try{await vi.waitFor(()=>expect(release,String(preparationError)).toBeDefined());const stop=(reason==="stop"?recovery.stop():(async()=>{await new Promise(resolve=>setTimeout(resolve,1500));expect(stopped).toBe(false);return recovery.stop();})()).then(()=>{stopped=true;});await vi.waitFor(()=>expect(stopped).toBe(true),{timeout:2500});release();await stop;await work;await Promise.resolve();const [current]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));expect(current!.executionTaskId).toBeNull();expect(current!.status).toBe("queued");}
 finally{release?.();await work;await recovery.stop();}
});

it.each((["material.generate","publish.package"] as const).flatMap(toolName=>["ack","rollback","recover","duplicate","cancel"].map(scenario=>({toolName,scenario}))))("$toolName 原子提交：$scenario 不遗留孤立任务或重复提交",async ({toolName,scenario})=>{
 const f=await fixture(scenario==="duplicate",scenario!=="ack",toolName,scenario==="recover");
 if(scenario==="rollback"){
  const original=f.prepare.getMockImplementation()!;f.prepare.mockImplementation(async(...args)=>({...await original(...args),result:()=>{throw new Error("receipt failure");}}));
  await expect(f.host.execute(f.ref,{callId:f.call.callId})).rejects.toThrow();expect((await f.children()).rows).toHaveLength(0);
  f.prepare.mockImplementation(original);
 }
 if(scenario==="ack"){
  let attempts=0;
  const output=await runDurableAgenticTool(f.request,{signal:new AbortController().signal,call:async(port,raw)=>{
   if(port==="reserveAgenticTool")return f.host.reserve(f.ref,raw);
   if(port==="startAgenticTool")return f.host.start(f.ref,raw);
   if(port==="settleAgenticTool")return f.host.settle(f.ref,raw);
   throw new Error("unexpected port");
  },execute:async()=>{attempts++;await f.host.execute(f.ref,{callId:f.call.callId});throw new Error("ACK lost after material commit");}});
  expect(output).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:toolName}});expect(attempts).toBe(1);
 }else if(scenario==="recover"){
  f.advance();await f.tasks.recoverExpiredLeases();
  const next=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"replacement"});expect(next).toBeTruthy();
  await expect(f.host.execute(f.ref,{callId:f.call.callId})).rejects.toThrow();
  const ref={executionTaskId:f.ref.executionTaskId,attempt:next!.lease.attempt,fenceToken:next!.lease.fenceToken};
  expect((await f.host.reserve(ref,f.request)).status).toBe("reserved");await f.host.start(ref,{callId:f.call.callId});
  const output=await f.host.execute(ref,{callId:f.call.callId});expect(output).toMatchObject({data:{kind:toolName},sideEffect:"committed"});
 }else if(scenario==="cancel"){
  const original=f.prepare.getMockImplementation()!;let release!:()=>void;
  f.prepare.mockImplementation(async(...args)=>{await new Promise<void>(r=>{release=r;});return original(...args);});
  const work=f.host.execute(f.ref,{callId:f.call.callId});const failed=expect(work).rejects.toThrow();await vi.waitFor(()=>expect(release).toBeDefined());
  await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"stop-material"});release();await failed;
  expect((await f.children()).rows).toHaveLength(0);return;
 }else{
  const first=f.host.execute(f.ref,{callId:f.call.callId});
  if(scenario==="duplicate"){
   const second=await f.host.reserve(f.ref,{...f.request,toolCallId:"submit2"});await f.host.start(f.ref,{callId:second.callId});
   expect(await f.host.execute(f.ref,{callId:second.callId})).toEqual(await first);
  }else{
   const committed=await first;
   expect(await f.host.execute(f.ref,{callId:f.call.callId})).toEqual(committed);
  }
 }
 const children=(await f.children()).rows;expect(children).toHaveLength(1);expect(children[0]).toMatchObject(toolName==="material.generate"?{taskType:"asset.generate",inputData:{kind:"image",prompt:"原主题"}}:{taskType:"publish.platform_adapt",inputData:{topic:"原主题"}});
 const [parent]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.callId));expect(parent!.status).toBe("settled");
 expect(JSON.parse(parent!.resultText!).output.data.taskId).toBe(children[0]!.id);
});

it("素材提交不能偷换子任务类型，错误映射在同一事务中回滚",async()=>{
 const f=await fixture(false,true,"material.generate");
 f.prepare.mockImplementation(async(context,input,scope)=>({task:await f.ai.prepareTaskCommit(context,{taskType:"planning.thesis",attemptId:scope.attemptId,inputData:{topic:input.topic}}),result:(task:any)=>({status:"ok",summary:"错误类型",data:{kind:"material.generate",taskId:task.id,projectId:null,error:null},evidence:[],error:null,continuation:null,sideEffect:"committed"})}));
 await expect(f.host.execute(f.ref,{callId:f.call.callId})).rejects.toThrow("子任务与原工具");
 expect((await f.ai.listTasks(f.ctx,{taskType:"planning.thesis",limit:100,offset:0})).rows).toHaveLength(0);
 expect((await f.children()).rows).toHaveLength(0);
});

 it("素材原子提交后重建恢复服务，扫描原任务并交给真实素材准备",async()=>{
 const {createAssetBusinessExecutionService}=await import("../modules/ai-runtime/asset-business-execution.service");
 const f=await fixture(false,true,"material.generate",true),result=await f.host.execute(f.ref,{callId:f.call.callId}),id=(result.data as any).taskId;
 const child=await f.ai.getTask(f.ctx,id);
 const business=createAssetBusinessExecutionService(db,{budget,assertProject:async()=>{},resolveSpec:async()=>({kind:"image",provider:"openai",model:"gpt-image-1",token:"private-test-key",baseUrl:"http://localhost"})});
 const prepare=vi.fn((c:any,taskId:string,signal:AbortSignal)=>business.prepare(c,taskId,signal));
 const recovery=createSubmittedTaskPreparationService(db,{deadlineMs:60000,prepare,fail:f.ai.markFailed});
 try{
  let mapped:typeof aiTasks.$inferSelect|undefined;
  for(let scan=0;scan<20;scan++){await recovery.recover(new AbortController().signal);[mapped]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));if(mapped?.executionTaskId)break;}
  expect(mapped!.executionTaskId).toBeTruthy();expect(mapped!.requestedAt).toBe(child.requestedAt);
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({userId:f.ctx.userId,accountId:f.ctx.accountId}),id,expect.any(AbortSignal));
  expect((await f.children()).rows).toHaveLength(1);
  const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapped!.executionTaskId!));
  expect(execution!.payload).toMatchObject({modelInput:{kind:"asset.generate",prompt:"原主题",mediaKind:"image"}});
  expect(JSON.stringify(execution!.payload)).not.toContain("private-test-key");
  await recovery.prepare(f.ctx,id);expect(prepare.mock.calls.filter(call=>call[1]===id)).toHaveLength(1);
 }finally{await recovery.stop();business.stop();}
 });

it("审核任务成功回执丢失后重读同一提交，重复模型调用只绑定一个子任务",async()=>{
 const f=await fixture(true,true,"review.script"),first=await f.host.execute(f.ref,{callId:f.call.callId});
 expect(first).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:"review.report"}});
 expect(await f.host.execute(f.ref,{callId:f.call.callId})).toEqual(first);
 const second=await f.host.reserve(f.ref,{modelCallId:f.request.modelCallId,toolCallId:"submit2"});
 await f.host.start(f.ref,{callId:second.callId});
 expect(await f.host.execute(f.ref,{callId:second.callId})).toEqual(first);
 expect((await f.children()).rows).toHaveLength(1);expect(f.prepare).toHaveBeenCalledTimes(1);
});
it("已确认未提交的审核前置失败保留原卡片，无子任务或唤醒",async()=>{
 const {ChatTaskPreparationFailure}=await import("../modules/execution/execution-chat-task-submission.service");
 const f=await fixture(false,true,"review.script");
 f.prepare.mockRejectedValue(new ChatTaskPreparationFailure({status:"error",summary:"请先保存整稿",evidence:[],data:{kind:"review.report",taskId:null,projectId:null,error:"请先保存整稿"},error:{code:"no_evidence",retryable:false,recovery:"请先保存整稿"},continuation:null,sideEffect:"none"}));
 expect(await f.host.execute(f.ref,{callId:f.call.callId})).toMatchObject({status:"error",sideEffect:"none",data:{kind:"review.report",taskId:null,error:"请先保存整稿"}});
 expect((await f.children()).rows).toHaveLength(0);expect(f.wakeTask).not.toHaveBeenCalled();
});
