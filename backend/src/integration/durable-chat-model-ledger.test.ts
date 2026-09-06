import { createServer } from "node:http";
import { it, expect } from "vitest";
import { streamText } from "ai";
import { createDb, executionCalls, eq } from "@creatoros/backend";
import { modelFor } from "@creatoros/ai-worker";
import { createDurableStreamModel } from "@creatoros/ai-worker/durable-stream";
import { createPersistentTaskService } from "../modules/execution/persistent-task.service";
import { createExecutionGenerationPorts } from "../modules/execution/execution-generation-ports.service";
import { createExecutionCallLedgerService } from "../modules/execution/execution-call-ledger.service";
it.each([false, true])("真实账本保存流回执并恢复，保存确认丢失=%s", async (loseAck) => {
  const f = await createDb(),
    ctx = {
      userId: "stream-ledger-u",
      accountId: "stream-ledger-a",
      requestId: "test",
      source: "user" as const,
    },
    now = () => new Date().toISOString(),
    budget = { maxCalls: 3, maxTokens: 100000, deadlineMs: 60000 };
  let requests = 0, lost = false;
  const errors: unknown[] = [];
  const server = createServer((req, res) => {
    req.resume();
    requests++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(
      'data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture","choices":[{"index":0,"delta":{"content":"已确认正文"},"finish_reason":null}]}\n\ndata: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    // 此处复用现有结构化调用端口的冻结输入，验证流回执与账本兼容；不是/api/chat入口测试。
    const modelInput = {
      kind: "model.structured",
      operationKey: "chat-ledger",
      capability: "copilot.assist",
      maxOutputTokens: 128,
      skillId: "copilot.assist",
      facets: {},
      skillSnapshot: {
        snapshotVersion: 1,
        userId: ctx.userId,
        accountId: ctx.accountId,
        resolvedAt: now(),
        platformPolicyVersion: "1",
        platformPolicy: "测试策略",
        skills: [
          {
            skillId: "copilot.assist",
            baseVersion: "1",
            overlayRevision: null,
            overlayVersion: null,
            effective: {
              methodSystem: "测试",
              template: "测试",
              tools: [],
              requiredFacets: [],
              contextRequirements: [],
              outputSchema: { type: "object" },
              completionPolicy: null,
              completionPolicyAdapter: null,
            },
          },
        ],
      },
    };
    const tasks = createPersistentTaskService(f.db, { now }),
      task = await tasks.enqueue(ctx, {
        kind: "ai_task",
        ownerType: "ai_task",
        ownerId: "chat-ledger",
        idempotencyKey: "chat-ledger",
        payload: { modelInput },
      }),
      claim = (await tasks.claimTask({
        taskId: task.id,
        workerId: "worker-fixture",
      }))!,
      ref = {
        executionTaskId: task.id,
        attempt: claim.lease.attempt,
        fenceToken: claim.lease.fenceToken,
      };
    const ledger = createExecutionCallLedgerService(f.db, { now, budget }),
      generation = createExecutionGenerationPorts(f.db, { now, budget }),
      ports = {
        reserve: (input: any) => generation.reserveGenerationCall(ref, input),
        start: async (id: string) => {
          await ledger.start(ref, id);
        },
        settle: async (id: string, value: any) => {
          await generation.settleGenerationCall(ref, { callId: id, ...value });
          if (loseAck && value.status === "settled" && !lost) {
            lost = true;
            throw new Error("ACK_LOST");
          }
        },
      };
    const provider = modelFor({
      apiFormat: "openai_chat",
      baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
      model: "fixture",
      token: "fixture",
    });
    const generate = (prompt: string) =>
      streamText({
        model: createDurableStreamModel({
          model: provider,
          operationKey: "chat-ledger",
          ports,
        }),
        prompt,
        maxOutputTokens: 128,
        maxRetries: 0,
        onError: ({error}) => { errors.push(error); },
      });
    if (loseAck) {
      await generate("原始问题").consumeStream();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ outcome: "unknown_result" });
    } else {
      expect(await generate("原始问题").text).toBe("已确认正文");
    }
    expect(await generate("原始问题").text).toBe("已确认正文");
    expect(requests).toBe(1);
    const calls = await f.db
      .select()
      .from(executionCalls)
      .where(eq(executionCalls.executionTaskId, task.id));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      status: "settled",
      totalTokens: 5,
      providerResult: {
        content: [{ type: "text", text: "已确认正文" }],
        stream: { schemaVersion: 1 },
      },
    });
    await expect(generate("替换问题").text).rejects.toThrow();
    expect(requests).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await f.client.close();
  }
}, 15000);
