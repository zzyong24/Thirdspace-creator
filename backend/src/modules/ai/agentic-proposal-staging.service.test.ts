import { describe, it, expect } from "vitest";
import { createDb, aiTasks, aiTaskResults, knowledgeItems, executionTasks, eq } from "@creatoros/backend";
import { createAgenticProposalStagingService } from "./agentic-proposal-staging.service";
import { createExecutionAuthorityService } from "../execution/execution-authority.service";
import { createPersistentTaskService } from "../execution/persistent-task.service";
const ctx = {userId:"u",accountId:"a",requestId:"r",source:"user" as const};
const input = {kind:"knowledge.create" as const,toolCallId:"call",title:"标题",note:"正文",sourceNote:"https://example.com",evidenceRefs:["https://example.com"]};
async function setup(){
  const fixture=await createDb();
  await fixture.db.insert(aiTasks).values({id:"parent",userId:"u",accountId:"a",taskType:"exec.agentic.research",status:"running",idempotencyKey:"task",requestedAt:new Date().toISOString(),leaseToken:"lease",leaseExpiresAt:"2099-01-01T00:00:00.000Z"});
  return fixture;
}
describe("自主候选staging持久回执与执行权",()=>{
  it("稳定调用重放同一候选、不同内容拒绝，采纳前无知识写入",async()=>{
    const f=await setup();try{
      const stage=createAgenticProposalStagingService(f.db,{resolveLease:()=>({leaseToken:"lease"}),prepareAssets:async()=>[]});
      const first=await stage.stage(ctx,"parent",input,new AbortController().signal);
      expect(await stage.stage(ctx,"parent",input,new AbortController().signal)).toEqual(first);
      await expect(stage.stage(ctx,"parent",{...input,note:"改写"},new AbortController().signal)).rejects.toThrow("不同候选");
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(1);
      expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
      await expect(stage.stage({...ctx,accountId:"other"},"parent",input,new AbortController().signal)).rejects.toThrow();
    }finally{await f.client.close();}
  });
  it("同running任务被新租约接管后，旧执行不能追加回执",async()=>{
    const f=await setup();try{
      const stage=createAgenticProposalStagingService(f.db,{resolveLease:()=>({leaseToken:"lease"}),prepareAssets:async()=>{
        await f.db.update(aiTasks).set({leaseToken:"new-lease"}).where(eq(aiTasks.id,"parent"));
        return [{assetId:"a1",expectedVersion:"snapshot"}];
      }});
      await expect(stage.stage(ctx,"parent",{kind:"asset.tags",toolCallId:"call",assetIds:["a1"],tag:"标签",evidenceRefs:["a1"]},new AbortController().signal)).rejects.toThrow("执行权");
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(0);
    }finally{await f.client.close();}
  });
  it("准备期间取消，事务门阻止回执写入",async()=>{
    const f=await setup();try{
      const abort=new AbortController();
      const stage=createAgenticProposalStagingService(f.db,{resolveLease:()=>({leaseToken:"lease"}),prepareAssets:async()=>{abort.abort();return [{assetId:"a1",expectedVersion:"snapshot"}];}});
      await expect(stage.stage(ctx,"parent",{kind:"asset.tags",toolCallId:"call",assetIds:["a1"],tag:"标签",evidenceRefs:["a1"]},abort.signal)).rejects.toThrow();
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(0);
    }finally{await f.client.close();}
  });
});

async function mappedSetup() {
  const f = await createDb();
  await f.db.insert(aiTasks).values({ id: "mapped", userId: "u", accountId: "a", taskType: "exec.agentic.research", status: "queued", idempotencyKey: "mapped", requestedAt: new Date().toISOString() });
  const mapped = await createExecutionAuthorityService(f.db).bindAiTask(ctx, "mapped");
  const tasks = createPersistentTaskService(f.db);
  const claim = await tasks.claimTask({ taskId: mapped.executionTaskId, workerId: "worker" });
  if (!claim) throw new Error("missing claim");
  return { ...f, tasks, ref: { executionTaskId: mapped.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken } };
}

