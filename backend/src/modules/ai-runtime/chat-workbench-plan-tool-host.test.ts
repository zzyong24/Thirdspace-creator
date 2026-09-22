import {afterAll, beforeAll, expect, it} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {createDb, aiTasks, executionTasks, executionCalls, eq, type Db} from "@creatoros/backend";
import {chatWorkerInputSchema, type ExecutionRef} from "@creatoros/contract/execution-worker";
import {chatInputDigest} from "../ai/chat-turn-submission.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createExecutionChatToolPorts} from "../execution/execution-chat-tool-ports.service";
import {createWorkbenchArtifactService} from "../execution/workbench-artifact.service";
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

const planStep={stepId:"read",title:"读取资料",dependsOn:[],status:"pending" as const,operationRefs:[],artifactRefs:[]};
async function publicFixture(steps:unknown[]|((ref:ExecutionRef,ledger:ReturnType<typeof createExecutionCallLedgerService>,ports:ReturnType<typeof createExecutionChatToolPorts>)=>Promise<unknown[]>),expectedRevision=0,maxCalls=10){
  const id=randomUUID(),owner={userId:id,accountId:id,requestId:id,source:"user" as const};
  const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
  const prepared=await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]});
  const evidenceDefinitions=typeof steps==="function"?["diagnostic.read","diagnostic.lookup"].map(name=>({name,version:"1",effect:"none",execution:"host",description:"隔离证据工具",parameters:{type:"object",properties:{},additionalProperties:false}})):[];
  const input=chatWorkerInputSchema.parse({kind:"chat.run",executionEngine:"pi",recoverMissingFinal:true,operationKey:"turn",capability:"copilot.assist",userId:id,accountId:id,conversationId:id,sourceMessageId:id,system:"计划",messages:[{role:"user",content:"建立计划"}],maxSteps:4,maxOutputTokens:128,tools:[...prepared.definitions,...evidenceDefinitions]});
  const tasks=createPersistentTaskService(db),task=await tasks.enqueue(owner,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{aiTaskId:id,modelInput:input}});
  await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"copilot.assist",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:new Date().toISOString(),inputData:{modelInputDigest:chatInputDigest(input)}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:id}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const tools=await createChatWorkbenchPlanToolHost(db)(owner,input,ref,new AbortController().signal);
  for(const definition of evidenceDefinitions)tools[definition.name]={version:"1",effect:"none",parameters:z.object({}).strict(),async approve(){return {status:"not-applicable"};},async execute(){
    const success=definition.name==="diagnostic.read";
    return {status:success?"ok":"error",summary:"SECRET_BODY",evidence:[],data:{private:"SECRET_DATA"},error:success?null:{code:"no_evidence",retryable:false,recovery:"SECRET_PROVIDER_TEXT"},continuation:null,sideEffect:"none"};
  }};
  const budget={maxCalls,maxTokens:10000,deadlineMs:60000},ledger=createExecutionCallLedgerService(db,{budget});
  const ports=createExecutionChatToolPorts(db,{budget,tools});
  if(typeof steps==="function")steps=await steps(ref,ledger,ports);
  const model=await ledger.reserve(ref,{kind:"model",operationKey:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});
  await ledger.start(ref,model.id);
  await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:[{type:"tool-call",toolCallId:"plan",toolName:"plan_update",input:JSON.stringify({expectedRevision,steps})}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
  const reserved=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"plan"});await ports.start(ref,{callId:reserved.callId});
  return {owner,task,ref,ports,tools,ledger,callId:reserved.callId,input,budget};
}

