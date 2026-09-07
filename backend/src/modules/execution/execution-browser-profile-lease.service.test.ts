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

it('宿主登录与 Worker 共用同一物理 profile，跨用户与域名不能绕开互斥', async () => {
    const service = createExecutionBrowserProfileLeaseService(db, { now });
    const profileKey = 'a'.repeat(64);
    const host = { userId: 'host-user', domain: 'douyin.com', profileKey, hostInstanceId: 'host-1', hostOperationId: 'login-1' };
    const held = await service.acquireForHost(host);
    expect(await service.acquireForHost(host)).toEqual(held);
    const worker = await owner('physical-worker', 'another-user');
    await expect(service.acquireProfile(worker.ref, 'example.com', profileKey)).rejects.toMatchObject({ code: 'BROWSER_PROFILE_BUSY' });
    await expect(service.acquireForHost({ ...host, domain: 'example.com', hostOperationId: 'other' })).rejects.toMatchObject({ code: 'BROWSER_PROFILE_BUSY' });
    await expect(service.releaseAfterHostStopped({ ...host, hostOperationId: 'wrong' }, held.leaseId)).rejects.toThrow();
    expect(await service.releaseAfterHostStopped(host, held.leaseId)).toBe(true);
    const next = await service.acquireProfile(worker.ref, 'example.com', profileKey);
    await expect(service.releaseAfterHostStopped(host, next.leaseId)).rejects.toThrow();
    await expect(service.releaseAfterHostStopped(host, held.leaseId)).rejects.toThrow();
    expect((await service.listOwned(worker.ref)).map(row => row.leaseId)).toEqual([next.leaseId]);
});
it('不同物理 profile 独立，宿主占用没有过期抢占且不伪造执行任务', async () => {
    const service = createExecutionBrowserProfileLeaseService(db, { now });
    const host = { userId: 'physical-user', domain: 'douyin.com', profileKey: 'b'.repeat(64), hostInstanceId: 'process-1', hostOperationId: 'login-1' };
    const receipt = await service.acquireForHost(host);
    const later = createExecutionBrowserProfileLeaseService(db, { now: () => '2099-01-01T00:00:00Z' });
    await expect(later.acquireForHost({ ...host, hostInstanceId: 'restarted' })).rejects.toMatchObject({ code: 'BROWSER_PROFILE_BUSY' });
    expect((await service.acquireForHost({ ...host, profileKey: 'c'.repeat(64) })).leaseId).not.toBe(receipt.leaseId);
    const [row] = await db.select().from(executionBrowserProfileLeases).where(eq(executionBrowserProfileLeases.leaseId, receipt.leaseId));
    expect(row).toMatchObject({ ownerExecutionTaskId: null, attempt: null, fenceToken: null, hostInstanceId: 'process-1', hostOperationId: 'login-1' });
});
it('网站原 user+domain 范围与宿主相互阻塞，保留已有调用兼容', async () => {
    const service = createExecutionBrowserProfileLeaseService(db, { now });
    const worker = await owner('web-host-compat', 'web-host-user');
    const lease = await service.acquire(worker.ref, 'www.example.com');
    const host = { userId: 'web-host-user', domain: 'example.com', hostInstanceId: 'host', hostOperationId: 'login' };
    await expect(service.acquireForHost(host)).rejects.toMatchObject({ code: 'BROWSER_PROFILE_BUSY' });
    await service.releaseAfterWorkerStopped(worker.ref, lease.leaseId);
    const held = await service.acquireForHost(host);
    await expect(service.acquire(worker.ref, 'example.com')).rejects.toMatchObject({ code: 'BROWSER_PROFILE_BUSY' });
    expect(await service.releaseAfterHostStopped(host, held.leaseId)).toBe(true);
    expect(await service.releaseAfterHostStopped(host, held.leaseId)).toBe(false);
});
it('宿主与Worker并发只产生一个占用；旧fence不能申请新物理资源', async () => {
    const service = createExecutionBrowserProfileLeaseService(db, { now });
    const worker = await owner('race-host-worker', 'race-user');
    const profileKey = 'd'.repeat(64);
    const outcomes = await Promise.allSettled([
        service.acquireProfile(worker.ref, 'douyin.com', profileKey),
        service.acquireForHost({ userId: 'race-user', domain: 'douyin.com', profileKey, hostInstanceId: 'race-host', hostOperationId: 'race-login' }),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('BROWSER_PROFILE_BUSY');
    await expect(service.acquireProfile({ ...worker.ref, fenceToken: 'old' }, 'douyin.com', 'e'.repeat(64))).rejects.toThrow();
    expect(await db.select().from(executionBrowserProfileLeases).where(eq(executionBrowserProfileLeases.profileKey, 'e'.repeat(64)))).toEqual([]);
});
it('数据库拒绝混合或缺失owner，旧租约升级保留原占用与回读', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { readFile } = await import('node:fs/promises');
    const isolated = new PGlite();
    try {
        await isolated.exec(await readFile(new URL('../../../drizzle/0081_execution_browser_profile_leases.sql', import.meta.url), 'utf8'));
        await isolated.query(`INSERT INTO execution_browser_profile_leases(user_id,domain,owner_execution_task_id,attempt,fence_token,lease_id,acquired_at) VALUES ('legacy-user','example.com','legacy-task',2,'legacy-fence','legacy-lease','2026-01-01')`);
        await isolated.exec(await readFile(new URL('../../../drizzle/0091_browser_profile_host_owner.sql', import.meta.url), 'utf8'));
        expect((await isolated.query('SELECT * FROM execution_browser_profile_leases')).rows).toEqual([expect.objectContaining({ user_id: 'legacy-user', owner_execution_task_id: 'legacy-task', attempt: 2, fence_token: 'legacy-fence', lease_id: 'legacy-lease', released_at: null, profile_key: '', host_instance_id: null, host_operation_id: null })]);
        await expect(isolated.query(`UPDATE execution_browser_profile_leases SET host_instance_id='host', host_operation_id='operation'`)).rejects.toThrow();
        await expect(isolated.query(`UPDATE execution_browser_profile_leases SET owner_execution_task_id=NULL,attempt=NULL,fence_token=NULL`)).rejects.toThrow();
        await expect(isolated.query(`UPDATE execution_browser_profile_leases SET owner_execution_task_id=NULL,attempt=NULL,fence_token=NULL,host_instance_id='',host_operation_id='op'`)).rejects.toThrow();
        expect((await isolated.query('SELECT owner_execution_task_id FROM execution_browser_profile_leases')).rows).toEqual([{ owner_execution_task_id: 'legacy-task' }]);
    } finally { await isolated.close(); }
});
it('真实守卫关闭证明绑定同一宿主租约：关闭失败保留，关闭成功后Worker可领取', async () => {
    const { guardedLaunch } = await import('@creatoros/ai-worker/browser/chromium-guard');
    const service = createExecutionBrowserProfileLeaseService(db, { now });
    const host = { userId: 'hook-user', domain: 'example.com', profileKey: 'f'.repeat(64), hostInstanceId: 'hook-host', hostOperationId: 'hook-login' };
    const receipt = await service.acquireForHost(host);
    let closeFails = true;
    const ctx = await guardedLaunch('/isolated/host-profile-db-hook', async () => ({ close: async () => { if (closeFails) throw new Error('browser remains open'); } }), {
        onStopped: async () => { await service.releaseAfterHostStopped(host, receipt.leaseId); },
    }, { listProfileProcesses: async () => [], killPid: async () => {}, removeFile: async () => {} });
    const worker = await owner('hook-worker', 'hook-user');
    await expect(ctx.close()).rejects.toThrow('browser remains open');
    await expect(service.acquireProfile(worker.ref, host.domain, host.profileKey)).rejects.toMatchObject({ code: 'BROWSER_PROFILE_BUSY' });
    closeFails = false;
    await ctx.close();
    expect((await service.acquireProfile(worker.ref, host.domain, host.profileKey)).leaseId).not.toBe(receipt.leaseId);
});
