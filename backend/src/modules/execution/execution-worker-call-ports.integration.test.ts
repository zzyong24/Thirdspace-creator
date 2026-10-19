import { createExecutionStreamService } from "./execution-stream.service";
import { createExecutionCheckpointService } from "./execution-checkpoint.service";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, aiTasks, aiTaskResults, executionTasks, eq, type Db } from "@creatoros/backend";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createWorkerSupervisor } from "./worker-supervisor";
import { createExecutionAuthorityService } from "./execution-authority.service";
import { createExecutionCandidateService } from "../ai/execution-candidate.service";
import {workerPortInputSchemas} from "@creatoros/contract/execution-worker";
const ctx = {userId:"worker-ledger",accountId:"worker-ledger",requestId:"test",source:"user" as const};
const modelInput = {kind:"model.generate",prompt:"写正文",capability:"script",maxOutputTokens:128,operationKey:"generate"};
const deps = {budget:{maxCalls:3,maxTokens:10000,deadlineMs:180000}};
describe("真实 Worker 与后端持久调用端口", () => {
  let db:Db; let close:()=>Promise<void>;
  beforeAll(async()=>{
    const connection=await createDb(); db=connection.db;close=()=>connection.client.close();
    execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe",timeout:180000});
  },180000);
  afterAll(async()=>close?.());
  async function fixture(id:string){
    const tasks=createPersistentTaskService(db);
    await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"script.draft",idempotencyKey:id,requestedAt:new Date().toISOString()});
    const mapped=await createExecutionAuthorityService(db).bindAiTask(ctx,id);
    // 测试固定输入；生产输入快照由业务适配器准备，本测试不声称已覆盖该入口。
    await db.update(executionTasks).set({payload:{modelInput}}).where(eq(executionTasks.id,mapped.executionTaskId));
    const task={id:mapped.executionTaskId};
    const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("missing claim");
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    return {ref,tasks,ports:createExecutionWorkerCallPorts(db,deps),ledger:createExecutionCallLedgerService(db,deps)};
  }
  it.each([false,true])("真实进程检查点恢复不重放供应商（缺少usage=%s）",async(unknownUsage)=>{
    const id=`real-child-${unknownUsage}`;
    const f=await fixture(id);
    let requests=0;let startedBeforeRequest=false;const committedTexts:string[]=[];let failCommit=true;
    const server=createServer(async(req,res)=>{
      requests++;req.resume();
      const state=await f.ledger.inspect(f.ref);startedBeforeRequest=state.calls[0]?.status==="started";
      res.writeHead(200,{"content-type":"text/event-stream"});
      const response='data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"正文"},"finish_reason":null}]}\n\ndata: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n';
      res.end(unknownUsage ? response.replace(',"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}', '') : response);
    });
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
    const address=server.address() as {port:number};
    const leases=createExecutionLeaseService(db);
    const checkpoints=createExecutionCheckpointService(db);
    const streams=createExecutionStreamService(db);
    const checkpointReads:Array<{attempt:number;revision:number;messageIds:string[]}>=[];
    let saves=0;const invokedPorts:string[]=[];const failureReports:unknown[]=[];const candidateOwnerInputs:unknown[]=[];
    const candidates=createExecutionCandidateService(db,{projectCandidate(_ctx,input){return {resultType:"artifact_version",artifactId:"fixture-artifact",resultData:{body:input.text}};}});
    const supervisor=createWorkerSupervisor({entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),ports:{
      async validate(ref,mode){await leases.withLease(ref,mode,async()=>{});},
      async invoke(ref,port,data){
        invokedPorts.push(port);
        if(port==="appendStreamEvents")return streams.append(ref,data);
        if(port==="readCheckpoint") {
          const result=await checkpoints.read(ref);
          checkpointReads.push({attempt:ref.attempt,revision:result.revision,messageIds:result.messages.map(m=>m.callId)});
          return result;
        }
        if(port==="saveCheckpoint"){saves++;return checkpoints.save(ref,data);}
        if(port==="readTaskContext")return f.ports.readTaskContext(ref);
        if(port==="reserveCall")return f.ports.reserveCall(ref,data);
        if(port==="startCall")return f.ports.startCall(ref,data);
        if(port==="settleCall")return f.ports.settleCall(ref,data);
        if(port==="resolveModelCredential")return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${address.port}/v1`,model:"test",token:"fixture"};
        // 第一次模拟候选提交前中断，第二次走真实业务候选事务。
        if(port==="commitResult") {
          const input=workerPortInputSchemas.commitResult.parse(data);
          if(input.outcome!=="succeeded"){
            // 本fixture只装配成功候选owner；失败状态通报真实记录并明确拒绝，不伪提交正文或吞掉IPC事实。
            failureReports.push(data);console.info("T1253_USAGE_FAILURE_STATUS_REPORT",JSON.stringify({executionTaskId:ref.executionTaskId,attempt:ref.attempt,report:data,candidateOwnerCallCount:candidateOwnerInputs.length}));throw new Error("FIXTURE_FAILURE_STATUS_REPORT_RECORDED_CANDIDATE_OWNER_NOT_CALLED");
          }
          if(failCommit){failCommit=false;throw new Error("SIMULATED_COMMIT_FAILURE");}
          committedTexts.push(input.text);candidateOwnerInputs.push(data);return candidates.commitResult(ref,data);
        }
        throw new Error("UNEXPECTED_PORT");
      },
    }});
    try{
      expect(await supervisor.run(f.ref,Date.now()+180000)).toBe("unknown_result");
      expect(startedBeforeRequest).toBe(true);expect(requests).toBe(1);
      expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(unknownUsage ? null : 5);
      const saved=await checkpoints.read(f.ref);
      expect(saved.revision).toBe(1);expect(saved.messages).toHaveLength(1);
      expect(saved.messages[0]).toMatchObject({role:"assistant",resultText:"正文"});
      expect(saved.recovery).toBe(unknownUsage ? "requires_reconciliation" : "ready");
      await supervisor.stop();
      await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"pause",idempotencyKey:"pause-after-crash-"+f.ref.executionTaskId});
      await f.tasks.acknowledgeControl({taskId:f.ref.executionTaskId,workerId:"worker",attempt:f.ref.attempt});
      await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"resume",idempotencyKey:"resume-after-crash-"+f.ref.executionTaskId});
      const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"worker-restarted"});
      if(!claim)throw new Error("missing resumed claim");
      f.ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
      const beforeRestart=await f.ledger.inspect(f.ref),beforeRestartPorts=invokedPorts.length;
      const [businessBeforeRestart]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));
      expect(businessBeforeRestart).toBeDefined();expect(businessBeforeRestart?.executionTaskId).toBe(f.ref.executionTaskId);
      expect(await supervisor.run(f.ref,Date.now()+180000)).toBe(unknownUsage?"unknown_result":"completed");
      expect(committedTexts).toEqual(unknownUsage?[]:["正文"]);
      if(unknownUsage){
        const afterRestart=await f.ledger.inspect(f.ref);expect(afterRestart.calls).toEqual(beforeRestart.calls);expect(afterRestart.spentTokens).toBeNull();expect(afterRestart.unknownUsage).toBe(true);
        expect(invokedPorts.slice(beforeRestartPorts).filter(port=>["reserveCall","startCall","settleCall","saveCheckpoint"].includes(port))).toEqual([]);
        expect(invokedPorts.slice(beforeRestartPorts).filter(port=>port==="commitResult")).toHaveLength(1);expect(failureReports).toStrictEqual([{outcome:"unknown_result",errorCode:"CHECKPOINT_REQUIRES_RECONCILIATION",retryAfterMs:undefined}]);expect(candidateOwnerInputs).toEqual([]);
        const stillSaved=await checkpoints.read(f.ref);expect(stillSaved).toEqual(saved);
      }
      expect(requests).toBe(1);expect(saves).toBe(1);
      expect(checkpointReads.find(read=>read.attempt===f.ref.attempt)).toEqual({attempt:f.ref.attempt,revision:1,messageIds:[saved.messages[0]!.callId]});
      const results=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,id));
      if(unknownUsage){
        expect(results).toHaveLength(0);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,id)))[0]?.status).toBe(businessBeforeRestart?.status);
      }else{
        expect(failureReports).toEqual([]);expect(results).toHaveLength(1);expect(results[0]?.resultData).toEqual({body:"正文"});
        expect((await db.select().from(aiTasks).where(eq(aiTasks.id,id)))[0]?.status).toBe("awaiting_confirmation");
      }
      expect(requests).toBe(1);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
    }finally{await supervisor.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },180000);
  it("Worker 自报操作键或额度不符时拒绝预留",async()=>{
    const f=await fixture("tampered");
    await expect(f.ports.reserveCall(f.ref,{operationKey:"other",maxOutputTokens:128})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:1})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(0);
  });
});
