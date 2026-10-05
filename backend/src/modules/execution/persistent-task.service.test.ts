import { describe, expect, it } from "vitest";

import { createDb, executionTasks, eq } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPersistentTaskService,
  type PersistentTaskService,
} from "./persistent-task.service";

const ctxA: RequestContext = {
  userId: "user-a",
  accountId: "account-a",
  requestId: "request-a",
  source: "user",
};
const ctxB: RequestContext = {
  userId: "user-a",
  accountId: "account-b",
  requestId: "request-b",
  source: "user",
};

function fixture(
  now = "2026-07-23T12:00:00.000Z",
): {
  clock: { value: string };
  nextId: (prefix: string) => string;
} {
  let serial = 0;
  const clock = { value: now };
  return {
    clock,
    nextId: (prefix) => `${prefix}-${++serial}`,
  };
}

async function enqueue(
  service: PersistentTaskService,
  ctx: RequestContext = ctxA,
  suffix = "one",
) {
  return service.enqueue(ctx, {
    kind: "source_sync",
    ownerType: "source",
    ownerId: `source-${suffix}`,
    idempotencyKey: `sync-${suffix}`,
    payload: { page: 1, sourceId: `source-${suffix}` },
    priority: 10,
    maxAttempts: 2,
  });
}

it("大量历史任务分页不会读出全部payload并破坏后续数据库查询", async () => {
 const {db,client}=await createDb();const service=createPersistentTaskService(db);
 try {
  const seed=await enqueue(service);
  const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,seed.id));
  for(let batch=0;batch<6;batch++)await db.insert(executionTasks).values(Array.from({length:50},(_,i)=>({...row!,id:`large-${batch}-${i}`,ownerId:`large-${batch}-${i}`,idempotencyKey:`large-${batch}-${i}`,payload:{content:"中文历史任务".repeat(5000)}})));
  await enqueue(service,ctxB,"other-account");
  const result=await service.list(ctxA,{limit:2,offset:1});
  expect(result.rows).toHaveLength(2);expect(result.total).toBe(301);
  expect((await client.query("select 1 as healthy")).rows).toEqual([{healthy:1}]);
 } finally {await client.close().catch(()=>{});}
},30000);

