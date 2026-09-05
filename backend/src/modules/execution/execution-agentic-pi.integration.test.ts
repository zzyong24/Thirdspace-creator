import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createDb, type Db } from "@creatoros/backend";
import { runAgenticInWorker } from "@creatoros/ai-worker/agentic-run";
import { workerPortInputSchemas, type WorkerPort } from "@creatoros/contract/execution-worker";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticModelPorts } from "./execution-agentic-model-ports.service";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
import { createExecutionGenerationPorts } from "./execution-generation-ports.service";
import { createExecutionCheckpointService } from "./execution-checkpoint.service";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";

const ctx = { userId: "pi-integration", accountId: "pi-integration", requestId: "test", source: "user" as const };
const now = () => "2026-09-05T00:00:00.000Z";
const deps = { now, budget: { maxCalls: 12, maxTokens: 100000, deadlineMs: 60000 } };
const input = {
  kind: "agentic.run" as const, operationKey: "research", taskType: "agentic.research" as const,
  goal: "读取网页后总结", systemPrompt: "使用 web.read 读取目标，再依据正文总结。", capability: "research",
  maxOutputTokens: 200, dryRun: false,
  tools: [{ name: "web.read", version: "1", label: "读取", description: "读取网页", effect: "none" as const,
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } }],
};
const outcome = { status: "ok", summary: "已读网页", evidence: [{ sourceUrl: "https://example.com/evidence", text: "独立集成测试的真实端口正文" }],
  data: { text: "独立集成测试的真实端口正文" }, error: null, continuation: null, sideEffect: "none" };

describe("真实 Pi、HTTP 与 PGlite 执行账本集成", () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => { const connection = await createDb(); db = connection.db; close = () => connection.client.close(); });
  afterAll(async () => close?.());

  it.each([false, true])("检查点回执丢失=%s：两轮模型与一次工具可恢复且整轮重放不重复调用", async (loseCheckpointReceipt) => {
    const tasks = createPersistentTaskService(db, { now });
    const task = await tasks.enqueue(ctx, { kind: "ai_task", ownerType: "ai_task", ownerId: `pi-${loseCheckpointReceipt}`,
      idempotencyKey: `pi-${loseCheckpointReceipt}`, payload: { modelInput: input } });
    const claim = await tasks.claimTask({ taskId: task.id, workerId: "integration-worker" });
    if (!claim) throw new Error("missing claim");
    const ref = { executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
    const ledger = createExecutionCallLedgerService(db, deps);
    const models = createExecutionAgenticModelPorts(db, deps);
    const tools = createExecutionAgenticToolPorts(db, { ...deps, tools: {
      "web.read": { version: "1", effect: "none", parameters: z.object({ url: z.string().url() }).strict() },
    } });
    const generation = createExecutionGenerationPorts(db, deps);
    const workerCalls = createExecutionWorkerCallPorts(db, deps);
    const checkpoints = createExecutionCheckpointService(db, { now });
    const frozenInput = await workerCalls.readTaskContext(ref);
    if (frozenInput.kind !== "agentic.run") throw new Error("unexpected frozen input");
    expect((await ledger.inspect(ref)).calls).toHaveLength(0);
    expect((await checkpoints.read(ref)).budget).toEqual(deps.budget);
    let toolExecutions = 0;
    let lost = false;
    const invoke = async (port: WorkerPort, data: unknown): Promise<unknown> => {
      if (port === "readCheckpoint") return checkpoints.read(ref);
      if (port === "saveCheckpoint") {
        const receipt = await checkpoints.save(ref, data);
        if (loseCheckpointReceipt && !lost) { lost = true; throw new Error("已落库的检查点回执丢失"); }
        return receipt;
      }
      if (port === "reserveAgenticModel") return models.reserve(ref, data);
      if (port === "reserveAgenticTool") return tools.reserve(ref, data);
      if (port === "startAgenticTool") return tools.start(ref, data);
      if (port === "settleAgenticTool") return tools.settle(ref, data);
      if (port === "settleGenerationCall") return generation.settleGenerationCall(ref, data);
      if (port === "startCall") return workerCalls.startCall(ref, data);
      if (port === "executeAgenticTool") {
        const { callId } = workerPortInputSchemas.executeAgenticTool.parse(data);
        const call = (await ledger.inspect(ref)).calls.find(row => row.id === callId);
        expect(call).toMatchObject({ kind: "tool", status: "started" });
        toolExecutions++;
        return outcome;
      }
      throw new Error(`unexpected port ${port}`);
    };
    const requests: string[] = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push(Buffer.concat(chunks).toString("utf8"));
      const first = requests.length === 1;
      const delta = first
        ? { role: "assistant", tool_calls: [{ index: 0, id: "read-1", type: "function", function: { name: "web.read", arguments: JSON.stringify({ url: "https://example.com/evidence" }) } }] }
        : { role: "assistant", content: "已依据读取正文完成总结" };
      const chunk = { id: `model-${requests.length}`, object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta, finish_reason: null }] };
      const done = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: first ? "tool_calls" : "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } };
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const model = { apiFormat: "openai_chat" as const, authStyle: "bearer" as const, baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "test", token: "local-fixture" };
      const run = () => runAgenticInWorker(frozenInput, model, new AbortController().signal, invoke);
      if (loseCheckpointReceipt) {
        await expect(run()).rejects.toMatchObject({ outcome: "unknown_result" });
        expect(requests).toHaveLength(1);
        expect(toolExecutions).toBe(0);
        expect(await checkpoints.read(ref)).toMatchObject({ revision: 1, messages: [{ role: "assistant" }] });
      }
      const result = await run();
      expect(result).toMatchObject({ actualEngine: "pi", stopReason: "completed" });
      expect(requests).toHaveLength(2);
      const firstRequest = JSON.parse(requests[0]!) as { messages: Array<{ role: string; content: unknown }> };
      expect(firstRequest.messages.find(message => message.role === "system")?.content).toBe(frozenInput.systemPrompt);
      expect(requests[1]).toContain("独立集成测试的真实端口正文");
      expect(requests[1]).toContain("https://example.com/evidence");
      expect(toolExecutions).toBe(1);
      const state = await ledger.inspect(ref);
      expect(state.calls.map(call => [call.kind, call.status])).toEqual([["model", "settled"], ["tool", "settled"], ["model", "settled"]]);
      expect(state.spentTokens).toBe(14);
      const saved = await checkpoints.read(ref);
      expect(saved.messages.map(message => message.role)).toEqual(["assistant", "tool", "assistant"]);
      expect(await run()).toEqual(result);
      expect(requests).toHaveLength(2);
      expect(toolExecutions).toBe(1);
      expect((await ledger.inspect(ref)).calls).toHaveLength(3);
      expect((await checkpoints.read(ref)).revision).toBe(saved.revision);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 30000);
});