describe("映射执行凭证的候选staging", () => {
  it("不依赖ALS，真实任务上下文生成稳定候选，并发重放同一回执且变参拒绝", async () => {
    const f = await mappedSetup();
    try {
      const service = createAgenticProposalStagingService(f.db, { resolveLease: () => { throw new Error("不能读取旧ALS"); }, prepareAssets: async (actualContext, ids) => {
        expect(actualContext).toMatchObject({ userId: "u", accountId: "a", source: "ai" });
        return ids.map(assetId => ({ assetId, expectedVersion: "snapshot" }));
      } });
      const proposalInput = { kind: "asset.tags" as const, toolCallId: "mapped-call", assetIds: ["asset"], tag: "标签", evidenceRefs: ["asset"] };
      const [first, replay] = await Promise.all([service.stageForExecution(f.ref, proposalInput, new AbortController().signal), service.stageForExecution(f.ref, proposalInput, new AbortController().signal)]);
      expect(replay).toEqual(first);
      expect(first.source).toMatchObject({ taskId: "mapped", toolCallId: "mapped-call" });
      await expect(service.stageForExecution(f.ref, { ...proposalInput, tag: "变参" }, new AbortController().signal)).rejects.toThrow("不同候选");
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(1);
      expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
      await expect(service.stageForExecution({ ...f.ref, fenceToken: "stale" }, proposalInput, new AbortController().signal)).rejects.toThrow();
    } finally { await f.client.close(); }
  });

  it.each(["fence", "cancel", "owner", "mapping", "signal"] as const)("准备期间%s改变，最终事务拒绝写候选", async change => {
    const f = await mappedSetup();
    try {
      const abort = new AbortController();
      const service = createAgenticProposalStagingService(f.db, { resolveLease: () => { throw new Error("不能读取旧ALS"); }, prepareAssets: async () => {
        if (change === "fence") await f.db.update(executionTasks).set({ fenceToken: "next-fence" }).where(eq(executionTasks.id, f.ref.executionTaskId));
        if (change === "cancel") await f.tasks.command(ctx, { taskIds: [f.ref.executionTaskId], command: "cancel", idempotencyKey: "cancel" });
        if (change === "owner") await f.db.update(aiTasks).set({ accountId: "other" }).where(eq(aiTasks.id, "mapped"));
        if (change === "mapping") await f.db.update(aiTasks).set({ executionTaskId: null }).where(eq(aiTasks.id, "mapped"));
        if (change === "signal") abort.abort();
        return [{ assetId: "asset", expectedVersion: "snapshot" }];
      } });
      await expect(service.stageForExecution(f.ref, { kind: "asset.tags", toolCallId: "call", assetIds: ["asset"], tag: "标签", evidenceRefs: ["asset"] }, abort.signal)).rejects.toThrow();
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(0);
    } finally { await f.client.close(); }
  });

  it("映射知识候选仅暂存，业务取消后连既有回执也不能从该入口重放", async () => {
    const f = await mappedSetup();
    try {
      const service = createAgenticProposalStagingService(f.db, { resolveLease: () => { throw new Error("不能读取旧ALS"); }, prepareAssets: async () => [] });
      const first = await service.stageForExecution(f.ref, input, new AbortController().signal);
      expect(await service.stageForExecution(f.ref, input, new AbortController().signal)).toEqual(first);
      expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
      await f.db.update(aiTasks).set({ status: "cancelled" }).where(eq(aiTasks.id, "mapped"));
      await expect(service.stageForExecution(f.ref, input, new AbortController().signal)).rejects.toThrow();
      expect(await f.db.select().from(aiTaskResults)).toHaveLength(1);
    } finally { await f.client.close(); }
  });
});
