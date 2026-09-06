import { beforeAll, afterAll, it, expect } from "vitest";
import { createDb, executionTasks, eq, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionStreamService } from "./execution-stream.service";
const ctx = {
    userId: "stream-u",
    accountId: "stream-a",
    requestId: "test",
    source: "user" as const,
  },
  now = () => "2026-09-05T00:00:00.000Z";
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const f = await createDb();
  db = f.db;
  close = () => f.client.close();
});
afterAll(async () => close?.());
async function fixture(id: string) {
  const tasks = createPersistentTaskService(db, { now }),
    task = await tasks.enqueue(ctx, {
      kind: "ai_task",
      ownerType: "ai_task",
      ownerId: id,
      idempotencyKey: id,
      payload: {},
    }),
    claim = (await tasks.claimTask({ taskId: task.id, workerId: "w" }))!,
    ref = {
      executionTaskId: task.id,
      attempt: claim.lease.attempt,
      fenceToken: claim.lease.fenceToken,
    };
  const ledger = createExecutionCallLedgerService(db, {
      now,
      budget: { maxCalls: 5, maxTokens: 1000, deadlineMs: 60000 },
    }),
    call = await ledger.reserve(ref, {
      operationKey: "stream",
      kind: "model",
      inputDigest: "sha256:" + "a".repeat(64),
      reservedTokens: 100,
    });
  await ledger.start(ref, call.id);
  return {
    tasks,
    task,
    ref,
    ledger,
    call,
    stream: createExecutionStreamService(db, { now }),
  };
}
const chunk = (delta: string) => ({ type: "text-delta", id: "text", delta });
it("流事件同批并发重投幂等，重建服务按游标续读，展示finish不完成任务", async () => {
  const f = await fixture("once"),
    input = {
      callId: f.call.id,
      startIndex: 0,
      chunks: [chunk("甲"), chunk("乙")],
    };
  const [a, b] = await Promise.all([
    f.stream.append(f.ref, input),
    f.stream.append(f.ref, input),
  ]);
  expect(a).toEqual(b);
  expect(a).toEqual({ nextIndex: 2, lastSequence: 2 });
  await f.stream.append(f.ref, {
    callId: f.call.id,
    startIndex: 2,
    chunks: [{ type: "finish" }],
  });
  const page = await createExecutionStreamService(db, { now }).read(
    ctx,
    f.task.id,
    { afterSequence: 1, limit: 1 },
  );
  expect(page.events.map((e) => e.chunk)).toEqual([chunk("乙")]);
  expect(page.nextSequence).toBe(2);
  expect(page.hasMore).toBe(true);
  expect(page.status).toBe("running");
  expect((await f.tasks.get(ctx, f.task.id)).status).toBe("running");
});
it("拒绝缺口、改写、跨账号回读、旧fence和外部call", async () => {
  const f = await fixture("guards"),
    other = await fixture("other");
  await expect(
    f.stream.append(f.ref, {
      callId: f.call.id,
      startIndex: 1,
      chunks: [chunk("跳过")],
    }),
  ).rejects.toThrow();
  await f.stream.append(f.ref, {
    callId: f.call.id,
    startIndex: 0,
    chunks: [chunk("原文")],
  });
  await expect(
    f.stream.append(f.ref, {
      callId: f.call.id,
      startIndex: 0,
      chunks: [chunk("改写")],
    }),
  ).rejects.toThrow();
  await expect(
    f.stream.append(
      { ...f.ref, fenceToken: "stale" },
      { callId: f.call.id, startIndex: 1, chunks: [chunk("旧执行")] },
    ),
  ).rejects.toThrow();
  await expect(
    f.stream.append(f.ref, {
      callId: other.call.id,
      startIndex: 1,
      chunks: [chunk("跨任务")],
    }),
  ).rejects.toThrow();
  await expect(
    f.stream.read({ ...ctx, accountId: "foreign" }, f.task.id, {}),
  ).rejects.toThrow();
});
it("取消后只记录既有在途调用内容，不能启动调用或覆盖取消状态", async () => {
  const f = await fixture("cancel");
  await f.tasks.command(ctx, {
    taskIds: [f.task.id],
    command: "cancel",
    idempotencyKey: "cancel-stream",
  });
  await f.stream.append(f.ref, {
    callId: f.call.id,
    startIndex: 0,
    chunks: [chunk("已经返回的片段")],
  });
  expect((await f.tasks.get(ctx, f.task.id)).status).toBe("cancel_requested");
  await db
    .update(executionTasks)
    .set({ status: "cancelled" })
    .where(eq(executionTasks.id, f.task.id));
  await expect(
    f.stream.append(f.ref, {
      callId: f.call.id,
      startIndex: 1,
      chunks: [chunk("终态后追加")],
    }),
  ).rejects.toThrow();
  expect((await f.stream.read(ctx, f.task.id, {})).events).toHaveLength(1);
});
it("调用结束后禁止新增流内容，保留已写批次幂等回执", async () => {
  const f = await fixture("settled"),
    input = { callId: f.call.id, startIndex: 0, chunks: [chunk("已写")] };
  await f.stream.append(f.ref, input);
  await f.ledger.settle(f.ref, f.call.id, {
    status: "settled",
    usage: { totalTokens: 1 },
    resultText: "已写",
  });
  expect(await f.stream.append(f.ref, input)).toEqual({
    nextIndex: 1,
    lastSequence: 1,
  });
  await expect(
    f.stream.append(f.ref, {
      callId: f.call.id,
      startIndex: 1,
      chunks: [chunk("伪造后续")],
    }),
  ).rejects.toThrow();
});