it("T1026 失败引用定位精确；保留失败步骤并显式重规划后能保存，旧回执与费用不变",async()=>{
  let failedRef="",goodRef="";
  const plans=createWorkbenchPlanService(db);
  const first={...planStep,stepId:"read"},failed={...planStep,stepId:"lookup"},report={...planStep,stepId:"report",dependsOn:["read","lookup"]};
  const f=await publicFixture(async(ref,ledger,ports)=>{
    for(const success of [true,false]){
      const model=await ledger.reserve(ref,{kind:"model",operationKey:success?"read":"lookup",inputDigest:"sha256:"+(success?"c":"d").repeat(64),reservedTokens:10});
      await ledger.start(ref,model.id);
      await ledger.settle(ref,model.id,{status:"settled",usage:{totalTokens:2},providerResult:{content:[{type:"tool-call",toolCallId:"evidence",toolName:success?"diagnostic_read":"diagnostic_lookup",input:"{}"}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
      const call=await ports.reserve(ref,{modelCallId:model.id,toolCallId:"evidence"});await ports.start(ref,{callId:call.callId});
      expect(await ports.execute(ref,{callId:call.callId})).toMatchObject({status:success?"ok":"error"});
      if(success)goodRef=call.callId;else failedRef=call.callId;
    }
    await plans.save(ref,{expectedRevision:0,steps:[first,failed,report]});
    const completed={...first,status:"succeeded" as const,operationRefs:[goodRef]};
    await plans.save(ref,{expectedRevision:1,steps:[completed,failed,report]});
    return [completed,{...failed,status:"succeeded",operationRefs:[failedRef]},report];
  },2,20);
  const before=await f.ledger.inspect(f.ref),original=await plans.read(f.owner,f.task.id);
  const result=await f.ports.execute(f.ref,{callId:f.callId});
  expect(result).toMatchObject({status:"error",sideEffect:"none",data:{currentRevision:2,validationIssue:{
    code:"operation_not_successful",stepId:"lookup",currentStepStatus:"pending",requestedStatus:"succeeded",operationRef:failedRef,
    ledgerStatus:"settled",receiptStatus:"error",receiptHasError:true,sideEffect:"none",
  },statusRules:{allowedStatuses:["pending","running","waiting_user","succeeded","failed","cancelled","skipped"]}}});
  expect(result.error?.recovery).toContain('"stepId":"lookup"');expect(result.error?.recovery).toContain(failedRef);
  expect(result.error?.recovery).toContain("expectedRevision=2");
  const feedback=result.data as Record<string,unknown>,rules=feedback.statusRules as Record<string,unknown>;
  expect(rules.failedSteps).toEqual(expect.stringContaining("failed"));
  expect(rules.replan).toEqual(expect.stringContaining("dependsOn"));
  expect(rules.replan).toEqual(expect.stringContaining("supersedes"));
  expect(JSON.stringify(result)).not.toContain("SECRET");
  expect(await plans.read(f.owner,f.task.id)).toEqual(original);
  const failedStep={...failed,status:"failed" as const,operationRefs:[failedRef]};
  // 保留失败事实；只有模型显式提交合法新依赖才继续，宿主不替模型修改计划。
  const repaired=[original!.steps[0]!,failedStep,{...report,dependsOn:["read"]}];
  const model=await f.ledger.reserve(f.ref,{kind:"model",operationKey:"replan-model",inputDigest:"sha256:"+"e".repeat(64),reservedTokens:20});
  await f.ledger.start(f.ref,model.id);
  await f.ledger.settle(f.ref,model.id,{status:"settled",usage:{totalTokens:7},providerResult:{content:[{type:"tool-call",toolCallId:"replan",toolName:"plan_update",input:JSON.stringify({expectedRevision:2,steps:repaired})}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:4},outputTokens:{total:3}},warnings:[]}});
  const call=await f.ports.reserve(f.ref,{modelCallId:model.id,toolCallId:"replan"});await f.ports.start(f.ref,{callId:call.callId});
  expect(await f.ports.execute(f.ref,{callId:call.callId})).toMatchObject({status:"ok",sideEffect:"committed"});
  expect(await plans.read(f.owner,f.task.id)).toEqual({planRevision:3,steps:repaired});
  await expect(plans.save(f.ref,{expectedRevision:3,steps:[original!.steps[0]!,{...failedStep,operationRefs:[]},repaired[2]!]})).rejects.toThrow("已有步骤回执不可移除");
  await expect(plans.save(f.ref,{expectedRevision:3,steps:[original!.steps[0]!,failedStep,{...report,status:"succeeded",operationRefs:[goodRef]}]})).rejects.toThrow("前置步骤尚未成功");
  const after=(await f.ledger.inspect(f.ref)).calls;
  for(const prior of before.calls.filter(row=>row.id!==f.callId))expect(after.find(row=>row.id===prior.id)).toEqual(prior);
  expect(after.reduce((sum,row)=>sum+(row.totalTokens??0),0)).toBe(16);
  expect(await f.ports.execute(f.ref,{callId:f.callId})).toEqual(result);
  expect(f.input.tools[0]!.version).toBe("workbench-v1:4d67e4b8da7b9d6ce9fc87a9a7df4a98be435cc0ab30599f3e96cc79430986af");
});

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

const feedbackSchema=z.object({
  currentRevision:z.number(),currentPlan:z.object({planRevision:z.number(),steps:z.array(z.unknown())}).nullable(),
  referenceRules:z.object({operationRefs:z.string(),artifactRefs:z.string(),unexecutedSteps:z.string()}),
  recentSuccessfulOperations:z.array(z.object({operationRef:z.string(),toolName:z.string()})),
  registeredArtifacts:z.array(z.object({artifactRef:z.string(),relativePath:z.string()})),
});

it("计划不存在且模型猜版本时直接返回真实 0/null，按反馈修正即可在原任务首次保存",async()=>{
  const f=await publicFixture([{...planStep,operationRefs:["files_write"]}],3);
  // 安装版原任务冻结版本；新增反馈不得改变定义摘要而阻断原工具调用重放。
  expect(f.input.tools[0]!.version).toBe("workbench-v1:4d67e4b8da7b9d6ce9fc87a9a7df4a98be435cc0ab30599f3e96cc79430986af");
  const result=await f.ports.execute(f.ref,{callId:f.callId});
  expect(result).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input"},data:{currentRevision:0,currentPlan:null}});
  const feedback=feedbackSchema.parse(result.data);
  expect(feedback.referenceRules.operationRefs).toContain("call_");
  expect(feedback.referenceRules.operationRefs).toContain("工具名(call_id)");
  expect(feedback.referenceRules.artifactRefs).toContain("artifactId@version");
  expect(feedback.referenceRules.artifactRefs).toContain("文件名");
  expect(feedback.referenceRules.unexecutedSteps).toContain("[]");
  expect(result.error?.recovery).toContain("expectedRevision=0");
  expect(feedback.recentSuccessfulOperations).toEqual([]);expect(feedback.registeredArtifacts).toEqual([]);
  const model=await f.ledger.reserve(f.ref,{kind:"model",operationKey:"repair-model",inputDigest:"sha256:"+"b".repeat(64),reservedTokens:20});
  await f.ledger.start(f.ref,model.id);
  await f.ledger.settle(f.ref,model.id,{status:"settled",usage:{totalTokens:5},providerResult:{content:[{type:"tool-call",toolCallId:"repair-plan",toolName:"plan_update",input:JSON.stringify({expectedRevision:feedback.currentRevision,steps:[planStep]})}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:3},outputTokens:{total:2}},warnings:[]}});
  const call=await f.ports.reserve(f.ref,{modelCallId:model.id,toolCallId:"repair-plan"});await f.ports.start(f.ref,{callId:call.callId});
  expect(await f.ports.execute(f.ref,{callId:call.callId})).toMatchObject({status:"ok",sideEffect:"committed"});
  expect(await createWorkbenchPlanService(db).read(f.owner,f.task.id)).toEqual({planRevision:1,steps:[planStep]});
  expect((await f.ledger.inspect(f.ref)).calls.every(call=>call.status==="settled")).toBe(true);
  expect(await f.ports.execute(f.ref,{callId:f.callId})).toEqual(result); // 已结算旧回执不被新版本覆盖。
});

it("版本冲突反馈携带服务端现存完整计划，保留原步骤与回执供模型自行修订",async()=>{
  const f=await publicFixture([{...planStep,title:"请求中的旧标题"}]);
  const plans=createWorkbenchPlanService(db),saved=await plans.save(f.ref,{expectedRevision:0,steps:[{...planStep,title:"服务端当前标题"}]});
  const result=await f.ports.execute(f.ref,{callId:f.callId});
  expect(result).toMatchObject({status:"error",sideEffect:"none",data:{currentRevision:1,currentPlan:saved}});
  expect(result.error?.recovery).toContain("expectedRevision=1");
  expect(await plans.read(f.owner,f.task.id)).toEqual(saved);
});

it("巨大历史计划的错误反馈明确标注摘要，不能因反馈超过回执上限变成 unknown",async()=>{
  const f=await publicFixture([planStep]),plans=createWorkbenchPlanService(db);
  const steps=Array.from({length:1600},(_,i)=>({...planStep,stepId:`step-${i}`,title:"原".repeat(500)}));
  const saved=await plans.save(f.ref,{expectedRevision:0,steps});
  expect(JSON.stringify(saved).length).toBeGreaterThan(800_000);
  const result=await f.ports.execute(f.ref,{callId:f.callId});
  expect(result).toMatchObject({status:"error",sideEffect:"none",data:{currentRevision:1,currentPlanComplete:false,currentPlan:{planRevision:1,stepCount:1600,truncated:true}}});
  expect(result.error?.recovery).toContain("不得据摘要覆盖或删除旧步骤");
  expect((await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.callId)?.status).toBe("settled");
  expect(await plans.read(f.owner,f.task.id)).toEqual(saved);
});

it("反馈仅列本任务真实成功调用和登记产物，限制数量且不在事务内读 Blob",async()=>{
  const f=await publicFixture([{...planStep,operationRefs:["files_write(call_fake)"],artifactRefs:["report.md"]}],0,40);
  const operationRefs:string[]=[];
  for(let i=0;i<23;i++){
    const call=await f.ledger.reserve(f.ref,{kind:"tool",operationKey:`evidence-${i}`,inputDigest:"sha256:"+"c".repeat(64),reservedTokens:0});
    await f.ledger.start(f.ref,call.id);
    const output={status:i===21?"error":"ok",summary:"私有正文不必进入引用提示",evidence:[],error:i===21?{code:"invalid_input",retryable:false,recovery:"修正"}:null,continuation:null,sideEffect:i===22?"unknown":"none"};
    await f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:`model-tool-${i}`,toolName:"files_read",output})});
    if(i<21)operationRefs.push(call.id);
  }
  const foreign=await publicFixture([planStep]);await foreign.ports.execute(foreign.ref,{callId:foreign.callId});
  let bytes:Uint8Array|undefined,blobReads=0;
  const artifacts=createWorkbenchArtifactService(db,{readTaskFile:async()=>({bytes:Buffer.from("已登记报告"),version:1}),blobs:{
    async submit(_ctx,input){bytes=input.bytes.slice();return {hash:createHash("sha256").update(bytes).digest("hex"),size:bytes.byteLength};},
    async read(){blobReads++;if(!bytes)throw new Error("缺少 Blob");return bytes.slice();},
  }});
  const artifact=await artifacts.register(f.ref,"register-report",{path:"report.md",mime:"text/markdown"});
  const readsBefore=blobReads;
  const result=await f.ports.execute(f.ref,{callId:f.callId}),feedback=feedbackSchema.parse(result.data);
  expect(result).toMatchObject({status:"error",sideEffect:"none"});
  expect(feedback.recentSuccessfulOperations).toEqual(operationRefs.slice(-20).reverse().map(operationRef=>({operationRef,toolName:"files_read"})));
  expect(feedback.registeredArtifacts).toEqual([{artifactRef:`${artifact.artifactId}@1`,relativePath:"report.md"}]);
  expect(JSON.stringify(feedback)).not.toContain(foreign.callId);
  expect(JSON.stringify(feedback)).not.toContain("私有正文");
  expect(blobReads).toBe(readsBefore);
  expect(await createWorkbenchPlanService(db).read(f.owner,f.task.id)).toBeNull();
});

