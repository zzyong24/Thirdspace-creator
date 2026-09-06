import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { aiTasks,aiTaskResults,aiTaskSteps,executionTasks,createDb,eq,type Db } from "@creatoros/backend";
import { createExecutionAuthorityService } from "../execution/execution-authority.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../execution/execution-call-ledger.service";
import { createExecutionCandidateService } from "./execution-candidate.service";
import { createAiRepository } from "./ai.repository";
const ctx={userId:"candidate-user",accountId:"candidate-account",requestId:"test",source:"user" as const};
const stamp="2026-09-05T00:00:00.000Z";const now=()=>stamp;
const projectCandidate=()=>({resultType:"artifact_version",artifactId:"fixture-artifact",resultData:{body:"持久正文"}});
describe("持久执行候选提交",()=>{
  let db:Db;let close:()=>Promise<void>;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
  async function fixture(id:string,taskType="script.draft"){
    await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType,idempotencyKey:id,requestedAt:stamp});
    const mapped=await createExecutionAuthorityService(db,{now}).bindAiTask(ctx,id);
    const tasks=createPersistentTaskService(db,{now});
    const claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"worker"});if(!claim)throw new Error("missing claim");
    const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:3,maxTokens:1000,deadlineMs:60000}});
    const call=await ledger.reserve(ref,{operationKey:"generate",kind:"model",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:100});
    await ledger.start(ref,call.id);await ledger.settle(ref,call.id,{status:"settled",usage:{totalTokens:5},resultText:"持久正文"});
    return {ref,tasks,ledger,call,commit:{outcome:"succeeded",callId:call.id,text:"持久正文"},service:createExecutionCandidateService(db,{now,projectCandidate})};
  }
  it("每日选题不能绕过自动入池端口变成普通待采纳候选",async()=>{
    const f=await fixture("daily-generic-port");
    await db.update(aiTasks).set({taskType:"scheduled.topic.daily"}).where(eq(aiTasks.id,"daily-generic-port"));
    await expect(f.service.commitResult(f.ref,f.commit)).rejects.toThrow("每日选题");
    expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"daily-generic-port"))).toHaveLength(0);
  });
  it("并发重投只写一个现有业务候选，采纳后的迟到回执不改回待采纳",async()=>{
    const f=await fixture("once");const [a,b]=await Promise.all([f.service.commitResult(f.ref,f.commit),f.service.commitResult(f.ref,f.commit)]);expect(a).toEqual(b);
    const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId,now,nextId:p=>p+Math.random()});
    expect(await repo.listResults("once")).toHaveLength(1);expect((await repo.requireTask("once")).status).toBe("awaiting_confirmation");
    expect((await f.tasks.get(ctx,f.ref.executionTaskId)).status).toBe("succeeded");
    await db.update(aiTasks).set({status:"succeeded"}).where(eq(aiTasks.id,"once"));
    expect(await f.service.commitResult(f.ref,f.commit)).toEqual(a);expect((await repo.requireTask("once")).status).toBe("succeeded");
  });
  it("取消后不能创建候选，持久正文仍保留供诊断",async()=>{
    const f=await fixture("cancel");await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
    await expect(f.service.commitResult(f.ref,f.commit)).rejects.toMatchObject({name:"ConflictError"});
    expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"cancel"))).toHaveLength(0);
    expect((await f.ledger.inspect(f.ref)).calls[0]?.resultText).toBe("持久正文");
  });
  it("格式投影失败完整回滚，不留下候选或伪成功",async()=>{
    const f=await fixture("rollback");const service=createExecutionCandidateService(db,{now,projectCandidate(){throw new Error("INVALID_CANDIDATE");}});
    await expect(service.commitResult(f.ref,f.commit)).rejects.toThrow("INVALID_CANDIDATE");
    expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"rollback"))).toHaveLength(0);
    expect((await f.tasks.get(ctx,f.ref.executionTaskId)).status).toBe("running");expect((await f.ledger.inspect(f.ref)).calls[0]?.resultRef).toBeNull();
  });
  it("拒绝正文替换、旧fence和错误归属映射",async()=>{
    const f=await fixture("ownership");
    await expect(f.service.commitResult(f.ref,{...f.commit,text:"伪造正文"})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.service.commitResult({...f.ref,fenceToken:"old"},f.commit)).rejects.toMatchObject({name:"ConflictError"});
    await db.update(executionTasks).set({accountId:"other"}).where(eq(executionTasks.id,f.ref.executionTaskId));
    await expect(f.service.commitResult(f.ref,f.commit)).rejects.toMatchObject({name:"ConflictError"});
  });
  it("诊断完成步骤与候选同事务写入，并发回执不重复",async()=>{
    const f=await fixture("diagnosis-step","calibration.diagnose");
    const service=createExecutionCandidateService(db,{now,projectCandidate:()=>({resultType:"calibration_diagnosis",resultData:{diagnosis:{dimensions:[{key:"persona",score:3}]}}})});
    await Promise.all([service.commitResult(f.ref,f.commit),service.commitResult(f.ref,f.commit)]);
    const steps=await db.select().from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId,"diagnosis-step"));
    expect(steps).toHaveLength(1);expect(steps[0]).toMatchObject({stepNo:1,kind:"step",text:"已生成编导诊断（1 维度评分）",toolCalls:[]});
  });

});
