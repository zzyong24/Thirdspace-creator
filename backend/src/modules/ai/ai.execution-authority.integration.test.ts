import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { aiTasks, createDb, eq, executionTasks, type Db } from "@creatoros/backend";
import { createAiRepository } from "./ai.repository";
import { createExecutionAuthorityService } from "../execution/execution-authority.service";

const ctx = {userId: "authority-user", accountId: "authority-account", requestId: "test", source: "user" as const};
const stamp = "2026-09-05T00:00:00.000Z";

describe("T-915 唯一执行权映射", () => {
  let db: Db;
  let close: () => Promise<void>;
  let migrateAgain: () => Promise<unknown>;
  beforeAll(async () => {
    const connection = await createDb(); db = connection.db;
    close = () => connection.client.close();
    migrateAgain = () => connection.client.exec(readFileSync(new URL("../../../drizzle/0069_execution_authority_mapping.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => close?.());
  async function seed(id: string, status = "queued") {
    await db.insert(aiTasks).values({id, userId: ctx.userId, accountId: ctx.accountId, taskType: "script.draft", status,
      idempotencyKey: id, requestedAt: stamp, inputData: {prompt: "正文"}});
  }
  function repo() {
    return createAiRepository(db, {userId: ctx.userId, accountId: ctx.accountId, now: () => stamp, nextId: p => p+Math.random()});
  }
  it("并发绑定只有一个执行，业务ID稳定，旧claim与旧sweep均忽略映射任务", async () => {
    await seed("mapped");
    const service = createExecutionAuthorityService(db, {now: () => stamp});
    const [first, replay] = await Promise.all([service.bindAiTask(ctx, "mapped"), service.bindAiTask(ctx, "mapped")]);
    expect(replay).toEqual(first);
    expect(first.aiTaskId).toBe("mapped");
    expect(await repo().claimAiTaskExecution("mapped", {workerId: "legacy", leaseToken: "legacy", leaseSeconds: 60})).toBeNull();
    await db.update(aiTasks).set({status: "running"}).where(eq(aiTasks.id, "mapped"));
    expect(await repo().listRunningTasksSystem()).toEqual([]);
    const rows = await db.select().from(executionTasks).where(eq(executionTasks.ownerId, "mapped"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({userId: ctx.userId, accountId: ctx.accountId, kind: "ai_task", ownerType: "ai_task"});
  });
  it("跨账号与运行中旧任务不能被无证据转交，历史完成结果不重排", async () => {
    await seed("other-account"); await seed("legacy-running", "running"); await seed("historical", "succeeded");
    const service = createExecutionAuthorityService(db, {now: () => stamp});
    await expect(service.bindAiTask({...ctx, accountId: "other"}, "other-account")).rejects.toMatchObject({name: "OwnershipError"});
    await expect(service.bindAiTask(ctx, "legacy-running")).rejects.toMatchObject({name: "ConflictError"});
    await expect(service.bindAiTask(ctx, "historical")).rejects.toMatchObject({name: "ConflictError"});
    expect((await db.select().from(aiTasks).where(eq(aiTasks.id, "historical")))[0]?.status).toBe("succeeded");
  });
  it("绑定与旧claim竞争时只能一方获得执行权", async () => {
    await seed("claim-race");
    const service = createExecutionAuthorityService(db, {now: () => stamp});
    const [binding, claim] = await Promise.allSettled([
      service.bindAiTask(ctx, "claim-race"),
      repo().claimAiTaskExecution("claim-race", {workerId: "legacy", leaseToken: "race", leaseSeconds: 60}),
    ]);
    expect(claim.status).toBe("fulfilled");
    if (binding.status === "fulfilled") expect(claim).toMatchObject({value: null});
    else expect(claim).toMatchObject({value: {task: {id: "claim-race"}}});
  });
  it.each(["modelCallStartedAt", "leaseToken"] as const)("queued 但有 %s 的提交或租约事实时不重排", async field => {
    const id = `residual-${field}`;
    await seed(id);
    await db.update(aiTasks).set({[field]: field === "modelCallStartedAt" ? stamp : "residual-lease"}).where(eq(aiTasks.id, id));
    await expect(createExecutionAuthorityService(db).bindAiTask(ctx, id)).rejects.toMatchObject({name: "ConflictError"});
    expect(await db.select().from(executionTasks).where(eq(executionTasks.ownerId, id))).toHaveLength(0);
  });
  it("已有映射的归属或owner被改变时拒绝回读", async () => {
    await seed("invalid-owner");
    const service = createExecutionAuthorityService(db);
    const mapped = await service.bindAiTask(ctx, "invalid-owner");
    await db.update(executionTasks).set({accountId: "wrong-account"}).where(eq(executionTasks.id, mapped.executionTaskId));
    await expect(service.bindAiTask(ctx, "invalid-owner")).rejects.toMatchObject({name: "ConflictError"});
    await db.update(executionTasks).set({accountId: ctx.accountId, ownerId: "wrong-owner"}).where(eq(executionTasks.id, mapped.executionTaskId));
    await expect(service.bindAiTask(ctx, "invalid-owner")).rejects.toMatchObject({name: "ConflictError"});
  });
  it("迁移重复运行保留映射与历史状态，数据库禁止两个业务任务映射同一执行", async () => {
    await seed("mapped-migration"); await seed("historical-migration", "succeeded");
    const service = createExecutionAuthorityService(db, {now: () => stamp});
    const mapped = await service.bindAiTask(ctx, "mapped-migration");
    await migrateAgain(); await migrateAgain();
    expect(await service.bindAiTask(ctx, "mapped-migration")).toEqual(mapped);
    await seed("duplicate-map");
    await expect(db.update(aiTasks).set({executionTaskId: mapped.executionTaskId}).where(eq(aiTasks.id, "duplicate-map"))).rejects.toThrow();
    expect((await repo().requireTask("historical-migration")).status).toBe("succeeded");
    expect((await repo().requireTask("duplicate-map")).executionTaskId).toBeNull();
  });
  it("旧入口的未映射快照失效后不能写候选，绑定与旧候选写入只能一方获胜", async () => {
    await seed("candidate-stale");
    expect((await repo().requireTask("candidate-stale")).executionTaskId).toBeNull();
    await createExecutionAuthorityService(db,{now:()=>stamp}).bindAiTask(ctx,"candidate-stale");
    const candidate={resultType:"artifact_version",artifactId:null,knowledgeItemId:null,assetId:null,resultData:{body:"正文"}};
    expect(await repo().recordCandidateUnmapped("candidate-stale",candidate)).toBeNull();
    expect(await repo().listResults("candidate-stale")).toHaveLength(0);
    for(let i=0;i<10;i++){
      const id=`candidate-race-${i}`;await seed(id);
      const [binding,writing]=await Promise.allSettled([
        createExecutionAuthorityService(db,{now:()=>stamp}).bindAiTask(ctx,id),repo().recordCandidateUnmapped(id,candidate),
      ]);
      if(binding.status === "fulfilled"){
        expect(writing).toMatchObject({status:"fulfilled",value:null});expect(await repo().listResults(id)).toHaveLength(0);
      }else{
        expect(writing).toMatchObject({status:"fulfilled",value:{status:"awaiting_confirmation"}});expect(await repo().listResults(id)).toHaveLength(1);
      }
    }
  });

  it("冻结准备输入与原指纹绑定，重复绑定不改预算或原截止时间",async()=>{
    await seed("prepared");const service=createExecutionAuthorityService(db,{now:()=>"2026-09-05T00:00:10.000Z"});
    const prepared={requestFingerprint:"sha256:"+"0".repeat(64),modelInput:{kind:"model.generate" as const,operationKey:"generate",prompt:"正文",capability:"script",maxOutputTokens:128},budget:{maxCalls:3,maxTokens:10000,deadlineMs:120000}};
    await expect(service.bindAiTask(ctx,"prepared",{...prepared,requestFingerprint:"sha256:"+"1".repeat(64)})).rejects.toMatchObject({name:"ConflictError"});
    const mapped=await service.bindAiTask(ctx,"prepared",prepared);
    expect(await service.bindAiTask(ctx,"prepared",prepared)).toEqual(mapped);
    expect((await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]?.deadlineAt).toBe("2026-09-05T00:02:00.000Z");
    await expect(service.bindAiTask(ctx,"prepared",{...prepared,modelInput:{...prepared.modelInput,prompt:"改写输入"}})).rejects.toMatchObject({name:"ConflictError"});
    await expect(service.bindAiTask(ctx,"prepared",{...prepared,budget:{...prepared.budget,maxCalls:99}})).rejects.toMatchObject({name:"ConflictError"});
  });

});
