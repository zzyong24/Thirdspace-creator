import { z } from "zod";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb, aiTasks, executionCalls, executionTasks, knowledgeItems, eq, sql, type Db } from "@creatoros/backend";
import { executionEvidence } from "../../schema/intelligence";
import { browserObserveInputSchema, browserActInputSchema, type AgenticToolOutcome } from "@creatoros/contract/execution-worker";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
import { verifyReadEvidence } from "./execution-research-evidence.service";
const now = () => "2026-09-05T00:00:00.000Z", budget = { maxCalls: 20, maxTokens: 10000, deadlineMs: 60000 };
const ctx = { userId: "browser-evidence-user", accountId: "browser-evidence-account", requestId: "test", source: "user" as const };
const tools = { "web.read": { version: "1", parameters: z.object({ url: z.string(), offset: z.number().int().nonnegative(), snapshotId: z.string(), evidenceRef: z.string() }).strict(), effect: "none" as const }, "browser.observe": { version: "1", parameters: browserObserveInputSchema, effect: "none" as const }, "browser.act": { version: "1", parameters: browserActInputSchema, effect: "committed" as const } };
let db: Db, close: () => Promise<void>;
beforeAll(async () => { const f = await createDb(); db = f.db; close = () => f.client.close(); });
afterAll(async () => close?.());
async function fixture(id: string, name = "browser.observe", action = "click") {
    const tasks = createPersistentTaskService(db, { now });
    const task = await tasks.enqueue(ctx, { kind: "ai_task", ownerType: "ai_task", ownerId: id, idempotencyKey: id, payload: { modelInput: { kind: "agentic.run", browserAuthorization: { source: "user_task", allowedDomains: ["example.com"], allowInteraction: true }, tools: Object.entries(tools).map(([name, t]) => ({ name, version: t.version })) } } });
    await db.insert(aiTasks).values({ id, userId: ctx.userId, accountId: ctx.accountId, taskType: "research.gather_material", executionTaskId: task.id, status: "running", idempotencyKey: id, requestedAt: now() });
    const claim = (await tasks.claimTask({ taskId: task.id, workerId: "worker" }))!;
    const ref = { executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
    const ledger = createExecutionCallLedgerService(db, { now, budget }), ports = createExecutionAgenticToolPorts(db, { now, budget, tools });
    const model = await ledger.reserve(ref, { operationKey: "model1", kind: "model", inputDigest: "sha256:" + "a".repeat(64), reservedTokens: 10 });
    await ledger.start(ref, model.id);
    const input = name === "browser.observe" ? { sessionId: "s", url: "https://example.com/" } : { sessionId: "s", observationId: "prior", action, targetRef: "prior:0" };
    await ledger.settle(ref, model.id, { status: "settled", usage: { totalTokens: 2 }, providerResult: { content: [{ type: "tool-call", toolCallId: "tool1", toolName: name, input: JSON.stringify(input) }], finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] } });
    const call = await ports.reserve(ref, { modelCallId: model.id, toolCallId: "tool1" });
    await ports.start(ref, { callId: call.callId });
    const observation = { sessionId: "s", observationId: "seen", url: "https://example.com/", title: "真实页面", text: "真实可见正文", elements: [] };
    const output: AgenticToolOutcome = { status: "ok", summary: "真实浏览器结果", evidence: [{ sourceUrl: observation.url, title: observation.title, text: observation.text }], data: { observation, ...(name === "browser.act" ? { execution: { mechanism: "dom_click", trusted: false, eventDispatched: true } } : {}) }, sideEffect: name === "browser.act" ? "committed" : "none", error: null, continuation: null };
    const { createExecutionBrowserEvidenceService } = await import("./execution-browser-evidence.service");
    return { id, task, ref, callId: call.callId, tasks, ledger, ports, output, observation, service: createExecutionBrowserEvidenceService(db, { now, budget, tools }) };
}
it.each(["browser.observe", "browser.act"])("%s观察证据与回执原子结算、幂等且零知识领域写入", async (name) => {
    const f = await fixture(`evidence-${name}`, name);
    const before = await db.select().from(knowledgeItems);
    const saved = await f.service.settle(f.ref, { callId: f.callId, output: f.output });
    const rows = await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id));
    expect(rows).toHaveLength(1);
    expect(saved.data).toMatchObject({ observation: f.observation, evidenceRef: rows[0]!.id, snapshotId: rows[0]!.contentHash });
    expect(saved.sideEffect).toBe(f.output.sideEffect);
    expect(saved.evidence).toContainEqual({ ...f.output.evidence[0], entityId: rows[0]!.id, version: rows[0]!.contentHash });
    expect(await f.service.settle(f.ref, { callId: f.callId, output: f.output })).toEqual(saved);
    expect(await f.service.settle(f.ref, { callId: f.callId, output: saved })).toEqual(saved);
    await db.transaction(async (tx) => expect(await verifyReadEvidence(tx, f.task.id, [rows[0]!.id], 999)).toHaveLength(1));
    expect(await db.select().from(knowledgeItems)).toEqual(before);
});
it("同call改正文/动作事实重放拒绝，不改原快照", async () => {
    const f = await fixture("replay", "browser.act");
    await f.service.settle(f.ref, { callId: f.callId, output: f.output });
    for (const data of [{ observation: { ...f.observation, text: "伪造正文" } }, { ...f.output.data as object, execution: { mechanism: "dom_click", trusted: true, eventDispatched: true } }])
        await expect(f.service.settle(f.ref, { callId: f.callId, output: { ...f.output, data } })).rejects.toThrow();
    const [row] = await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id));
    expect(row!.fullText).toBe(f.observation.text);
});
it("取消后保留已执行观察，旧fence/跨task/unknown不能翻结算", async () => {
    const f = await fixture("cancel"), other = await fixture("other");
    await f.tasks.command(ctx, { taskIds: [f.task.id], command: "cancel", idempotencyKey: "cancel" });
    expect(await f.service.settle(f.ref, { callId: f.callId, output: f.output })).toMatchObject({ status: "ok" });
    await expect(f.service.settle({ ...f.ref, fenceToken: "old" }, { callId: f.callId, output: f.output })).rejects.toThrow();
    await expect(other.service.settle(other.ref, { callId: f.callId, output: f.output })).rejects.toThrow();
    await other.ledger.settle(other.ref, other.callId, { status: "unknown" });
    await expect(other.service.settle(other.ref, { callId: other.callId, output: other.output })).rejects.toThrow();
    expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, other.task.id))).toHaveLength(0);
});
it.each(["url", "session", "fake_ref", "unknown"])("%s不构成可结算证据且账本保持started", async (mode) => {
    const f = await fixture(`bad-${mode}`);
    const output = { ...f.output, ...(mode === "unknown" ? { sideEffect: "unknown" as const } : {}), data: { observation: { ...f.observation, ...(mode === "url" ? { url: "https://foreign.com/" } : mode === "session" ? { sessionId: "other" } : {}) }, ...(mode === "fake_ref" ? { evidenceRef: "fabricated", snapshotId: "fabricated" } : {}) } };
    await expect(f.service.settle(f.ref, { callId: f.callId, output })).rejects.toThrow();
    expect((await db.select().from(executionCalls).where(eq(executionCalls.id, f.callId)))[0]!.status).toBe("started");
    expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id))).toHaveLength(0);
});
it("验证器拒绝只伪填ID、正文/title/hash不符、跨task来源", async () => {
    const f = await fixture("verify");
    await f.service.settle(f.ref, { callId: f.callId, output: f.output });
    const [row] = await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id));
    const [call] = await db.select().from(executionCalls).where(eq(executionCalls.id, f.callId));
    for (const field of ["text", "title", "evidenceRef", "snapshotId", "item"]) {
        const receipt = JSON.parse(call!.resultText!);
        if (field === "text" || field === "title")
            receipt.output.data.observation[field] = "伪造";
        else if (field === "item")
            receipt.output.evidence = [];
        else
            receipt.output.data[field] = "伪造";
        await db.update(executionCalls).set({ resultText: JSON.stringify(receipt) }).where(eq(executionCalls.id, f.callId));
        await expect(db.transaction(tx => verifyReadEvidence(tx, f.task.id, [row!.id], 999))).rejects.toThrow();
    }
    await expect(db.transaction(tx => verifyReadEvidence(tx, "foreign-task", [row!.id], 999))).rejects.toThrow();
});
it("extract正文超过首观察窗口时，以真实提取文本建证据且验证实际动作来源", async () => {
    const f = await fixture("extract-window", "browser.act", "extract");
    const text = "真实目标中首观察之外的正文";
    const output: AgenticToolOutcome = { ...f.output, sideEffect: "none", data: { ...f.output.data as object, extraction: { targetRef: "prior:0", text, totalChars: text.length, truncated: false, sourceUrl: f.observation.url } }, evidence: [...f.output.evidence, { sourceUrl: f.observation.url, title: f.observation.title, text }] };
    const saved = await f.service.settle(f.ref, { callId: f.callId, output });
    const [row] = await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id));
    expect(row!.fullText).toBe(text);
    expect(saved.data).toMatchObject({ observation: f.observation, extraction: { text }, evidenceRef: row!.id });
    await db.transaction(async (tx) => expect(await verifyReadEvidence(tx, f.task.id, [row!.id], 999)).toHaveLength(1));
    const [call] = await db.select().from(executionCalls).where(eq(executionCalls.id, f.callId));
    const receipt = JSON.parse(call!.resultText!);
    receipt.output.data.extraction.text = "篡改窗口";
    await db.update(executionCalls).set({ resultText: JSON.stringify(receipt) }).where(eq(executionCalls.id, f.callId));
    await expect(db.transaction(tx => verifyReadEvidence(tx, f.task.id, [row!.id], 999))).rejects.toThrow();
});
it("观察证据须唯一真实模型工具绑定，伪toolName/session/operationKey不可放行", async () => {
    const f = await fixture("proof-binding");
    await f.service.settle(f.ref, { callId: f.callId, output: f.output });
    const [row] = await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id));
    const [call] = await db.select().from(executionCalls).where(eq(executionCalls.id, f.callId));
    for (const field of ["toolName", "session", "operationKey"]) {
        const receipt = JSON.parse(call!.resultText!);
        if (field === "toolName")
            receipt.toolName = "browser.act";
        if (field === "session")
            receipt.output.data.observation.sessionId = "forged-session";
        await db.update(executionCalls).set({ resultText: JSON.stringify(receipt), operationKey: field === "operationKey" ? "forged-key" : call!.operationKey }).where(eq(executionCalls.id, f.callId));
        await expect(db.transaction(tx => verifyReadEvidence(tx, f.task.id, [row!.id], 999))).rejects.toThrow();
    }
});
it("证据8MB满仍结算已发生committed动作，原回执幂等且不分配假ref", async () => {
    const f = await fixture("capacity", "browser.act");
    for (let index = 0; index < 4; index++) {
        const id = `capacity-call-${index}`;
        await db.insert(executionCalls).values({ id, executionTaskId: f.task.id, operationKey: id, kind: "tool", status: "settled", sequence: index + 3, inputDigest: "capacity-fixture", reservedTokens: 0, createdAt: now(), updatedAt: now() });
        await db.insert(executionEvidence).values({ id: `saturated-evidence-${index}`, executionTaskId: f.task.id, originCallId: id, requestedUrl: "https://example.com/", sourceUrl: "https://example.com/", title: "容量夹具", fullText: "x".repeat(2 * 1024 * 1024), contentHash: "capacity-fixture", byteLength: 2 * 1024 * 1024, createdAt: now() });
    }
    const output = await f.service.settle(f.ref, { callId: f.callId, output: f.output });
    expect(output).toEqual(f.output);
    expect(output.sideEffect).toBe("committed");
    expect((output.data as {
        evidenceRef?: string;
    }).evidenceRef).toBeUndefined();
    expect((await db.select().from(executionCalls).where(eq(executionCalls.id, f.callId)))[0]!.status).toBe("settled");
    expect(await f.service.settle(f.ref, { callId: f.callId, output: f.output })).toEqual(output);
    expect(await db.select().from(executionEvidence).where(eq(executionEvidence.originCallId, f.callId))).toHaveLength(0);
});
it("非匹配附加证据不保留Worker自报的跨来源ID，原动作仍结算且重投一致", async () => {
    const f = await fixture("foreign-evidence", "browser.act");
    const output = { ...f.output, evidence: [...f.output.evidence, { sourceUrl: "https://other.example.com/", title: "非核心参考", text: "原始描述", entityId: "another-task-secret-evidence", version: "forged" }] };
    const saved = await f.service.settle(f.ref, { callId: f.callId, output });
    expect(saved.sideEffect).toBe("committed");
    expect(saved.evidence[1]).toEqual({ sourceUrl: "https://other.example.com/", title: "非核心参考", text: "原始描述" });
    expect(await f.service.settle(f.ref, { callId: f.callId, output })).toEqual(saved);
    expect(await f.service.settle(f.ref, { callId: f.callId, output: saved })).toEqual(saved);
});
it("browser证据可经web.read offset0回读原快照，不发起网页读取", async () => {
    const f = await fixture("read-browser-snapshot");
    const saved = await f.service.settle(f.ref, { callId: f.callId, output: f.output });
    const data = saved.data as {
        evidenceRef: string;
        snapshotId: string;
    };
    const input = { url: f.observation.url, offset: 0, snapshotId: data.snapshotId, evidenceRef: data.evidenceRef };
    const model = await f.ledger.reserve(f.ref, { operationKey: "read-model", kind: "model", inputDigest: "sha256:" + "d".repeat(64), reservedTokens: 10 });
    await f.ledger.start(f.ref, model.id);
    await f.ledger.settle(f.ref, model.id, { status: "settled", usage: { totalTokens: 2 }, providerResult: { content: [{ type: "tool-call", toolCallId: "read-tool", toolName: "web.read", input: JSON.stringify(input) }], finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] } });
    const call = await f.ports.reserve(f.ref, { modelCallId: model.id, toolCallId: "read-tool" });
    await f.ports.start(f.ref, { callId: call.callId });
    const { createExecutionResearchEvidenceService } = await import("./execution-research-evidence.service");
    const service = createExecutionResearchEvidenceService(db, { now, budget, tools });
    const result = await service.readWindow(f.ref, { callId: call.callId });
    expect(result.data).toMatchObject({ text: f.observation.text, evidenceRef: data.evidenceRef, snapshotId: data.snapshotId });
    expect(await service.readWindow(f.ref, { callId: call.callId })).toEqual(result);
    expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id))).toHaveLength(1);
});
it("真实PG触发器拒绝ledger结算时，已插入证据与调用结算同事务回滚", async () => {
    const f = await fixture("atomic-rollback");
    const quoted = f.callId.replace(/'/g, "''");
    await db.execute(sql.raw(`CREATE FUNCTION browser_evidence_reject_settle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${quoted}' AND NEW.status = 'settled' THEN RAISE EXCEPTION 'INJECTED_LEDGER_SETTLEMENT_FAILURE'; END IF; RETURN NEW; END; $$;`));
    await db.execute(sql.raw("CREATE TRIGGER browser_evidence_reject_settle BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION browser_evidence_reject_settle();"));
    try {
        await expect(f.service.settle(f.ref, { callId: f.callId, output: f.output })).rejects.toThrow("INJECTED_LEDGER_SETTLEMENT_FAILURE");
        expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, f.task.id))).toHaveLength(0);
        const [call] = await db.select().from(executionCalls).where(eq(executionCalls.id, f.callId));
        expect(call!.status).toBe("started");
        expect(call!.resultText).toBeNull();
    }
    finally {
        await db.execute(sql.raw("DROP TRIGGER browser_evidence_reject_settle ON execution_calls;"));
        await db.execute(sql.raw("DROP FUNCTION browser_evidence_reject_settle();"));
    }
});