describe("T-482 持久执行任务状态机", () => {
  it("研究恢复水位不可由入队调用者注入，宿主恢复后原入队请求仍幂等",async()=>{
    const {db,client}=await createDb();const service=createPersistentTaskService(db);
    const input={kind:"ai_task" as const,ownerType:"ai_task" as const,ownerId:"research-resume",idempotencyKey:"research-resume",payload:{modelInput:{kind:"agentic.run",goal:"冻结目标"}}};
    try{
      await expect(service.enqueue(ctxA,{...input,payload:{...input.payload,researchBlockedAcknowledgedThroughSequence:999}})).rejects.toMatchObject({name:"ExecutionValidationError"});
      await expect(service.enqueue(ctxA,{...input,payload:{...input.payload,researchBlockedAcknowledgedCallIds:["forged"]}})).rejects.toMatchObject({name:"ExecutionValidationError"});
      const task=await service.enqueue(ctxA,input);
      await db.update(executionTasks).set({status:"waiting_user"}).where(eq(executionTasks.id,task.id));
      await service.command(ctxA,{taskIds:[task.id],command:"resume",idempotencyKey:"explicit-resume"});
      const [stored]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.id));
      expect(stored?.payload).toEqual({...input.payload,researchBlockedAcknowledgedThroughSequence:0,researchBlockedAcknowledgedCallIds:[]});
      expect((await service.enqueue(ctxA,input)).id).toBe(task.id);
      await expect(service.enqueue(ctxA,{...input,payload:{modelInput:{kind:"agentic.run",goal:"篡改目标"}}})).rejects.toMatchObject({name:"ConflictError"});
    }finally{await client.close();}
  });
  it("T-517:同一个 scheduled_job 同时至多一个活跃 automation_sync", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      await service.enqueue(ctxA, {
        kind: "automation_sync",
        ownerType: "scheduled_job",
        ownerId: "job-one",
        idempotencyKey: "job-one:tick-one",
        payload: { handler: "scheduled_collection" },
      });
      await expect(
        service.enqueue(ctxA, {
          kind: "automation_sync",
          ownerType: "scheduled_job",
          ownerId: "job-one",
          idempotencyKey: "job-one:tick-two",
          payload: { handler: "scheduled_collection" },
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
    } finally {
      await client.close();
    }
  });

  it("同账号幂等创建复用任务，幂等键同名但请求不同会拒绝", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const first = await enqueue(service);
      const same = await enqueue(service);
      expect(same.id).toBe(first.id);

      await expect(
        service.enqueue(ctxA, {
          kind: "source_sync",
          ownerType: "source",
          ownerId: "source-one",
          idempotencyKey: "sync-one",
          payload: { page: 2 },
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
    } finally {
      await client.close();
    }
  });

  it("并发 claim 只能有一个 worker 获得同一任务", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const task = await enqueue(service);
      const claims = await Promise.all([
        service.claimNext({ workerId: "worker-a", leaseSeconds: 30 }),
        service.claimNext({ workerId: "worker-b", leaseSeconds: 30 }),
      ]);
      const won = claims.filter((claim) => claim !== null);
      expect(won).toHaveLength(1);
      expect(won[0]?.task.id).toBe(task.id);
      expect(won[0]?.task.attempt).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("租约持有者可心跳和保存 checkpoint，旧 attempt 与其他 worker 均被拒绝", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      await enqueue(service);
      const claim = await service.claimNext({
        workerId: "worker-a",
        leaseSeconds: 30,
      });
      expect(claim).not.toBeNull();
      if (!claim) throw new Error("expected claim");

      f.clock.value = "2026-07-23T12:00:10.000Z";
      const heartbeat = await service.heartbeat({
        taskId: claim.task.id,
        workerId: "worker-a",
        attempt: claim.task.attempt,
        leaseSeconds: 30,
      });
      expect(heartbeat.heartbeatAt).toBe(f.clock.value);

      const saved = await service.saveCheckpoint({
        taskId: claim.task.id,
        workerId: "worker-a",
        attempt: claim.task.attempt,
        checkpoint: { cursor: "page-2" },
      });
      expect(saved.checkpoint).toEqual({ cursor: "page-2" });

      await expect(
        service.heartbeat({
          taskId: claim.task.id,
          workerId: "worker-b",
          attempt: claim.task.attempt,
          leaseSeconds: 30,
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
      await expect(
        service.saveCheckpoint({
          taskId: claim.task.id,
          workerId: "worker-a",
          attempt: 0,
          checkpoint: {},
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
    } finally {
      await client.close();
    }
  });

  it("暂停、恢复、取消与重试只允许合法迁移", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const task = await enqueue(service);
      const claim = await service.claimNext({
        workerId: "worker-a",
        leaseSeconds: 30,
      });
      if (!claim) throw new Error("expected claim");

      const [pauseRequested] = await service.command(ctxA, {
        taskIds: [task.id],
        command: "pause",
        idempotencyKey: "pause-1",
      });
      expect(pauseRequested?.status).toBe("pause_requested");

      const paused = await service.acknowledgeControl({
        taskId: task.id,
        workerId: "worker-a",
        attempt: claim.task.attempt,
      });
      expect(paused.status).toBe("paused");

      const [resumed] = await service.command(ctxA, {
        taskIds: [task.id],
        command: "resume",
        idempotencyKey: "resume-1",
      });
      expect(resumed?.status).toBe("queued");
      const [afterResume] = await db.select().from(executionTasks).where(eq(executionTasks.id, task.id));
      expect(afterResume?.payload).not.toHaveProperty("researchBlockedAcknowledgedThroughSequence");

      const [cancelled] = await service.command(ctxA, {
        taskIds: [task.id],
        command: "cancel",
        idempotencyKey: "cancel-1",
      });
      expect(cancelled?.status).toBe("cancelled");
      await expect(
        service.command(ctxA, {
          taskIds: [task.id],
          command: "retry",
          idempotencyKey: "retry-invalid",
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });

      const failedTask = await enqueue(service, ctxA, "failed");
      const failedClaim = await service.claimNext({
        workerId: "worker-a",
        leaseSeconds: 30,
      });
      if (!failedClaim || failedClaim.task.id !== failedTask.id) {
        throw new Error("expected failed task claim");
      }
      const failed = await service.finish({
        taskId: failedTask.id,
        workerId: "worker-a",
        attempt: failedClaim.task.attempt,
        status: "failed",
        errorCode: "UPSTREAM_TIMEOUT",
        errorMessage: "上游超时",
      });
      expect(failed).toMatchObject({
        status: "failed",
        errorCode: "UPSTREAM_TIMEOUT",
        errorMessage: "上游超时",
      });
      const [retried] = await service.command(ctxA, {
        taskIds: [failedTask.id],
        command: "retry",
        idempotencyKey: "retry-1",
      });
      expect(retried?.status).toBe("queued");
      const retryInput={taskIds:[failedTask.id],command:"retry" as const,idempotencyKey:"retry-1"};
      expect(await service.command(ctxA,retryInput)).toEqual([retried]);
      await expect(service.command(ctxA,{...retryInput,command:"cancel"})).rejects.toMatchObject({name:"ConflictError"});
      const secondClaim=await service.claimNext({workerId:"worker-a",leaseSeconds:30});
      if(!secondClaim||secondClaim.task.id!==failedTask.id)throw Error("重试原任务未被领取");
      await service.finish({taskId:failedTask.id,workerId:"worker-a",attempt:secondClaim.task.attempt,status:"failed",errorCode:"UPSTREAM_TIMEOUT",errorMessage:"再次超时"});
      expect(await service.command(ctxA,retryInput)).toEqual([retried]);
      expect((await service.get(ctxA,failedTask.id)).status).toBe("failed");
      await expect(service.command(ctxB,retryInput)).rejects.toMatchObject({name:"OwnershipError"});
    } finally {
      await client.close();
    }
  });

  it("批量命令先校验全部归属，混入跨账号任务时零写入", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const owned = await enqueue(service, ctxA, "owned");
      const foreign = await enqueue(service, ctxB, "foreign");

      await expect(
        service.command(ctxA, {
          taskIds: [owned.id, foreign.id],
          command: "cancel",
          idempotencyKey: "cancel-mixed",
        }),
      ).rejects.toMatchObject({ name: "OwnershipError" });

      expect((await service.get(ctxA, owned.id)).status).toBe("queued");
      expect((await service.get(ctxB, foreign.id)).status).toBe("queued");
    } finally {
      await client.close();
    }
  });

  it("启动恢复按重试预算重新入队，耗尽预算则失败", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const requeue = await enqueue(service, ctxA, "requeue");
      await service.claimNext({ workerId: "worker-a", leaseSeconds: 10 });

      const exhausted = await service.enqueue(ctxA, {
        kind: "transcribe",
        ownerType: "item",
        ownerId: "item-exhausted",
        idempotencyKey: "transcribe-exhausted",
        payload: {},
        maxAttempts: 1,
      });
      await service.claimNext({
        workerId: "worker-b",
        kinds: ["transcribe"],
        leaseSeconds: 10,
      });

      f.clock.value = "2026-07-23T12:00:11.000Z";
      const report = await service.recoverExpiredLeases();
      expect(report).toEqual({ requeued: 1, failed: 1, paused: 0, cancelled: 0, unknownResult: 0 });
      expect((await service.get(ctxA, requeue.id)).status).toBe("queued");
      expect((await service.get(ctxA, exhausted.id)).status).toBe("failed");

      const [row] = await db
        .select()
        .from(executionTasks)
        .where(eq(executionTasks.id, exhausted.id));
      expect(row?.lastErrorCode).toBe("LEASE_EXPIRED");
    } finally {
      await client.close();
    }
  });
});

it("领取过滤精确到用户和账号，剩余任务仍按真实优先级领取",async()=>{
 const {db,client}=await createDb();const tasks=createPersistentTaskService(db);
 try{
  const a=await enqueue(tasks,ctxA,'exclude-a');
  const b=await enqueue(tasks,ctxB,'lower-b');
  const other={...ctxA,userId:'other-user'};
  const high=await enqueue(tasks,other,'high-other-owner');
  await db.update(executionTasks).set({priority:50}).where(eq(executionTasks.id,high.id));
  const filter={workerId:'filtered',excludeAccounts:[{userId:ctxA.userId,accountId:ctxA.accountId!}]};
  expect((await tasks.claimNext(filter))?.task.id).toBe(high.id);
  expect((await tasks.claimNext(filter))?.task.id).toBe(b.id);
  expect(await tasks.claimNext(filter)).toBeNull();
  expect((await tasks.get(ctxA,a.id)).status).toBe('queued');
  await expect(tasks.claimNext({...filter,excludeAccounts:[{userId:ctxA.userId,accountId:''}]})).rejects.toThrow('完整属主');
 }finally{await client.close();}
});
