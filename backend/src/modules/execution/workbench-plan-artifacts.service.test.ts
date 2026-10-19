import {afterAll, beforeAll, expect, it} from "vitest";
import {createHash, randomUUID} from "node:crypto";
import {createDb, eq, executionTasks, type Db} from "@creatoros/backend";
import type {WorkbenchPlan} from "@creatoros/contract/agent-workbench";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchArtifactService} from "./workbench-artifact.service";
import {createWorkbenchPlanService} from "./workbench-plan.service";

let db: Db, close: () => Promise<void>;
beforeAll(async () => {const opened = await createDb(); db = opened.db; close = () => opened.client.close();});
afterAll(async () => close?.());
const now = () => "2026-09-21T00:00:00.000Z";
const step = (artifactRefs: string[] = [], status: WorkbenchPlan["steps"][number]["status"] = "succeeded") =>
  ({stepId: "report", title: "核对报告", dependsOn: [], status, operationRefs: [], artifactRefs});

// 只用于释放红测夹具：超时必须报错，事务回滚后等待真实核验排空，不遗留被锁住的根查询。
async function bounded<T>(work: PromiseLike<T>, label: string, ms = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 未及时完成（PGlite 自锁回归）`)), ms);
    })]);
  } finally {clearTimeout(timer!);}
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {release = resolve;});
  return {promise, release};
}
async function fixture() {
  const id = randomUUID(), ctx = {userId: id, accountId: id, requestId: id, source: "user" as const};
  const tasks = createPersistentTaskService(db, {now});
  const task = await tasks.enqueue(ctx, {kind: "ai_task", ownerType: "ai_task", ownerId: id, idempotencyKey: id, payload: {source: "preserve"}});
  const claim = (await tasks.claimTask({taskId: task.id, workerId: id}))!;
  const ref = {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken};
  const bytes = Buffer.from("报告：已核对的真实字节");
  const blobs = new Map<string, Uint8Array>();
  let registered = false;
  let onRead = async () => {}, onVerify = async () => {};
  const artifacts = createWorkbenchArtifactService(db, {now,
    readTaskFile: async () => ({bytes, version: 1}),
    blobs: {
      async submit(_ctx, input) {
        const hash = createHash("sha256").update(input.bytes).digest("hex");
        blobs.set(`${input.operationId}:${hash}`, input.bytes.slice());
        return {hash, size: input.bytes.byteLength};
      },
      async read(_ctx, input) {
        // 模拟真实 Blob 端口读取存储配置所需的同库查询，不能在租约事务里执行。
        if (registered) await db.select({id: executionTasks.id}).from(executionTasks).where(eq(executionTasks.id, task.id));
        await onRead();
        const value = blobs.get(`${input.operationId}:${input.hash}`);
        if (!value) throw new Error("BLOB_NOT_FOUND");
        return value.slice();
      },
    },
  });
  const artifact = await artifacts.register(ref, "report-artifact", {path: "report.md", mime: "text/markdown"});
  registered = true;
  const artifactRef = `${artifact.artifactId}@${artifact.version}`;
  const pending: Promise<boolean>[] = [];
  const plan = createWorkbenchPlanService(db, {now, async verifyArtifacts(scope, refs) {
    const work = (async () => {await onVerify(); return artifacts.verifyArtifacts(scope, refs);})();
    pending.push(work);
    return bounded(work, "真实产物核验");
  }});
  const readTask = async () => (await db.select().from(executionTasks).where(eq(executionTasks.id, task.id)))[0]!;
  return {ctx, task, tasks, ref, artifactRef, blobs, plan, readTask,
    onRead: (hook: () => Promise<void>) => {onRead = hook;},
    onVerify: (hook: () => Promise<void>) => {onVerify = hook;},
    drain: () => Promise.allSettled(pending),
  };
}

it("真实 PGlite 与 artifact service 保存非空产物引用，并发查询及时完成", async () => {
  const f = await fixture();
  try {
    const [saved, queried] = await Promise.all([
      f.plan.save(f.ref, {expectedRevision: 0, steps: [step([f.artifactRef])]}),
      bounded(f.readTask(), "并发任务查询"),
    ]);
    expect(queried.id).toBe(f.task.id);
    expect(saved).toEqual({planRevision: 1, steps: [step([f.artifactRef])]});
    expect(await f.plan.read(f.ctx, f.task.id)).toEqual(saved);
    expect((await f.readTask()).payload).toMatchObject({source: "preserve", workbenchPlan: saved});
  } finally {await f.drain();}
});

async function duringVerification(f: Awaited<ReturnType<typeof fixture>>, action: () => Promise<void>) {
  const entered = latch(), release = latch();
  f.onRead(async () => {entered.release(); await release.promise;});
  const result = f.plan.save(f.ref, {expectedRevision: 0, steps: [step([f.artifactRef])]})
    .then(value => ({value, error: undefined}), error => ({value: undefined, error}));
  try {
    await bounded(entered.promise, "进入真实字节核验");
    await action();
  } finally {
    release.release();
    await result;
    await f.drain();
  }
  return result;
}

it("字节读取被挂起时查询仍及时返回，释放后计划保存完成", async () => {
  const f = await fixture();
  const result = await duringVerification(f, async () => {
    expect(await bounded(f.plan.read(f.ctx, f.task.id), "慢 Blob 期间计划查询", 500)).toBeNull();
    expect((await bounded(f.readTask(), "慢 Blob 期间任务查询", 500)).status).toBe("running");
  });
  expect(result.error).toBeUndefined();
  expect(result.value?.planRevision).toBe(1);
});

it("核验期间另一保存赢得 CAS，迟到保存不覆盖新计划或其他载荷", async () => {
  const f = await fixture();
  const winner = {expectedRevision: 0, steps: [step([], "running")]};
  const result = await duringVerification(f, async () => {
    await bounded(createWorkbenchPlanService(db, {now}).save(f.ref, winner), "并发计划保存", 500);
  });
  expect(result.error).toMatchObject({name: "ConflictError"});
  expect(await f.plan.read(f.ctx, f.task.id)).toEqual({planRevision: 1, steps: winner.steps});
});

it.each(["pause", "fence", "expiry"])("核验期间租约发生 %s 变化，保存拒绝且不推进", async mode => {
  const f = await fixture();
  const result = await duringVerification(f, async () => {
    if (mode === "pause") await f.tasks.command(f.ctx, {taskIds: [f.task.id], command: "pause", idempotencyKey: "pause"});
    else await db.update(executionTasks).set(mode === "fence" ? {fenceToken: "new-fence"} : {leaseExpiresAt: now()}).where(eq(executionTasks.id, f.task.id));
  });
  expect(result.error).toMatchObject({name: "ConflictError"});
  expect(await f.plan.read(f.ctx, f.task.id)).toBeNull();
});

it.each(["hash", "size", "taskId", "mime", "operationId", "requestDigest", "removed"])("核验期间产物 %s 改变，即使原字节核验通过也拒绝保存", async field => {
  const f = await fixture();
  const result = await duringVerification(f, async () => {
    const payload = (await f.readTask()).payload as Record<string, unknown>;
    const versions = structuredClone(payload.workbenchArtifactVersions) as Array<{metadata: Record<string, unknown>; operationId: string; requestDigest: string}>;
    const row = versions[0]!;
    if (field === "removed") versions.splice(0);
    else if (field === "operationId") row.operationId = "another-operation";
    else if (field === "requestDigest") row.requestDigest = "b".repeat(64);
    else row.metadata[field] = field === "size" ? Number(row.metadata.size) + 1 : field === "hash" ? "a".repeat(64) : field === "mime" ? "text/csv" : "another-task";
    await db.update(executionTasks).set({payload: {...payload, workbenchArtifactVersions: versions}}).where(eq(executionTasks.id, f.task.id));
  });
  expect(result.error).toMatchObject({name: "ConflictError"});
  expect(await f.plan.read(f.ctx, f.task.id)).toBeNull();
});

it("快照之后、核验端口读库之前产物摘要改变，不能借新核验结果保存旧快照", async () => {
  const f = await fixture();
  f.onVerify(async () => {
    const payload = (await f.readTask()).payload as Record<string, unknown>;
    const versions = structuredClone(payload.workbenchArtifactVersions) as Array<{requestDigest: string}>;
    versions[0]!.requestDigest = "c".repeat(64);
    await db.update(executionTasks).set({payload: {...payload, workbenchArtifactVersions: versions}}).where(eq(executionTasks.id, f.task.id));
  });
  try {
    await expect(f.plan.save(f.ref, {expectedRevision: 0, steps: [step([f.artifactRef])]})).rejects.toMatchObject({name: "ConflictError"});
    expect(await f.plan.read(f.ctx, f.task.id)).toBeNull();
  } finally {await f.drain();}
});

it.each(["missing", "corrupt", "unknown-ref", "no-verifier"])("产物核验失败 %s 不推进计划", async mode => {
  const f = await fixture();
  const previous = await f.plan.save(f.ref, {expectedRevision: 0, steps: [step([], "running")]});
  if (mode === "missing") f.blobs.clear();
  if (mode === "corrupt") for (const [key, bytes] of f.blobs) f.blobs.set(key, new Uint8Array(bytes.length));
  const plan = mode === "no-verifier" ? createWorkbenchPlanService(db, {now}) : f.plan;
  try {
    await expect(plan.save(f.ref, {expectedRevision: 1, steps: [step([mode === "unknown-ref" ? "missing@1" : f.artifactRef])]})).rejects.toMatchObject({name: "ConflictError"});
    expect(await plan.read(f.ctx, f.task.id)).toEqual(previous);
  } finally {await f.drain();}
});

it("成功步骤不能改写，已有产物回执不能移除，幂等重试保留计划", async () => {
  const f = await fixture();
  try {
    const input = {expectedRevision: 0, steps: [step([f.artifactRef], "running")]};
    await f.plan.save(f.ref, input);
    await expect(f.plan.save(f.ref, {expectedRevision: 1, steps: [step([], "running")]})).rejects.toThrow("已有步骤回执不可移除");
    const success = {expectedRevision: 1, steps: [step([f.artifactRef])]};
    const saved = await f.plan.save(f.ref, success);
    f.blobs.clear();
    expect(await f.plan.save(f.ref, success)).toEqual(saved);
    await expect(f.plan.save(f.ref, {expectedRevision: 2, steps: [step([f.artifactRef], "running")]})).rejects.toThrow("已成功步骤及回执不可改写");
    await expect(f.plan.save(f.ref, {expectedRevision: 2, steps: [{...saved.steps[0]!, title: "改写"}]})).rejects.toThrow("已成功步骤及回执不可改写");
    expect(await f.plan.read(f.ctx, f.task.id)).toEqual(saved);
  } finally {await f.drain();}
});
