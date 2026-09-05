import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  createDb,
  aiTasks,
  executionTasks,
  eq,
  type Db,
} from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionBrowserLoginSnapshotService } from "./execution-browser-login-snapshot.service";
const ctx = {
    userId: "login-user",
    accountId: "login-account",
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
const state = (domain: string) =>
  JSON.stringify({
    cookies: [{ name: "session", value: "private", domain, path: "/" }],
    origins: [],
  });
async function fixture(
  id: string,
  domains = ["www.example.com", "v.douyin.com"],
) {
  const tasks = createPersistentTaskService(db, { now });
  const task = await tasks.enqueue(ctx, {
    kind: "ai_task",
    ownerType: "ai_task",
    ownerId: id,
    idempotencyKey: id,
    payload: {
      modelInput: {
        kind: "agentic.run",
        browserAuthorization: {
          source: "user_task",
          allowedDomains: domains,
          allowInteraction: true,
        },
      },
    },
  });
  await db
    .insert(aiTasks)
    .values({
      id,
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "exec.agentic.research",
      status: "running",
      executionTaskId: task.id,
      idempotencyKey: id,
      requestedAt: now(),
    });
  const claim = (await tasks.claimTask({
    taskId: task.id,
    workerId: "worker",
  }))!;
  return {
    task,
    ref: {
      executionTaskId: task.id,
      attempt: claim.lease.attempt,
      fenceToken: claim.lease.fenceToken,
    },
    tasks,
  };
}
it("只按冻结域及真实owner读取历史alias，不暴露revision或键且无写入", async () => {
  const f = await fixture("read");
  const getStateVersioned = vi.fn(async (_ctx: unknown, domain: string) => ({
    revision:
      domain === "example.com" || domain === "iesdouyin.com" ? "opaque" : null,
    stateJson:
      domain === "example.com"
        ? state("example.com")
        : domain === "iesdouyin.com"
          ? state("iesdouyin.com")
          : null,
  }));
  const result = await createExecutionBrowserLoginSnapshotService(db, {
    now,
    sessions: { getStateVersioned },
  }).read(f.ref);
  expect(result).toEqual([
    { domain: "example.com", stateJson: state("example.com") },
    { domain: "douyin.com", stateJson: state("iesdouyin.com") },
  ]);
  expect(getStateVersioned.mock.calls.map((call) => call[1])).toEqual([
    "example.com",
    "douyin.com",
    "v.douyin.com",
    "iesdouyin.com",
  ]);
  expect(getStateVersioned.mock.calls[0]![0]).toMatchObject({
    userId: ctx.userId,
    accountId: ctx.accountId,
  });
  expect(JSON.stringify(result)).not.toContain("opaque");
});
it("不可解密的canonical记录阻止穿透旧alias", async () => {
  const f = await fixture("corrupt", ["douyin.com"]);
  const getStateVersioned = vi.fn(async () => ({
    revision: "damaged",
    stateJson: null,
  }));
  await expect(
    createExecutionBrowserLoginSnapshotService(db, {
      now,
      sessions: { getStateVersioned },
    }).read(f.ref),
  ).rejects.toMatchObject({ code: "BROWSER_LOGIN_SNAPSHOT_INVALID" });
  expect(getStateVersioned).toHaveBeenCalledTimes(1);
});
it("每域独立验证，不允许state夹带另一域cookie", async () => {
  const f = await fixture("domain", ["example.com", "other.com"]);
  const getStateVersioned = vi.fn(async () => ({
    revision: "rev",
    stateJson: state("other.com"),
  }));
  await expect(
    createExecutionBrowserLoginSnapshotService(db, {
      now,
      sessions: { getStateVersioned },
    }).read(f.ref),
  ).rejects.toMatchObject({ code: "BROWSER_LOGIN_SNAPSHOT_INVALID" });
});
it("缺登录记录返回null；旧fence、账号映射变更、取消不读取vault", async () => {
  const f = await fixture("authority", ["example.com"]);
  const getStateVersioned = vi.fn(async () => ({
    revision: null,
    stateJson: null,
  }));
  const service = createExecutionBrowserLoginSnapshotService(db, {
    now,
    sessions: { getStateVersioned },
  });
  expect(await service.read(f.ref)).toEqual([
    { domain: "example.com", stateJson: null },
  ]);
  getStateVersioned.mockClear();
  await expect(
    service.read({ ...f.ref, fenceToken: "wrong" }),
  ).rejects.toThrow();
  await db
    .update(aiTasks)
    .set({ accountId: "other" })
    .where(eq(aiTasks.id, "authority"));
  await expect(service.read(f.ref)).rejects.toThrow();
  await db
    .update(aiTasks)
    .set({ accountId: ctx.accountId })
    .where(eq(aiTasks.id, "authority"));
  await f.tasks.command(ctx, {
    taskIds: [f.task.id],
    command: "cancel",
    idempotencyKey: "cancel-login",
  });
  await expect(service.read(f.ref)).rejects.toThrow();
  expect(getStateVersioned).not.toHaveBeenCalled();
});
it("缺冻结授权拒绝且不从任意输入推测域", async () => {
  const f = await fixture("missing");
  await db
    .update(executionTasks)
    .set({ payload: { modelInput: { kind: "agentic.run" } } })
    .where(eq(executionTasks.id, f.task.id));
  const getStateVersioned = vi.fn(async () => ({
    revision: null,
    stateJson: null,
  }));
  await expect(
    createExecutionBrowserLoginSnapshotService(db, {
      now,
      sessions: { getStateVersioned },
    }).read(f.ref),
  ).rejects.toThrow();
  expect(getStateVersioned).not.toHaveBeenCalled();
});