it("订阅断开只停止读取，任务继续运行；新订阅从原游标补齐后续", async () => {
  const { subscribeExecutionStream } =
    await import("./execution-stream.service");
  const f = await fixture("subscription");
  await f.stream.append(f.ref, {
    callId: f.call.id,
    startIndex: 0,
    chunks: [chunk("首段")],
  });
  const controller = new AbortController(),
    subscription = subscribeExecutionStream(f.stream, ctx, f.task.id, {
      signal: controller.signal,
    });
  const first = await subscription.next();
  expect(first.value?.nextSequence).toBe(1);
  const waiting = subscription.next();
  controller.abort();
  expect((await waiting).done).toBe(true);
  expect((await f.tasks.get(ctx, f.task.id)).status).toBe("running");
  await f.stream.append(f.ref, {
    callId: f.call.id,
    startIndex: 1,
    chunks: [chunk("离线期间完成的片段")],
  });
  await db
    .update(executionTasks)
    .set({ status: "succeeded" })
    .where(eq(executionTasks.id, f.task.id));
  const pages = [];
  for await (const page of subscribeExecutionStream(f.stream, ctx, f.task.id, {
    afterSequence: 1,
    signal: new AbortController().signal,
  }))
    pages.push(page);
  expect(pages).toHaveLength(1);
  expect(pages[0]?.events.map((e) => e.chunk)).toEqual([
    chunk("离线期间完成的片段"),
  ]);
  expect(pages[0]?.status).toBe("succeeded");
});

it("磁盘数据库关闭重开后保持原游标和内容，迁移重复启动不清空旧任务", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "creatoros-stream-test-"));
  let store = await createDb({ dataDir: dir });
  try {
    const tasks = createPersistentTaskService(store.db, { now }),
      task = await tasks.enqueue(ctx, {
        kind: "ai_task",
        ownerType: "ai_task",
        ownerId: "disk",
        idempotencyKey: "disk",
        payload: {},
      }),
      claim = (await tasks.claimTask({ taskId: task.id, workerId: "w" }))!,
      ref = {
        executionTaskId: task.id,
        attempt: claim.lease.attempt,
        fenceToken: claim.lease.fenceToken,
      };
    const ledger = createExecutionCallLedgerService(store.db, {
        now,
        budget: { maxCalls: 2, maxTokens: 100, deadlineMs: 60000 },
      }),
      call = await ledger.reserve(ref, {
        operationKey: "stream",
        kind: "model",
        inputDigest: "sha256:" + "a".repeat(64),
        reservedTokens: 10,
      });
    await ledger.start(ref, call.id);
    await createExecutionStreamService(store.db, { now }).append(ref, {
      callId: call.id,
      startIndex: 0,
      chunks: [chunk("磁盘正文")],
    });
    await store.client.close();
    store = await createDb({ dataDir: dir });
    const page = await createExecutionStreamService(store.db, { now }).read(
      ctx,
      task.id,
      {},
    );
    expect(page.events.map((e) => e.chunk)).toEqual([chunk("磁盘正文")]);
    expect(page.nextSequence).toBe(1);
    expect(page.status).toBe("running");
  } finally {
    await store.client.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);

it("内部模型不能写入对外展示流",async()=>{
 const f=await fixture("private-child");
 const parent=await f.ledger.reserve(f.ref,{operationKey:"parent",kind:"tool",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:0});await f.ledger.start(f.ref,parent.id);
 const child=await f.ledger.reserve(f.ref,{operationKey:"child",kind:"model",parentCallId:parent.id,inputDigest:"sha256:"+"b".repeat(64),reservedTokens:20});await f.ledger.start(f.ref,child.id);
 await expect(f.stream.append(f.ref,{callId:child.id,startIndex:0,chunks:[chunk("内部秘密")]})).rejects.toThrow();
});
