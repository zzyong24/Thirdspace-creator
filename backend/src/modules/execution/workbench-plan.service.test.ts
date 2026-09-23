import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { createDb, executionCalls, executionTasks, eq, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createWorkbenchPlanService, hasLaterChatRoot, validateTerminalPlanFailures, validateTerminalToolFailures } from "./workbench-plan.service";
import { createWorkbenchArtifactService } from "./workbench-artifact.service";
import { createExecutionCheckpointService } from "./execution-checkpoint.service";
import { createExecutionGenerationPorts } from "./execution-generation-ports.service";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
import { createExecutionStreamService } from "./execution-stream.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionChatToolPorts, readExecutionChatTask } from "./execution-chat-tool-ports.service";
import { createWorkerSupervisor } from "./worker-supervisor";
import { createAiService } from "../ai/ai.service";
import { createChatTurnSubmissionService } from "../ai/chat-turn-submission.service";
import { createChatTurnCompletionService } from "../ai/chat-turn-completion.service";
import { createChatWorkbenchPlanToolHost } from "../ai-runtime/chat-workbench-plan-tool-host";
import { chatWorkbenchPlanCapability } from "../ai-runtime/chat-workbench-plan-tool";
import { defineWorkbenchChatTool } from "../ai-runtime/chat-tool-gate";
import { prepareChatToolDefinitions } from "../ai-runtime/chat-tool-definitions";
import type { ExecutionRef, WorkerPort } from "@creatoros/contract/execution-worker";
import type { WorkbenchPlan } from "@creatoros/contract/agent-workbench";
import { agenticToolOutcomeSchema, workerToolResultReceiptSchema } from "@creatoros/contract/execution-worker";

const now = () => "2026-09-19T00:00:00.000Z";
const ctx = {userId: "plan-user", accountId: "plan-account", requestId: "test", source: "user" as const};
const step = (stepId: string, overrides: Partial<WorkbenchPlan["steps"][number]> = {}): WorkbenchPlan["steps"][number] => ({stepId, title: stepId, dependsOn: [], status: "pending", operationRefs: [], artifactRefs: [], ...overrides});

it("仅按execution当前计划顺序核验完整终态失败ID并返回可信标题", () => {
  const payload = {workbenchPlan:{planRevision:3,steps:[step("failed-a",{title:"来源读取失败",status:"failed"}),step("skipped",{status:"skipped"}),step("failed-b",{title:"报告校验失败",status:"failed"})]}};
  expect(validateTerminalPlanFailures(payload,["failed-a","skipped","failed-b"])).toEqual([{stepId:"failed-a",title:"来源读取失败",status:"failed"},{stepId:"skipped",title:"skipped",status:"skipped"},{stepId:"failed-b",title:"报告校验失败",status:"failed"}]);
  expect(()=>validateTerminalPlanFailures(payload,undefined,true)).toThrow();
  for (const ids of [["failed-b","skipped","failed-a"],["failed-a"],["failed-a","skipped","foreign"]]) expect(()=>validateTerminalPlanFailures(payload,ids)).toThrow();
  for (const status of ["cancelled","skipped"] as const) expect(validateTerminalPlanFailures({workbenchPlan:{planRevision:1,steps:[step("stopped",{title:"停止的步骤",status})]}},["stopped"])).toEqual([{stepId:"stopped",title:"停止的步骤",status}]);
  expect(()=>validateTerminalPlanFailures({workbenchPlan:{planRevision:1,steps:[step("failed",{status:"failed"}),step("waiting",{status:"waiting_user"})]}},["failed"])).toThrow();
  expect(validateTerminalPlanFailures({workbenchPlan:{planRevision:1,steps:[step("pending")]}},undefined)).toBeNull();
});
it("仅将真实账本中同工具同输入的重复不可重试错误作为终态工具失败",()=>{
 const output={status:"error",summary:"参数错误",evidence:[],data:null,error:{code:"invalid_input",retryable:false,recovery:"补齐参数"},continuation:null,sideEffect:"none"};
 const call=(id:string,digest="same")=>({id,sequence:id==="a"?1:2,kind:"tool",status:"settled",parentCallId:null,inputDigest:digest,resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:`provider-${id}`,toolName:"plan_update",output})});
 expect(agenticToolOutcomeSchema.safeParse(output).success).toBe(true);
 expect(workerToolResultReceiptSchema.safeParse(JSON.parse(call("a").resultText)).success).toBe(true);
 expect(validateTerminalToolFailures([call("a"),call("b")],["a","b"])).toEqual([{toolName:"plan_update",errorCode:"invalid_input"}]);
 expect(()=>validateTerminalToolFailures([call("a"),call("b")],undefined,true)).toThrow();
 expect(()=>validateTerminalToolFailures([call("a"),call("b")],["a"])).toThrow();
 expect(validateTerminalToolFailures([call("a"),call("b","different")])).toBeNull();
 expect(()=>validateTerminalToolFailures([call("a"),call("b","different")],["a","b"])).toThrow();
});
it("旧stop的历史提示将任意状态后继root计为后继，忽略工具子调用",()=>{
 for(const status of ["settled","rejected","superseded","reserved","started","unknown"]){
  expect(hasLaterChatRoot([{kind:"model",parentCallId:null,sequence:12,status}],10)).toBe(true);
 }
 expect(hasLaterChatRoot([{kind:"model",parentCallId:"tool-parent",sequence:12}],10)).toBe(false);
 expect(hasLaterChatRoot([{kind:"tool",parentCallId:null,sequence:12}],10)).toBe(false);
});

