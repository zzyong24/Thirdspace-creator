import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, eq, executionTasks, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionCheckpointService } from "./execution-checkpoint.service";
const ctx = {userId:"checkpoint-user",accountId:"checkpoint-account",requestId:"test",source:"user" as const};
const budget = {maxCalls:10,maxTokens:1000,deadlineMs:60000};
describe("持久检查点与权威调用事实", () => {
  let db:Db; let close:()=>Promise<void>;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});
  afterAll(async()=>close?.());
  async function fixture(id:string){
    const now=()=>"2026-09-05T00:00:00.000Z";
    const tasks=createPersistentTaskService(db,{now});
    const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{}});
    const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("claim missing");
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const ledger=createExecutionCallLedgerService(db,{now,budget});
    const checkpoints=createExecutionCheckpointService(db,{now});
    async function call(key:string,kind:"model"|"tool"="model",settled=true){
      const call=await ledger.reserve(ref,{operationKey:key,kind,inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});
      await ledger.start(ref,call.id);
      if(settled)await ledger.settle(ref,call.id,{status:"settled",usage:{totalTokens:kind==="tool"?0:15},resultText:key});
      return call;
    }
    return {task,ref,tasks,ledger,checkpoints,call,now};
  }
  it("同请求并发重投只推进一次，回读只从真实账本重建消息和预算",async()=>{
    const f=await fixture("repeat");const c=await f.call("正文");
    const request={expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant" as const,callId:c.id}]};
    const [a,b]=await Promise.all([f.checkpoints.save(f.ref,request),f.checkpoints.save(f.ref,request)]);
    expect(a.revision).toBe(1);expect(b.revision).toBe(1);
    const state=await f.checkpoints.read(f.ref);
    expect(state.messages).toMatchObject([{role:"assistant",callId:c.id,resultText:"正文"}]);
    expect(state.budget).toEqual(budget);expect(state.knownSpentTokens).toBe(15);expect(state.pendingCalls).toEqual([]);
    expect(state.recovery).toBe("ready");
    await expect(f.checkpoints.save(f.ref,{...request,messages:[]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it.each([
    {status:"blocked",sideEffect:"unknown",code:"needs_login"},
    {status:"blocked",sideEffect:"committed",code:"captcha"},
    {status:"blocked",sideEffect:"none",code:"unknown_commit"},
    {status:"error",sideEffect:"none",code:"needs_login"},
  ])("显式恢复不能认可含写入风险或非blocked回执：%j",async variant=>{
    const f=await fixture(`unsafe-ack-${variant.sideEffect}-${variant.code}`);
    const result={schemaVersion:1,kind:"tool",toolCallId:"read",toolName:"web.read",output:{status:variant.status,summary:"受阻",evidence:[],data:{recoveryState:"browser_runtime_unavailable"},error:{code:variant.code,retryable:false,recovery:"请确认"},continuation:null,sideEffect:variant.sideEffect}};
    const call=await f.call("blocked-read","tool",false);
    await f.ledger.settle(f.ref,call.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify(result)});
    await db.update(executionTasks).set({status:"waiting_user"}).where(eq(executionTasks.id,f.task.id));
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"explicit-resume"});
    const claim=(await f.tasks.claimTask({taskId:f.task.id,workerId:"resumed"}))!;
    const state=await f.checkpoints.read({...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken});
    expect(state.acknowledgedBlockedCallIds).toEqual([]);
  });
  it("用户恢复时在途的调用之后才结算blocked，不能被旧水位自动认可",async()=>{
    const f=await fixture("late-blocked-after-resume");
    const result=(toolCallId:string)=>JSON.stringify({schemaVersion:1,kind:"tool",toolCallId,toolName:"web.read",output:{status:"blocked",summary:"需要登录",evidence:[],error:{code:"needs_login",retryable:false,recovery:"登录后恢复"},continuation:null,sideEffect:"none"}});
    const known=await f.call("known-read","tool",false);
    await f.ledger.settle(f.ref,known.id,{status:"settled",usage:{totalTokens:0},resultText:result("known")});
    const late=await f.call("late-read","tool",false);
    await db.update(executionTasks).set({status:"waiting_user"}).where(eq(executionTasks.id,f.task.id));
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"explicit-resume"});
    // 真实settlement允许旧attempt在新claim之前结算既有调用。
    await f.ledger.settle(f.ref,late.id,{status:"settled",usage:{totalTokens:0},resultText:result("late")});
    const claim=(await f.tasks.claimTask({taskId:f.task.id,workerId:"resumed"}))!;
    const fresh={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    expect((await f.checkpoints.read(fresh)).acknowledgedBlockedCallIds).toEqual([known.id]);
    const [stored]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));
    expect(stored?.payload).toMatchObject({researchBlockedAcknowledgedThroughSequence:late.sequence,researchBlockedAcknowledgedCallIds:[known.id]});
  });
  it("旧版覆盖、遗漏新调用、跨任务或角色伪造、未结算结果均拒绝",async()=>{
    const f=await fixture("truth");const other=await fixture("foreign");const c=await f.call("one");const foreign=await other.call("foreign");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:foreign.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"tool",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]});
    const pending=await f.call("two","tool",false);
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[{role:"tool",callId:pending.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("暂停后旧执行不能写；换租约恢复保留消息、预算和未完成调用并要求对账",async()=>{
    const f=await fixture("restart");const c=await f.call("已完成");
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]});
    const started=await f.call("未完成","tool",false);
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"pause",idempotencyKey:"pause"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[{role:"assistant",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt});
    await f.tasks.command(ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume"});
    const claim=await f.tasks.claimTask({taskId:f.task.id,workerId:"new-worker"});if(!claim)throw new Error("claim missing");
    const fresh={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const replacement=createExecutionCheckpointService(db,{now:f.now});
    const state=await replacement.read(fresh);
    expect(state.revision).toBe(1);expect(state.messages[0]?.resultText).toBe("已完成");
    expect(state.recovery).toBe("requires_reconciliation");expect(state.pendingCalls).toMatchObject([{callId:started.id,status:"started"}]);
    expect(state.knownSpentTokens).toBe(15);expect(state.budget).toEqual(budget);
    await expect(f.checkpoints.read(f.ref)).rejects.toMatchObject({name:"ConflictError"});
  });
  it("检查点之后新结算的回执仍可恢复；未知用量不能显示为零或ready",async()=>{
    const f=await fixture("late-receipt");const c=await f.call("待结算","model",false);
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[]});
    await f.ledger.settle(f.ref,c.id,{status:"settled",usage:{},resultText:"真实迟到结果"});
    const state=await f.checkpoints.read(f.ref);
    expect(state.recovery).toBe("requires_reconciliation");expect(state.spentTokens).toBeNull();
    expect(state.uncheckpointedReceipts).toMatchObject([{callId:c.id,resultText:"真实迟到结果"}]);
  });
  it("工具回执必须关闭真实模型调用，多工具未收齐不能宣称ready，历史顺序不可改",async()=>{
    const f=await fixture("tool-dependencies");
    const model=await f.call("model","model",false);
    const providerResult={content:[{type:"tool-call",toolCallId:"t1",toolName:"search",input:'{"query":"one"}'},{type:"tool-call",toolCallId:"t2",toolName:"read",input:'{"url":"https://example.com"}'}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]};
    await f.ledger.settle(f.ref,model.id,{status:"settled",usage:{totalTokens:15},providerResult});
    const first={role:"assistant" as const,callId:model.id};
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[first]});
    expect((await f.checkpoints.read(f.ref)).recovery).toBe("pending");
    const tool=await f.call("tool","tool",false);
    const receipt={schemaVersion:1,kind:"tool",toolCallId:"t1",toolName:"search",output:{items:["one"]}};
    await f.ledger.settle(f.ref,tool.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify(receipt)});
    const second={role:"tool" as const,callId:tool.id};
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[second,first]})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[first,first]})).rejects.toMatchObject({name:"ConflictError"});
    await f.checkpoints.save(f.ref,{expectedRevision:1,expectedLedgerSequence:2,messages:[first,second]});
    expect((await f.checkpoints.read(f.ref)).unresolvedToolCalls).toEqual([{toolCallId:"t2",toolName:"read"}]);
    const tool2=await f.call("tool2","tool",false);
    await f.ledger.settle(f.ref,tool2.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({...receipt,toolCallId:"t2",toolName:"read"})});
    await f.checkpoints.save(f.ref,{expectedRevision:2,expectedLedgerSequence:3,messages:[first,second,{role:"tool",callId:tool2.id}]});
    expect((await f.checkpoints.read(f.ref)).recovery).toBe("ready");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[first]})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.checkpoints.read(f.ref)).revision).toBe(3);
  });
  it("没有模型工具调用的工具结果不能拼成已确认历史",async()=>{
    const f=await fixture("orphan-tool");const c=await f.call("orphan","tool",false);
    await f.ledger.settle(f.ref,c.id,{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:"invented",toolName:"search",output:{}})});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"tool",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("不能越过较早在途调用保存后续消息，迟到结算后仍能保存完整顺序",async()=>{
    const f=await fixture("late-order");const early=await f.call("early","model",false);const later=await f.call("later");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:2,messages:[{role:"assistant",callId:later.id}]})).rejects.toMatchObject({name:"ConflictError"});
    await f.ledger.settle(f.ref,early.id,{status:"settled",usage:{totalTokens:15},resultText:"early"});
    await f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:2,messages:[{role:"assistant",callId:early.id},{role:"assistant",callId:later.id}]});
    expect((await f.checkpoints.read(f.ref)).messages.map(message=>message.resultText)).toEqual(["early","later"]);
  });
  it("模型声称工具回合但缺调用信息时要求对账，不作为完整历史保存",async()=>{
    const f=await fixture("missing-protocol");const c=await f.call("bad","model",false);
    await f.ledger.settle(f.ref,c.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"text",text:"将查询"}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
    expect((await f.checkpoints.read(f.ref)).recovery).toBe("requires_reconciliation");
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:1,messages:[{role:"assistant",callId:c.id}]})).rejects.toMatchObject({name:"ConflictError"});
  });
  it("不接受Worker自报预算、SDK状态或浏览器句柄；未知历史结构不覆盖",async()=>{
    const f=await fixture("legacy");
    await expect(f.tasks.saveCheckpoint({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt,checkpoint:{arbitrary:true}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:0,messages:[],budget:{maxTokens:9999}})).rejects.toThrow();
    await db.update(executionTasks).set({checkpoint:{legacy:"unknown"}}).where(eq(executionTasks.id,f.task.id));
    await expect(f.checkpoints.read(f.ref)).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.checkpoints.save(f.ref,{expectedRevision:0,expectedLedgerSequence:0,messages:[]})).rejects.toMatchObject({name:"ConflictError"});
  });
});

