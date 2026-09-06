import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { and, asc, eq, aiTasks, executionCalls, type Db } from "@creatoros/backend";
import { executionEvidence } from "../../schema/intelligence";
import { agenticToolOutcomeSchema, browserObservationSchema, browserAuthorizationSnapshotSchema, workerToolResultReceiptSchema, type AgenticToolOutcome, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { assertBrowserAuthorization } from "../ai-runtime/browser-authorization";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createAgenticToolBinding, type AgenticBackendTool } from "./agentic-tool-binding";
import { verifyReadEvidence, browserObservationEvidence } from "./execution-research-evidence.service";
import { ConflictError } from "./execution.errors";
type Evidence = typeof executionEvidence.$inferSelect;
// SEMANTIC_BOUNDARY_ALLOW: 哈希只绑定观察正文及来源，不选择或解释网页内容。
const hash = (url: string, text: string) => createHash("sha256").update(JSON.stringify([url, text])).digest("hex");
function stripEvidenceIdentity(output: AgenticToolOutcome): AgenticToolOutcome {
    return { ...output, evidence: output.evidence.map(({ entityId: _entityId, version: _version, ...item }) => item) };
}
function enrich(output: AgenticToolOutcome, row: Evidence): AgenticToolOutcome {
    const data = z.record(z.string(), z.json()).parse(output.data);
    if ((data.evidenceRef !== undefined && data.evidenceRef !== row.id) || (data.snapshotId !== undefined && data.snapshotId !== row.contentHash))
        throw new ConflictError("浏览器不能自报证据身份");
    let matched = false;
    const evidence = output.evidence.map(item => {
        if (item.sourceUrl !== row.sourceUrl || item.title !== row.title || item.text !== row.fullText) {
            const { entityId: _entityId, version: _version, ...unverified } = item;
            return unverified;
        }
        matched = true;
        return { ...item, entityId: row.id, version: row.contentHash };
    });
    if (!matched)
        evidence.push({ sourceUrl: row.sourceUrl, title: row.title, text: row.fullText, entityId: row.id, version: row.contentHash });
    return agenticToolOutcomeSchema.parse({ ...output, data: { ...data, evidenceRef: row.id, snapshotId: row.contentHash }, evidence });
}
/** 仅结算真实已执行浏览器观察；无正文/blocked/error/unknown仍走原工具结算端口。 */
export function createExecutionBrowserEvidenceService(db: Db, deps: {
    tools: Record<string, AgenticBackendTool>;
    budget: Parameters<typeof createExecutionCallLedgerService>[1]["budget"];
    now?: () => string;
}) {
    const leases = createExecutionLeaseService(db, deps), binding = createAgenticToolBinding(deps.tools), now = deps.now ?? (() => new Date().toISOString());
    return { async settle(ref: ExecutionRef, raw: unknown): Promise<AgenticToolOutcome> {
            const input = z.object({ callId: z.string().min(1), output: agenticToolOutcomeSchema }).strict().parse(raw), output = input.output;
            if (!["ok", "partial"].includes(output.status) || output.error !== null || output.sideEffect === "unknown")
                throw new ConflictError("当前浏览器结果不属于已确认正文证据");
            const data = z.object({ observation: browserObservationSchema }).parse(output.data), observation = data.observation;
            return leases.withLease(ref, "settlement", async ({ tx, task, context }) => {
                if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
                    throw new ConflictError("浏览器证据缺少AI归属");
                const [business] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), eq(aiTasks.accountId, context.accountId!))).for("update");
                if (!business)
                    throw new ConflictError("浏览器证据任务映射不符");
                const calls = await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id)).orderBy(asc(executionCalls.sequence));
                const call = calls.find(item => item.id === input.callId);
                if (!call || call.toolExecutionClaimId || (call.status !== "settled" && (call.status !== "started" || call.startedAttempt !== ref.attempt)))
                    throw new ConflictError("浏览器调用未获启动许可或结果需要对账");
                const bound = binding.forCall(task, calls, call);
                if (!calls.some(model => model.id === bound.modelCallId && model.sequence < call.sequence))
                    throw new ConflictError("浏览器模型调用必须先于工具调用");
                if (!["browser.observe", "browser.act"].includes(bound.toolName) || bound.validationOutcome)
                    throw new ConflictError("当前调用不是合法浏览器工具");
                const request = z.object({ sessionId: z.string(), url: z.string().optional(), action: z.enum(["navigate", "click", "fill", "wait", "extract"]).optional(), targetRef: z.string().optional() }).parse(bound.input);
                if (request.sessionId !== observation.sessionId || (bound.dryRun && output.sideEffect !== "none") || (output.sideEffect !== "none" && output.sideEffect !== bound.effect))
                    throw new ConflictError("浏览器观察会话或副作用不符");
                const selected = browserObservationEvidence(output, request);
                if (!selected.text.trim())
                    throw new ConflictError("浏览器没有可持久化的正文");
                const authorization = browserAuthorizationSnapshotSchema.parse((task.payload as {
                    modelInput?: {
                        browserAuthorization?: unknown;
                    };
                }).modelInput?.browserAuthorization);
                assertBrowserAuthorization({ allowedDomains: authorization.allowedDomains, allowInteraction: authorization.allowInteraction }, observation.url, request.action ?? "observe");
                const rows = await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId, task.id));
                const existing = rows.find(row => row.originCallId === call.id);
                if (call.status === "settled") {
                    if (!existing) {
                        const receipt = workerToolResultReceiptSchema.parse(JSON.parse(call.resultText ?? ""));
                        const original = agenticToolOutcomeSchema.parse(receipt.output);
                        const originalData = z.record(z.string(), z.json()).parse(original.data);
                        if (receipt.toolName !== bound.toolName || receipt.toolCallId !== bound.toolCallId || originalData.evidenceRef !== undefined || originalData.snapshotId !== undefined || !isDeepStrictEqual(original, stripEvidenceIdentity(output)))
                            throw new ConflictError("没有证据的原始浏览器回执不能改写或追加身份");
                        return original;
                    }
                    await verifyReadEvidence(tx, task.id, [existing.id], Number.MAX_SAFE_INTEGER);
                    const receipt = workerToolResultReceiptSchema.parse(JSON.parse(call.resultText ?? ""));
                    if (receipt.toolName !== bound.toolName || receipt.toolCallId !== bound.toolCallId || !isDeepStrictEqual(enrich(output, existing), receipt.output))
                        throw new ConflictError("同调用不能改写浏览器正文或动作事实");
                    return agenticToolOutcomeSchema.parse(receipt.output);
                }
                const bytes = Buffer.byteLength(selected.text, "utf8");
                const capacity = rows.reduce((sum, row) => sum + row.byteLength, 0) + bytes <= 8 * 1024 * 1024;
                const row: Evidence = { metadata: {}, id: `evidence_${randomUUID()}`, executionTaskId: task.id, originCallId: call.id, requestedUrl: request.url ?? observation.url, sourceUrl: observation.url, title: observation.title, fullText: selected.text, contentHash: hash(selected.url, selected.text), byteLength: bytes, createdAt: now() };
                // 保存上限不能把已经发生的动作变成unknown；无空间时只持久原动作回执。
                const canonical = enrich(output, row);
                const enriched = capacity ? canonical : stripEvidenceIdentity(output);
                if (capacity)
                    await tx.insert(executionEvidence).values(row);
                await createExecutionCallLedgerService(tx as unknown as Db, deps).settle(ref, call.id, { status: "settled", usage: { totalTokens: 0 }, resultText: JSON.stringify(workerToolResultReceiptSchema.parse({ schemaVersion: 1, kind: "tool", toolName: bound.toolName, toolCallId: bound.toolCallId, output: enriched })) }, current => {
                    if (current.status !== "started" || current.startedAttempt !== ref.attempt || current.toolExecutionClaimId)
                        throw new ConflictError("浏览器结算状态已改变");
                });
                return enriched;
            });
        } };
}