describe("T-1005 计划作为原 execution_tasks 的投影", () => {
  let db: Db; let close: () => Promise<void>;
  beforeAll(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); });
  afterAll(async () => close?.());
  async function fixture(suffix: string) {
    const tasks = createPersistentTaskService(db, {now});
    const task = await tasks.enqueue(ctx, {kind: "ai_task", ownerType: "ai_task", ownerId: suffix, idempotencyKey: suffix, payload: {source: "original"}});
    const claim = await tasks.claimTask({taskId: task.id, workerId: "plan-worker"});
    if (!claim) throw new Error("missing claim");
    return {task, tasks, ref: {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken}, plan: createWorkbenchPlanService(db, {now})};
  }

  it("同请求幂等，冲突版本拒绝，且读回只归属本账号", async () => {
    const f = await fixture("cas");
    const input = {expectedRevision: 0, steps: [step("research")]};
    const [first, retry] = await Promise.all([f.plan.save(f.ref, input), f.plan.save(f.ref, input)]);
    expect(first.planRevision).toBe(1);
    expect(retry).toEqual(first);
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("different")]})).rejects.toMatchObject({name: "ConflictError"});
    expect(await f.plan.read(ctx, f.task.id)).toEqual(first);
    expect(await f.plan.status(f.ref)).toEqual({revision: 1, progressToken: "[]", steps: [{stepId: "research", title: "research", status: "pending"}]});
    await expect(f.plan.read({...ctx, accountId: "foreign"}, f.task.id)).rejects.toThrow();
    const [stored] = await db.select().from(executionTasks).where(eq(executionTasks.id, f.task.id));
    expect(stored?.payload).toMatchObject({source: "original", workbenchPlan: first});
  });

  it("无回执不得把步骤标为成功；已结算操作、重规划和恢复保留事实与成本", async () => {
    const f = await fixture("receipt");
    await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("read")]});
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [step("read", {status: "succeeded", operationRefs: ["fake"]})]})).rejects.toMatchObject({name: "ConflictError"});
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const call = await ledger.reserve(f.ref, {operationKey: "read", kind: "tool", inputDigest: "sha256:" + "a".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "settled", usage: {totalTokens: 0}, resultText: "{\"status\":\"ok\"}"});
    const completed = await f.plan.save(f.ref, {expectedRevision: 1, steps: [step("read", {status: "succeeded", operationRefs: [call.id]})]});
    expect(completed.planRevision).toBe(2);
    await expect(f.plan.save(f.ref, {expectedRevision: 2, steps: [step("read", {status: "pending"})]})).rejects.toMatchObject({name: "ConflictError"});
    const revised = await f.plan.save(f.ref, {expectedRevision: 2, steps: [completed.steps[0]!, step("report", {dependsOn: ["read"]})]});
    expect(revised.steps[0]).toEqual(completed.steps[0]);
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "pause", idempotencyKey: "pause"});
    await f.tasks.acknowledgeControl({taskId: f.task.id, workerId: "plan-worker", attempt: f.ref.attempt});
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "resume", idempotencyKey: "resume"});
    expect(await f.plan.read(ctx, f.task.id)).toEqual(revised);
    await expect(f.plan.save(f.ref, {expectedRevision: 3, steps: revised.steps})).rejects.toMatchObject({name: "ConflictError"});
    await expect(f.plan.status(f.ref)).rejects.toMatchObject({name: "ConflictError"});
    const claimed = await f.tasks.claimTask({taskId: f.task.id, workerId: "plan-worker-new"});
    if (!claimed) throw new Error("resumed task was not claimable");
    const resumed = {executionTaskId: f.task.id, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken};
    expect((await f.plan.status(resumed))?.revision).toBe(3);
    expect((await f.plan.save(resumed, {expectedRevision: 3, steps: [...revised.steps, step("verify", {dependsOn: ["report"]})]})).steps[0]).toEqual(completed.steps[0]);
  });

  it.each(["operationRefs","artifactRefs","steps","dependsOn","supersedes"] as const)("T1026 round7 %s拒绝给精确字段且不推进计划",async field=>{
    const f=await fixture(`round7-${field}`),ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:10,maxTokens:1000,deadlineMs:60000}});
    const c=await ledger.reserve(f.ref,{kind:"tool",operationKey:"read",inputDigest:"sha256:"+"c".repeat(64),reservedTokens:0});await ledger.start(f.ref,c.id);
    await ledger.settle(f.ref,c.id,{status:"settled",usage:{totalTokens:0},resultText:'{"status":"ok"}'});
    const artifactRef="wa-existing@1",old=step("original",{operationRefs:[c.id],artifactRefs:[artifactRef]});
    // 历史pending步骤保留既有refs；本测试不让该产物成为成功证据。
    const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));
    const saved={planRevision:1,steps:[old]};
    await db.update(executionTasks).set({payload:{...task!.payload as object,workbenchPlan:saved}}).where(eq(executionTasks.id,f.task.id));
    const requested=field==="steps"?[]:field==="dependsOn"?[old,step("report",{dependsOn:[old.stepId],status:"succeeded",operationRefs:[c.id]})]:
      field==="supersedes"?[old,step("new",{supersedes:"absent"})]:[{...old,[field]:[]}];
    await expect(f.plan.save(f.ref,{expectedRevision:1,steps:requested})).rejects.toMatchObject({issue:{
      code:field==="steps"?"step_removed":field==="dependsOn"?"dependency_not_successful":field==="supersedes"?"invalid_supersedes":"receipt_removed",field,
      stepId:field==="dependsOn"?"report":field==="supersedes"?"new":"original",
      ...(field==="operationRefs"?{operationRef:c.id}:field==="artifactRefs"?{artifactRef}:field==="dependsOn"?{dependencyRef:"original"}:{}),
    }});
    expect(await f.plan.read(ctx,f.task.id)).toEqual(saved);
  });

  it.each(["metadata","bytes","batch","probe_error","limit","identity","missing_during"] as const)("T1026 round7 产物%s未核实准确定位，不泄漏Blob且批拒绝不能由单项成功绕过",async mode=>{
    const f=await fixture(`round7-artifact-${mode}`),blobs=new Map<string,Uint8Array>();
    const artifacts=createWorkbenchArtifactService(db,{now,readTaskFile:async()=>({bytes:Buffer.from("fixture bytes"),version:1}),blobs:{
      async submit(_ctx,input){const hash=createHash("sha256").update(input.bytes).digest("hex");blobs.set(input.operationId,input.bytes);return {hash,size:input.bytes.length};},
      async read(_ctx,input){return blobs.get(input.operationId)!;},
    }});
    const registered=await artifacts.register(f.ref,"registered-artifact",{path:"report.md",mime:"text/markdown"});
    const good=`${registered.artifactId}@${registered.version}`,bad="wa-absent@1";
    const refs=mode==="metadata"?[good,bad]:mode==="limit"?Array.from({length:101},()=>good):[good];
    let singleReads=0;
    const plans=createWorkbenchPlanService(db,{now,verifyArtifacts:async(scope,items)=>{
      singleReads++;
      if(mode==="bytes"){blobs.clear();return artifacts.verifyArtifacts(scope,items);}
      if(mode==="identity"||mode==="missing_during"){
        const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.task.id));
        const payload=task!.payload as Record<string,unknown>,rows=payload.workbenchArtifactVersions as Array<Record<string,unknown>>;
        await db.update(executionTasks).set({payload:{...payload,workbenchArtifactVersions:mode==="missing_during"?[]:rows.map(row=>({...row,requestDigest:"b".repeat(64)}))}}).where(eq(executionTasks.id,f.task.id));
        return true;
      }
      if(mode==="probe_error"&&singleReads>1)throw Error("PRIVATE_DIAGNOSTIC_FAILURE");
      return mode==="batch"&&singleReads>1;
    }});
    await expect(plans.save(f.ref,{expectedRevision:0,steps:[step("report",{status:"succeeded",artifactRefs:refs})]})).rejects.toMatchObject({issue:{code:mode==="identity"||mode==="missing_during"?"artifact_changed":"artifact_unverified",stepId:"report",field:"artifactRefs",artifactRef:["batch","probe_error","limit"].includes(mode)?null:mode==="metadata"?bad:good}});
    if(mode==="limit")expect(singleReads).toBe(1);
    expect(await f.plan.read(ctx,f.task.id)).toBeNull();
  });

  it("拒绝不存在或成环的依赖", async () => {
    const f = await fixture("graph");
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("a", {dependsOn: ["missing"]})]})).rejects.toThrow();
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("a", {dependsOn: ["b"]}), step("b", {dependsOn: ["a"]})]})).rejects.toThrow();
  });

  it("T1026 成功缺证据明确定位步骤，拒绝后版本和步骤保持原值", async () => {
    const f = await fixture("diagnostic-missing-evidence");
    const saved = await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("needs-evidence")]});
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [step("needs-evidence", {status: "succeeded"})]})).rejects.toMatchObject({
      name: "ConflictError", issue: {code: "success_evidence_missing", stepId: "needs-evidence", currentStepStatus: "pending", requestedStatus: "succeeded",
        operationRef: null, ledgerStatus: null, receiptStatus: null, receiptHasError: null, sideEffect: null},
    });
    expect(await f.plan.read(ctx, f.task.id)).toEqual(saved);
  });

  it.each([
    ["failed", JSON.stringify({output: {status: "error", error: {code: "SECRET_CODE", message: "SECRET_BODY"}, sideEffect: "none"}}), "settled", "error", true, "none"],
    ["partial", JSON.stringify({output: {status: "partial", error: null, sideEffect: "none"}}), "settled", "partial", false, "none"],
    ["unknown-effect", JSON.stringify({status: "ok", error: null, sideEffect: "unknown"}), "settled", "ok", false, "unknown"],
    ["malformed", "SECRET_INVALID_JSON", "settled", "invalid", null, null],
    ["missing", null, "settled", "missing", null, null],
    ["started", null, "started", "missing", null, null],
    ["unknown", null, "unknown", "missing", null, null],
  ] as const)("T1026 %s回执诊断仅固定状态且成功门保持", async (suffix, resultText, ledgerStatus, receiptStatus, receiptHasError, sideEffect) => {
    const f = await fixture(`diagnostic-${suffix}`);
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const call = await ledger.reserve(f.ref, {kind: "tool", operationKey: "evidence", inputDigest: "sha256:" + "f".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    if (ledgerStatus === "settled") await ledger.settle(f.ref, call.id, {status: "settled", usage: {totalTokens: 0}, ...(resultText ? {resultText} : {})});
    if (ledgerStatus === "unknown") await ledger.settle(f.ref, call.id, {status: "unknown"});
    const before = (await ledger.inspect(f.ref)).calls;
    const error = await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("target", {status: "succeeded", operationRefs: [call.id]})]}).catch(error => error);
    expect(error).toMatchObject({name: "ConflictError", issue: {code: "operation_not_successful", stepId: "target", currentStepStatus: null, requestedStatus: "succeeded",
      operationRef: call.id, ledgerStatus, receiptStatus, receiptHasError, sideEffect}});
    expect(JSON.stringify(error.issue)).not.toContain("SECRET");
    expect(await f.plan.read(ctx, f.task.id)).toBeNull();
    expect((await ledger.inspect(f.ref)).calls).toEqual(before);
  });

  it("T1026 外任务、不存在及model引用统一不披露账本或回执状态", async () => {
    const foreign = await fixture("diagnostic-foreign");
    const f = await fixture("diagnostic-owner");
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const other = await ledger.reserve(foreign.ref, {kind: "tool", operationKey: "other", inputDigest: "sha256:" + "a".repeat(64), reservedTokens: 0});
    const model = await ledger.reserve(f.ref, {kind: "model", operationKey: "model", inputDigest: "sha256:" + "b".repeat(64), reservedTokens: 1});
    for (const operationRef of [other.id, model.id, "call_not_present"]) {
      await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("target", {status: "succeeded", operationRefs: [operationRef]})]})).rejects.toMatchObject({
        issue: {code: "operation_not_found", stepId: "target", operationRef, ledgerStatus: null, receiptStatus: null, receiptHasError: null, sideEffect: null},
      });
    }
    expect(await f.plan.read(ctx, f.task.id)).toBeNull();
  });

  it("重规划不能擦除已有操作引用，替换步骤必须指向旧步骤", async () => {
    const f = await fixture("replan-receipts");
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const call = await ledger.reserve(f.ref, {operationKey: "research", kind: "tool", inputDigest: "sha256:" + "b".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "settled", usage: {totalTokens: 0}, resultText: '{"status":"ok"}'});
    const first = await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("research", {status: "running", operationRefs: [call.id]})]});
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [step("research"), step("retry", {supersedes: "research"})]})).rejects.toMatchObject({name: "ConflictError"});
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [first.steps[0]!, step("retry", {supersedes: "missing"})]})).rejects.toMatchObject({name: "ConflictError"});
    const revised = await f.plan.save(f.ref, {expectedRevision: 1, steps: [first.steps[0]!, step("retry", {supersedes: "research"})]});
    expect(revised.steps[0]?.operationRefs).toEqual([call.id]);
  });

  it("重命名和状态摆动不计为计划执行进展", async () => {
    const f = await fixture("progress-facts");
    await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("research")]});
    const before = await f.plan.status(f.ref);
    await f.plan.save(f.ref, {expectedRevision: 1, steps: [step("research", {title: "新的标题", status: "running"})]});
    const after = await f.plan.status(f.ref);
    expect(after?.revision).toBe(2);
    expect(after?.progressToken).toBe(before?.progressToken);
  });

  it("未知在途工具在停止恢复后不能补写成功或换操作键重发", async () => {
    const f = await fixture("unknown-action");
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    await f.plan.save(f.ref, {expectedRevision: 0, steps: [step("external", {status: "running"})]});
    const call = await ledger.reserve(f.ref, {operationKey: "external-write", kind: "tool", inputDigest: "sha256:" + "c".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "unknown"});
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "pause", idempotencyKey: "pause-unknown"});
    await f.tasks.acknowledgeControl({taskId: f.task.id, workerId: "plan-worker", attempt: f.ref.attempt});
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "resume", idempotencyKey: "resume-unknown"});
    const claimed = await f.tasks.claimTask({taskId: f.task.id, workerId: "plan-worker-new"});
    if (!claimed) throw new Error("resumed task was not claimable");
    const resumed = {executionTaskId: f.task.id, attempt: claimed.lease.attempt, fenceToken: claimed.lease.fenceToken};
    await expect(f.plan.save(resumed, {expectedRevision: 1, steps: [step("external", {status: "succeeded", operationRefs: [call.id]})]})).rejects.toMatchObject({name: "ConflictError"});
    await expect(ledger.reserve(resumed, {operationKey: "external-write-again", kind: "tool", inputDigest: "sha256:" + "d".repeat(64), reservedTokens: 0})).rejects.toMatchObject({name: "ConflictError"});
    expect((await f.plan.read(ctx, f.task.id))?.steps[0]?.status).toBe("running");
  });

  it("已结算但声明未知副作用的回执不能支撑成功步骤", async () => {
    const f = await fixture("unknown-receipt");
    const ledger = createExecutionCallLedgerService(db, {now, budget: {maxCalls: 10, maxTokens: 1000, deadlineMs: 60000}});
    const call = await ledger.reserve(f.ref, {operationKey: "suspicious", kind: "tool", inputDigest: "sha256:" + "e".repeat(64), reservedTokens: 0});
    await ledger.start(f.ref, call.id);
    await ledger.settle(f.ref, call.id, {status: "settled", usage: {totalTokens: 0}, resultText: '{"status":"ok","sideEffect":"unknown","error":{"code":"unknown_commit"}}'});
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step("external", {status: "succeeded", operationRefs: [call.id]})]})).rejects.toMatchObject({name: "ConflictError"});
  });

  it("真实子进程在安全检查点停止后由新进程沿原任务续跑，已结算外部调用与费用不重复", async () => {
    execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {stdio: "pipe"});
    const liveNow = () => new Date().toISOString();
    const owner = {userId: "restart-plan-user", accountId: "restart-plan-account", requestId: "restart-plan", source: "user" as const};
    let nextId = 0;
    const unused = async ():Promise<never> => {throw new Error("unused AI service port");};
    const ai = createAiService({db,now:liveNow,nextId:prefix=>`${prefix}-restart-plan-${++nextId}`,
      artifacts:{createVersion:unused},knowledge:{createKnowledge:unused},
      candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},
      publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},
      positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
    const conversation = await ai.createConversation(owner, {title: "续跑", projectId: null, scope: "global"});
    const source = await ai.createMessage(owner, conversation.id, {content: "执行外部调用并核对", attachments: []});
    const prototype = defineWorkbenchChatTool(chatWorkbenchPlanCapability, async () => {throw new Error("unused");});
    const [planDefinition] = (await prepareChatToolDefinitions({"plan.update": prototype}, {workbenchCapabilities: [chatWorkbenchPlanCapability]})).definitions;
    const submission = await createChatTurnSubmissionService(db, {now: liveNow, assemble: async () => ({
      capability: "copilot.assist", system: "执行计划并凭原回执完成", messages: [{role: "user", content: "执行外部调用并核对"}],
      maxSteps: 8, maxOutputTokens: 256, tools: [planDefinition!, {name: "external.submit", version: "1", effect: "committed", description: "提交外部动作", parameters: {type: "object", properties: {}, additionalProperties: false}}],
    })}).submit(owner, {conversationId: conversation.id, sourceMessageId: source.id});
    const tasks = createPersistentTaskService(db, {now: liveNow});
    const firstClaim = await tasks.claimTask({taskId: submission.executionTaskId, workerId: "restart-worker-1"});
    if (!firstClaim) throw new Error("first claim missing");
    const firstRef: ExecutionRef = {executionTaskId: submission.executionTaskId, attempt: firstClaim.lease.attempt, fenceToken: firstClaim.lease.fenceToken};
    const plans = createWorkbenchPlanService(db, {now: liveNow});
    const budget = {maxCalls: 16, maxTokens: 1_000_000, deadlineMs: 60_000};
    const ledger = createExecutionCallLedgerService(db, {now: liveNow, budget});
    const checkpoints = createExecutionCheckpointService(db, {now: liveNow});
    const generation = createExecutionGenerationPorts(db, {now: liveNow, budget});
    const workerCalls = createExecutionWorkerCallPorts(db, {now: liveNow, budget});
    const streams = createExecutionStreamService(db, {now: liveNow});
    const leases = createExecutionLeaseService(db, {now: liveNow});
    const replies = createChatTurnCompletionService(db, {now: liveNow, validateTerminalPlanFailures, validateTerminalToolFailures});
    const {context, input} = await readExecutionChatTask(db, firstRef, liveNow);
    const planTools = await createChatWorkbenchPlanToolHost(db)(context, input, firstRef, new AbortController().signal);
    let externalCalls = 0, supplierCalls = 0;
    const externalTool = {version: "1", effect: "committed" as const, parameters: z.object({}).strict(),
      approve: async () => ({status: "not-applicable" as const}),
      execute: async () => {externalCalls++; return {status: "ok" as const, summary: "外部动作已提交", evidence: [], data: {receipt: "external-once"}, error: null, continuation: null, sideEffect: "committed" as const};},
    };
    const modelSpec = {apiFormat: "openai_chat" as const, baseUrl: "", model: "fixture", token: "fixture"};
    const chatTools = createExecutionChatToolPorts(db, {now: liveNow, budget, tools: {...planTools, "external.submit": externalTool}, resolveGenerationCredential: async () => modelSpec});
    await chatTools.validateTask(firstRef);
    const server = createServer((req, res) => {let body = ""; req.on("data", chunk => body += chunk); req.on("end", () => {
      supplierCalls++;
      let name: string | null = null, args: Record<string, unknown> = {};
      if (supplierCalls === 1) {name = "plan_update"; args = {expectedRevision: 0, steps: [step("external", {title: "提交后核对"})]};}
      if (supplierCalls === 2) name = "external_submit";
      if (supplierCalls === 4) {
        const receiptId = [...body.matchAll(/原工具调用 ID: (call_[^；\]]+)/g)].at(-1)?.[1];
        if (!receiptId) {res.writeHead(500); res.end("missing original receipt"); return;}
        name = "plan_update";
        args = {expectedRevision: 1, steps: [step("external", {title: "提交后核对", status: "succeeded", operationRefs: [receiptId]})]};
      }
      if (supplierCalls > 5) {res.writeHead(500); res.end("duplicate supplier call"); return;}
      const delta = name ? {tool_calls: [{index: 0, id: `fixture-call-${supplierCalls}`, type: "function", function: {name, arguments: JSON.stringify(args)}}]} : {content: supplierCalls === 3 ? "还需核对原计划。" : "已凭原回执完成。"};
      const chunks = [{choices: [{index: 0, delta, finish_reason: null}]}, {choices: [{index: 0, delta: {}, finish_reason: name ? "tool_calls" : "stop"}], usage: {prompt_tokens: 2, completion_tokens: 3, total_tokens: 5}}];
      res.writeHead(200, {"content-type": "text/event-stream"});
      res.end(chunks.map(chunk => `data: ${JSON.stringify({id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", ...chunk})}\n\n`).join("") + "data: [DONE]\n\n");
    });});
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
    modelSpec.baseUrl = `http://127.0.0.1:${(server.address() as {port: number}).port}/v1`;
    let safeCheckpoint: Awaited<ReturnType<typeof checkpoints.read>> | null = null;
    const makeSupervisor = (pauseAtCheckpoint: boolean) => {
      let supervisor: ReturnType<typeof createWorkerSupervisor>;
      supervisor = createWorkerSupervisor({entryPath: resolve("../ai-worker/dist/execution-worker.cjs"), ports: {
        async validate(ref, mode) {await leases.withLease(ref, mode, async () => {});},
        async invoke(ref, port: WorkerPort, raw) {
          if (port === "readTaskContext") return workerCalls.readTaskContext(ref);
          if (port === "resolveModelCredential") return modelSpec;
          if (port === "readCheckpoint") return checkpoints.read(ref);
          if (port === "saveCheckpoint") return checkpoints.save(ref, raw);
          if (port === "reserveGenerationCall") return generation.reserveGenerationCall(ref, raw);
          if (port === "startCall") return workerCalls.startCall(ref, raw);
          if (port === "settleGenerationCall") return generation.settleGenerationCall(ref, raw);
          if (port === "appendStreamEvents") return streams.append(ref, raw);
          if (port === "reserveAgenticTool") return chatTools.reserve(ref, raw);
          if (port === "startAgenticTool") return chatTools.start(ref, raw);
          if (port === "executeAgenticTool") return chatTools.execute(ref, raw);
          if (port === "settleAgenticTool") return chatTools.settle(ref, raw);
          if (port === "checkChatToolApproval") return chatTools.check(ref, raw);
          if (port === "readWorkbenchPlan") {
            const status = await plans.status(ref, raw);
            if (pauseAtCheckpoint) {
              pauseAtCheckpoint = false;
              safeCheckpoint = await checkpoints.read(ref);
              expect(safeCheckpoint.recovery).toBe("ready");
              expect(safeCheckpoint.pendingCalls).toHaveLength(0);
              expect(safeCheckpoint.ledgerSequence).toBe(5);
              expect(safeCheckpoint.messages.map(message => message.role)).toEqual(["assistant", "tool", "assistant", "tool", "assistant"]);
              await tasks.command(owner, {taskIds: [submission.executionTaskId], command: "pause", idempotencyKey: "safe-pause"});
              supervisor.cancel(ref);
            }
            return status;
          }
          if (port === "commitChatResult") return replies.commitResult(ref, raw);
          if (port === "resolveChatFallbackCredential") return null;
          if (port === "heartbeat") return tasks.heartbeat({taskId: ref.executionTaskId, workerId: ref.attempt === firstRef.attempt ? "restart-worker-1" : "restart-worker-2", attempt: ref.attempt});
          throw new Error(`unexpected worker port: ${port}`);
        },
      }});
      return supervisor;
    };
    const firstWorker = makeSupervisor(true);
    let secondWorker: ReturnType<typeof createWorkerSupervisor> | undefined;
    try {
      expect(await firstWorker.run(firstRef, Date.now() + 15_000)).toBe("cancelled");
      expect(safeCheckpoint).toMatchObject({recovery: "ready"});
      expect(supplierCalls).toBe(3);
      expect(externalCalls).toBe(1);
      const before = (await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, submission.executionTaskId))).sort((a, b) => a.sequence - b.sequence);
      expect(before.map(call => call.status)).toEqual(Array(5).fill("settled"));
      const originalTool = before.filter(call => call.kind === "tool").at(-1)!;
      const spentBefore = before.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0);
      expect(spentBefore).toBe(15);
      expect((await ledger.inspect(firstRef)).spentTokens).toBe(spentBefore);
      await firstWorker.stop();
      await tasks.acknowledgeControl({taskId: submission.executionTaskId, workerId: "restart-worker-1", attempt: firstRef.attempt});
      await tasks.command(owner, {taskIds: [submission.executionTaskId], command: "resume", idempotencyKey: "safe-resume"});
      const nextClaim = await tasks.claimTask({taskId: submission.executionTaskId, workerId: "restart-worker-2"});
      if (!nextClaim) throw new Error("second claim missing");
      const nextRef: ExecutionRef = {executionTaskId: submission.executionTaskId, attempt: nextClaim.lease.attempt, fenceToken: nextClaim.lease.fenceToken};
      expect(nextRef.executionTaskId).toBe(firstRef.executionTaskId);
      expect(nextRef.attempt).toBeGreaterThan(firstRef.attempt);
      expect(nextRef.fenceToken).not.toBe(firstRef.fenceToken);
      expect((await checkpoints.read(nextRef)).recovery).toBe("ready");
      secondWorker = makeSupervisor(false);
      expect(await secondWorker.run(nextRef, Date.now() + 15_000)).toBe("completed");
      const after = (await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, submission.executionTaskId))).sort((a, b) => a.sequence - b.sequence);
      expect(after.slice(0, before.length)).toEqual(before);
      expect(after.every(call => call.status === "settled")).toBe(true);
      expect(after.map(call => call.operationKey)).toEqual([...before.map(call => call.operationKey), `${input.operationKey}/model/4`, expect.any(String), `${input.operationKey}/model/5`]);
      expect(new Set(after.map(call => call.operationKey)).size).toBe(after.length);
      expect(after.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0)).toBe(spentBefore + 10);
      expect(after.find(call => call.id === originalTool.id)?.resultText).toBe(originalTool.resultText);
      expect((await plans.read(owner, submission.executionTaskId))?.steps[0]).toMatchObject({status: "succeeded", operationRefs: [originalTool.id]});
      expect(supplierCalls).toBe(5);
      expect(externalCalls).toBe(1);
      const [task] = await db.select().from(executionTasks).where(eq(executionTasks.id, submission.executionTaskId));
      expect(task?.status).toBe("succeeded");
    } finally {
      await Promise.allSettled([firstWorker.stop(), secondWorker?.stop()]);
      server.closeAllConnections();
      await new Promise<void>(done => server.close(() => done()));
    }
  }, 30_000);
});