it("错误反馈在租约内读取最新计划；反馈查询失败仍保持 unknown",async()=>{
  const f=await publicFixture([planStep],3),plans=createWorkbenchPlanService(db);
  await plans.save(f.ref,{expectedRevision:0,steps:[planStep]});
  let changed=false;
  const advanceBeforeFeedback=new Proxy(db,{get(target,key,receiver){
    if(key==="transaction")return async(...args:Parameters<Db["transaction"]>)=>{
      if(!changed){changed=true;await plans.save(f.ref,{expectedRevision:1,steps:[{...planStep,title:"并发修改后的计划"}]});}
      return target.transaction(...args);
    };
    return Reflect.get(target,key,receiver);
  }});
  const tools=await createChatWorkbenchPlanToolHost(advanceBeforeFeedback)(f.owner,f.input,f.ref,new AbortController().signal);
  const result=await createExecutionChatToolPorts(db,{budget:f.budget,tools}).execute(f.ref,{callId:f.callId});
  expect(result).toMatchObject({data:{currentRevision:2,currentPlan:{planRevision:2,steps:[{...planStep,title:"并发修改后的计划"}]}}});

  const failure=await publicFixture([planStep],4);
  const brokenFeedback=new Proxy(db,{get(target,key,receiver){if(key==="transaction")return async()=>{throw new Error("读取当前计划时数据库断连");};return Reflect.get(target,key,receiver);}});
  const brokenTools=await createChatWorkbenchPlanToolHost(brokenFeedback)(failure.owner,failure.input,failure.ref,new AbortController().signal);
  await expect(createExecutionChatToolPorts(db,{budget:failure.budget,tools:brokenTools}).execute(failure.ref,{callId:failure.callId})).rejects.toThrow("未确认");
  expect((await failure.ledger.inspect(failure.ref)).calls.find(call=>call.id===failure.callId)).toMatchObject({status:"unknown",resultText:null});
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