it.each(["needs_login","captcha","browser_runtime_unavailable"] as const)("真实Pi与PGlite：只有显式resume认可旧%s阻断，新阅读仍须新模型新调用",async(blockedReason)=>{
  const {createServer}=await import("node:http");const {z}=await import("zod");
  const {runAgenticInWorker}=await import("@creatoros/ai-worker/agentic-run");
  const {createExecutionAgenticModelPorts}=await import("./execution-agentic-model-ports.service");
  const {createExecutionAgenticToolPorts}=await import("./execution-agentic-tool-ports.service");
  const {createExecutionGenerationPorts}=await import("./execution-generation-ports.service");
  const {createExecutionWorkerCallPorts}=await import("./execution-worker-call-ports.service");
  const {createExecutionWorkerOutcomeService}=await import("./execution-worker-outcome.service");
  const connection=await createDb(),db=connection.db,now=()=>new Date().toISOString();
  const deps={now,budget:{maxCalls:20,maxTokens:100000,deadlineMs:60000}};
  const input={kind:"agentic.run" as const,operationKey:"login-resume",taskType:"agentic.research" as const,goal:"读取网页后总结",systemPrompt:"读取目标，登录恢复后重新观察。",capability:"research",maxOutputTokens:200,dryRun:false,tools:[{name:"web.read",version:"1",label:"读网页",description:"读取目标网页",effect:"none" as const,parameters:{type:"object",properties:{url:{type:"string"}},required:["url"],additionalProperties:false}}]};
  const tasks=createPersistentTaskService(db,{now});const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:"login-resume",idempotencyKey:"login-resume",payload:{modelInput:input}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;let ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const ledger=createExecutionCallLedgerService(db,deps),models=createExecutionAgenticModelPorts(db,deps),generation=createExecutionGenerationPorts(db,deps),workerCalls=createExecutionWorkerCallPorts(db,deps),checkpoints=createExecutionCheckpointService(db,{now}),outcomes=createExecutionWorkerOutcomeService(db,{now});
  const tools=createExecutionAgenticToolPorts(db,{...deps,tools:{"web.read":{version:"1",effect:"none",parameters:z.object({url:z.string().url()}).strict()}}});
  const frozen=await workerCalls.readTaskContext(ref);if(frozen.kind!=="agentic.run")throw new Error("wrong input");
  const call=async(port:import("@creatoros/contract/execution-worker").WorkerPort,data:unknown):Promise<unknown>=>{
    if(port==="readCheckpoint")return checkpoints.read(ref);if(port==="saveCheckpoint")return checkpoints.save(ref,data);
    if(port==="reserveAgenticModel")return models.reserve(ref,data);if(port==="reserveAgenticTool")return tools.reserve(ref,data);
    if(port==="startAgenticTool")return tools.start(ref,data);if(port==="settleAgenticTool")return tools.settle(ref,data);
    if(port==="settleGenerationCall")return generation.settleGenerationCall(ref,data);if(port==="startCall")return workerCalls.startCall(ref,data);
    throw new Error(`unexpected ${port}`);
  };
  let reads=0;const readIds:string[]=[];
  const adapter={execute:async(_name:string,_input:unknown,scope:{callId:string})=>{
    reads++;readIds.push(scope.callId);
    return reads<3 ? {status:"blocked" as const,summary:"来源需要登录",evidence:[],...(blockedReason==="browser_runtime_unavailable"?{data:{recoveryState:blockedReason}}:{}),error:{code:blockedReason==="browser_runtime_unavailable"?"permission" as const:blockedReason,retryable:false,recovery:"用户完成登录后恢复"},continuation:null,sideEffect:"none" as const}
    : {status:"ok" as const,summary:"已重新读取正文",evidence:[{sourceUrl:"https://example.com",text:"本次真实观察"}],error:null,continuation:null,sideEffect:"none" as const};
  }};
  const requests:string[]=[];const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(Buffer.concat(chunks).toString());const n=requests.length;
    const delta=n<=3?{role:"assistant",tool_calls:[{index:0,id:`read-${n}`,type:"function",function:{name:"web.read",arguments:JSON.stringify({url:"https://example.com"})}}]}:{role:"assistant",content:"已重新观察并完成总结"};
    const base={id:`m-${n}`,object:"chat.completion.chunk",created:1,model:"test"};res.writeHead(200,{"content-type":"text/event-stream"});res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:n<=3?"tool_calls":"stop"}],usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7}})}\n\ndata: [DONE]\n\n`);
  });await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
  const model={apiFormat:"openai_chat" as const,authStyle:"bearer" as const,baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"test",token:"local-fixture"};
  const run=()=>runAgenticInWorker(frozen,model,new AbortController().signal,call,undefined,adapter);
  async function resume(){
    await outcomes.recordFailure(ref,{outcome:"waiting_user",errorCode:"RESEARCH_LOGIN_REQUIRED"});
    await tasks.command(ctx,{taskIds:[task.id],command:"resume",idempotencyKey:`resume-${ref.attempt}`});
    const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;ref={...ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  }
  try{
    for(let n=0;n<2;n++)await expect(run()).rejects.toMatchObject({outcome:"waiting_user"});
    expect(reads).toBe(1);expect(requests).toHaveLength(1);
    const [before]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.id));
    await resume();expect((await checkpoints.read(ref)).acknowledgedBlockedCallIds).toEqual([readIds[0]]);
    await expect(run()).rejects.toMatchObject({outcome:"waiting_user"});expect(reads).toBe(2);expect(requests).toHaveLength(2);
    // 第一次用户恢复不能自动认可之后新发生的阻断；进程重跑也不能盲目再发第三次阅读。
    await expect(run()).rejects.toMatchObject({outcome:"waiting_user"});expect(reads).toBe(2);
    await resume();expect((await run()).summary).toContain("完成总结");expect(reads).toBe(3);expect(new Set(readIds).size).toBe(3);expect(requests).toHaveLength(4);
    expect(requests[1]).toContain(blockedReason);expect(requests[2]).toContain(blockedReason);
    const state=await ledger.inspect(ref);expect(state.calls).toHaveLength(7);expect(state.calls.filter(row=>row.kind==="tool").slice(0,2).every(row=>row.resultText?.includes(blockedReason))).toBe(true);
    const [after]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.id));expect(after?.executionBudget).toEqual(before?.executionBudget);expect(after?.deadlineAt).toBe(before?.deadlineAt);expect((after?.payload as {modelInput:unknown}).modelInput).toEqual(input);
  }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));await connection.client.close();}
},30000);
