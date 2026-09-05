import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createDb, aiTasks } from "@creatoros/backend";
import { createExecutionAuthorityService } from "./execution-authority.service";
const fault = vi.hoisted(() => ({ armed: false, failed: false, cleanupFinished: false }));
// 仅替换profile读取故障点；dispatcher、数据库、supervisor与Worker进程均为真实实现。
vi.mock("./execution-browser-profile-lease.service", () => ({ createExecutionBrowserProfileLeaseService: () => ({
        async listOwned() {
            if (fault.armed && !fault.failed) {
                fault.failed = true;
                throw new Error("PROFILE_READ_INJECTED_FAILURE");
            }
            if (fault.failed) {
                await new Promise(resolve => setTimeout(resolve, 80));
                fault.cleanupFinished = true;
            }
            return [];
        },
        async releaseAfterWorkerStopped() { throw new Error("本测试没有可释放profile"); },
    }) }));
import { createModelWorkerDispatcher } from "./model-worker-dispatcher";
const alive = (pid: number) => { try {
    process.kill(pid, 0);
    return true;
}
catch {
    return false;
} };
it("profile查询失败仍停止真实长Worker、等draining收尾并传播原错误", async () => {
    const f = await createDb(), directory = await mkdtemp(join(tmpdir(), "t915-stop-failure-"));
    const pidPath = join(directory, "worker.pid"), stopPath = join(directory, "stopped"), entryPath = join(directory, "worker.cjs");
    await writeFile(entryPath, `const fs=require('node:fs');setInterval(()=>{},1000);process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(stopPath)},'SIGTERM');setTimeout(()=>process.exit(0),30);});process.on('message',m=>{if(m.type==='run')fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));});process.send({version:1,type:'ready',requestId:'ready',capabilities:['model.generate']});`);
    const budget = { maxCalls: 3, maxTokens: 10000, deadlineMs: 30000 };
    const host = createModelWorkerDispatcher(f.db, { entryPath, workerId: "stop-host", budget, modelConcurrency: 1, resolveModelCredential: async () => { throw new Error("夹具不调用模型"); }, projectCandidate() { throw new Error("夹具不生成候选"); } });
    let pid = 0, drainFinished = false;
    let draining: Promise<unknown> | undefined;
    try {
        const ctx = { userId: "stop-user", accountId: "stop-account", requestId: "test", source: "user" as const };
        await f.db.insert(aiTasks).values({ id: "stop-task", userId: ctx.userId, accountId: ctx.accountId, taskType: "script.draft", idempotencyKey: "stop-task", requestedAt: new Date().toISOString() });
        await createExecutionAuthorityService(f.db).bindAiTask(ctx, "stop-task", { requestFingerprint: "sha256:" + "0".repeat(64), budget, modelInput: { kind: "model.generate", prompt: "fixture", capability: "fixture", maxOutputTokens: 100, operationKey: "fixture" } });
        draining = host.drainOnce().finally(() => { drainFinished = true; });
        await vi.waitFor(async () => { pid = Number(await readFile(pidPath, "utf8")); expect(alive(pid)).toBe(true); });
        fault.armed = true;
        const error = await host.stop().then(() => null, error => error);
        expect(error).toBeInstanceOf(Error);
        expect(alive(pid)).toBe(false);
        expect(await readFile(stopPath, "utf8")).toBe("SIGTERM");
        expect(drainFinished).toBe(true);
        expect(fault.cleanupFinished).toBe(true);
        const reported = error instanceof AggregateError ? error.errors : [error];
        expect(reported.some(item => String(item).includes("PROFILE_READ_INJECTED_FAILURE"))).toBe(true);
    }
    finally {
        // 红测失败也显式清理真实子进程，避免测试自身残留。
        if (pid && alive(pid))
            process.kill(pid, "SIGKILL");
        await host.stop().catch(() => { });
        await draining?.catch(() => { });
        await f.client.close();
        await rm(directory, { recursive: true, force: true });
    }
}, 15000);
