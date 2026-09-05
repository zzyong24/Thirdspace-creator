import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb, executionTasks, executionBrowserProfileLeases, eq, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionBrowserProfileLeaseService } from "./execution-browser-profile-lease.service";
const stamp = "2026-09-05T00:00:00.000Z", now = () => stamp;
let db: Db, close: () => Promise<void>;
beforeAll(async () => { const f = await createDb(); db = f.db; close = () => f.client.close(); });
afterAll(async () => close?.());
async function owner(id: string, userId = "profile-user", accountId = "profile-account") {
    const tasks = createPersistentTaskService(db, { now });
    const task = await tasks.enqueue({ userId, accountId, requestId: id, source: "user" }, { kind: "ai_task", ownerType: "ai_task", ownerId: id, idempotencyKey: id, payload: {} });
    const claim = (await tasks.claimTask({ taskId: task.id, workerId: "worker" }))!;
    return { tasks, task, ref: { executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken } };
}
it("真实DB并发仅一个owner可领取，同owner重投返回同lease", async () => {
    const first = await owner("parallel1"), second = await owner("parallel2"), service = createExecutionBrowserProfileLeaseService(db, { now });
    const outcomes = await Promise.allSettled([service.acquire(first.ref, "example.com"), service.acquire(second.ref, "www.example.com")]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    const loser = outcomes.find(o => o.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason.code).toBe("BROWSER_PROFILE_BUSY");
    const winning = outcomes[0]!.status === "fulfilled" ? first : second;
    const receipt = (outcomes.find(o => o.status === "fulfilled") as PromiseFulfilledResult<{
        leaseId: string;
        domain: string;
    }>).value;
    expect(await service.acquire(winning.ref, "EXAMPLE.COM")).toEqual(receipt);
    expect(await db.select().from(executionBrowserProfileLeases).where(eq(executionBrowserProfileLeases.domain, "example.com"))).toHaveLength(1);
});
it("跨用户独立，同用户跨账号串行且domain alias归同profile", async () => {
    const a = await owner("scope1", "scope-user", "account1"), b = await owner("scope2", "scope-user", "account2"), c = await owner("scope3", "other-user", "account1");
    const service = createExecutionBrowserProfileLeaseService(db, { now });
    const one = await service.acquire(a.ref, "v.douyin.com");
    expect(one.domain).toBe("douyin.com");
    await expect(service.acquire(b.ref, "iesdouyin.com")).rejects.toMatchObject({ code: "BROWSER_PROFILE_BUSY" });
    expect((await service.acquire(c.ref, "douyin.com")).leaseId).not.toBe(one.leaseId);
});
it.each(["expired", "cancelled", "succeeded"])("%s不构成浏览器停止凭证，不能自动抢占", async (state) => {
    const a = await owner(`held-${state}`, `user-${state}`), b = await owner(`next-${state}`, `user-${state}`), service = createExecutionBrowserProfileLeaseService(db, { now });
    await service.acquire(a.ref, "example.com");
    await db.update(executionTasks).set(state === "expired" ? { leaseExpiresAt: "2000-01-01T00:00:00.000Z", deadlineAt: "2000-01-01T00:00:00.000Z" } : { status: state }).where(eq(executionTasks.id, a.task.id));
    await expect(service.acquire(b.ref, "example.com")).rejects.toMatchObject({ code: "BROWSER_PROFILE_BUSY" });
});
it("停止后显式释放允许新owner领取，旧lease/fence不能释放新租约", async () => {
    const a = await owner("release1", "release-user"), b = await owner("release2", "release-user"), service = createExecutionBrowserProfileLeaseService(db, { now });
    const lease = await service.acquire(a.ref, "example.com");
    await db.update(executionTasks).set({ status: "cancel_requested" }).where(eq(executionTasks.id, a.task.id));
    expect(await service.releaseAfterWorkerStopped(a.ref, lease.leaseId)).toBe(true);
    expect(await service.releaseAfterWorkerStopped(a.ref, lease.leaseId)).toBe(false);
    const next = await service.acquire(b.ref, "example.com");
    expect(next.leaseId).not.toBe(lease.leaseId);
    await expect(service.releaseAfterWorkerStopped(a.ref, next.leaseId)).rejects.toThrow();
    await expect(service.releaseAfterWorkerStopped(a.ref, lease.leaseId)).rejects.toThrow();
    expect(await service.acquire(b.ref, "example.com")).toEqual(next);
});
it("acquire旧fence拒绝，但已停止旧Worker可释放仍由其持有的profile", async () => {
    const a = await owner("old-ref", "old-user"), service = createExecutionBrowserProfileLeaseService(db, { now });
    const lease = await service.acquire(a.ref, "example.com");
    await db.update(executionTasks).set({ attempt: a.ref.attempt + 1, fenceToken: "new-fence" }).where(eq(executionTasks.id, a.task.id));
    await expect(service.acquire(a.ref, "example.com")).rejects.toThrow();
    await expect(service.releaseAfterWorkerStopped({ ...a.ref, fenceToken: "new-fence" }, lease.leaseId)).rejects.toThrow();
    expect(await service.releaseAfterWorkerStopped(a.ref, lease.leaseId)).toBe(true);
});
it("多域领取任一冲突整体回滚，不遗留先领取的域", async () => {
    const a = await owner("many-held", "many-user"), b = await owner("many-contender", "many-user"), service = createExecutionBrowserProfileLeaseService(db, { now });
    await service.acquire(a.ref, "z-held.example.com");
    await expect(service.acquireMany(b.ref, ["a-new.example.com", "z-held.example.com"])).rejects.toMatchObject({ code: "BROWSER_PROFILE_BUSY" });
    expect(await service.listOwned(b.ref)).toEqual([]);
    expect(await db.select().from(executionBrowserProfileLeases).where(eq(executionBrowserProfileLeases.domain, "a-new.example.com"))).toEqual([]);
    expect((await service.listOwned(a.ref)).map(row => row.domain)).toEqual(["z-held.example.com"]);
});
it("批次canonical去重排序、30域边界、listOwned精确ref且排除已释放", async () => {
    const a = await owner("many-canonical", "many-canonical-user"), other = await owner("many-other", "many-canonical-user"), service = createExecutionBrowserProfileLeaseService(db, { now });
    const batch = await service.acquireMany(a.ref, ["www.example.com", "v.douyin.com", "example.com", "iesdouyin.com"]);
    expect(batch.map(row => row.domain)).toEqual(["douyin.com", "example.com"]);
    expect(await service.acquireMany(a.ref, ["example.com", "douyin.com"])).toEqual(batch);
    expect(await service.listOwned(other.ref)).toEqual([]);
    expect(await service.listOwned({ ...a.ref, attempt: a.ref.attempt + 1 })).toEqual([]);
    expect(await service.listOwned({ ...a.ref, fenceToken: "wrong" })).toEqual([]);
    await service.releaseAfterWorkerStopped(a.ref, batch[0]!.leaseId);
    expect((await service.listOwned(a.ref)).map(row => row.leaseId)).toEqual([batch[1]!.leaseId]);
    const domains = Array.from({ length: 30 }, (_, i) => `site${i}.example.com`);
    expect(await service.acquireMany(a.ref, domains)).toHaveLength(30);
    await expect(service.acquireMany(a.ref, [...domains, "excess.example.com"])).rejects.toThrow();
    expect((await service.listOwned(a.ref)).some(row => row.domain === "excess.example.com")).toBe(false);
});
