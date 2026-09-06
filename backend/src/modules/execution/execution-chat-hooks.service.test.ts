import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { generateText } from "ai";
import { modelFor } from "@creatoros/ai-worker";
import { createDurableGenerationModel } from "@creatoros/ai-worker/durable-generation";
import { z } from "zod";
import { createDb, type Db } from "@creatoros/backend";
import { createAiService } from "../ai/ai.service";
import { createChatTurnSubmissionService } from "../ai/chat-turn-submission.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
import { createExecutionChatHooksService } from "./execution-chat-hooks.service";
it.each([
  { providerOptions: { custom: { flag: true } } },
  { temperature: 2 },
  { responseFormat: { type: "json" } },
])("纯文本节点拒绝额外供应商参数：%j", async (change) => {
  const f = await fixture(),
    prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  await expect(
    f.hooks.reserve(f.ref, {
      callId: f.parent.callId,
      operationKey: `${prepared.operationKey}/model/1`,
      request: { ...requestFor(prepared), ...change },
    }),
  ).rejects.toThrow();
});
it("新租约从已结算子模型回执恢复父候选，不再预留模型", async () => {
  const f = await fixture(),
    child = await startedChild(f);
  await f.hooks.settle(f.ref, { callId: child.callId, ...success });
  await f.tasks.command(f.ctx, {
    taskIds: [f.task.executionTaskId],
    command: "pause",
    idempotencyKey: "pause",
  });
  await f.tasks.acknowledgeControl({
    taskId: f.task.executionTaskId,
    workerId: "worker",
    attempt: f.ref.attempt,
  });
  await f.tasks.command(f.ctx, {
    taskIds: [f.task.executionTaskId],
    command: "resume",
    idempotencyKey: "resume",
  });
  const claim = (await f.tasks.claimTask({
    taskId: f.task.executionTaskId,
    workerId: "worker",
  }))!;
  const ref = {
    ...f.ref,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  const restored = createExecutionChatHooksService(db, {
    now,
    budget,
    tools,
    check: f.check,
  });
  await expect(
    restored.settle(ref, { callId: child.callId, ...success }),
  ).resolves.toMatchObject({ status: "settled" });
  expect(
    (await restored.complete(ref, { callId: f.parent.callId })).data,
  ).toEqual({ kind: "script.hooks", items: [] });
  expect((await f.ledger.inspect(ref)).calls).toHaveLength(3);
});
let db: Db,
  close: () => Promise<void>,
  seq = 0;
it("真实 SDK 纯文本请求接宿主账本，重建模型包装后回放不增加 HTTP 请求", async () => {
  const f = await fixture(),
    prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  const bodies: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    bodies.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "fixture",
        object: "chat.completion",
        created: 1,
        model: "fixture",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: '[{"text":"HTTP 开场","angle":"真实调用"}]',
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const run = () =>
      generateText({
        model: createDurableGenerationModel({
          model: modelFor({
            apiFormat: "openai_chat",
            baseUrl: `http://127.0.0.1:${port}/v1`,
            model: "fixture",
            token: "fixture",
          }),
          operationKey: prepared.operationKey,
          ports: {
            reserve: (input) =>
              f.hooks.reserve(f.ref, {
                ...JSON.parse(JSON.stringify(input)),
                callId: f.parent.callId,
              }),
            start: async (callId) => {
              await f.hooks.start(f.ref, { callId });
            },
            settle: async (callId, input) => {
              await f.hooks.settle(f.ref, { callId, ...input });
            },
          },
        }),
        system: prepared.system,
        prompt: prepared.prompt,
        maxOutputTokens: prepared.maxOutputTokens,
        maxRetries: 0,
      });
    expect((await run()).text).toContain("HTTP 开场");
    expect((await run()).text).toContain("HTTP 开场");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.messages).toEqual([
      { role: "system", content: prepared.system },
      { role: "user", content: prepared.prompt },
    ]);
    expect(
      (await f.hooks.complete(f.ref, { callId: f.parent.callId })).data,
    ).toEqual({
      kind: "script.hooks",
      items: [{ text: "HTTP 开场", angle: "真实调用" }],
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
const now = () => "2026-09-06T10:00:00.000Z",
  budget = { maxCalls: 10, maxTokens: 100000, deadlineMs: 60000 };
const tools = {
  "script.hooks": {
    version: "hooks-v1",
    parameters: z
      .object({
        topic: z.string().optional(),
        direction: z.string().optional(),
        extraBrief: z.string().optional(),
      })
      .strict(),
    effect: "proposal" as const,
  },
};
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
});
afterAll(async () => close());
async function fixture() {
  const ctx = {
    userId: "hooks-u",
    accountId: `hooks-a-${++seq}`,
    requestId: "test",
    source: "user" as const,
  };
  const unexpectedWrite = async (): Promise<never> => {
    throw new Error("测试不允许候选采纳写入");
  };
  const ai = createAiService({
    db,
    now,
    nextId: (prefix) => `${prefix}-${++seq}`,
    artifacts: { createVersion: unexpectedWrite },
    knowledge: { createKnowledge: unexpectedWrite },
    candidate: {
      createFromAIResult: unexpectedWrite,
      enrichCard: unexpectedWrite,
    },
    learnings: { createLearning: unexpectedWrite },
    publishing: { createPublicationFromDraft: unexpectedWrite },
    materialLinks: { link: unexpectedWrite },
    positioning: {
      upsertProfile: unexpectedWrite,
      createStatementVersion: unexpectedWrite,
    },
    calibration: { createDraftPrediction: unexpectedWrite },
  });
  const conversation = await ai.createConversation(ctx, {
    title: "开场",
    projectId: null,
    scope: "global",
  });
  const source = await ai.createMessage(ctx, conversation.id, {
    content: "生成开场",
    attachments: [],
  });
  const hostContext = {
    schemaVersion: 1 as const,
    chatContext: { surface: "topics" },
    mediaRoute: null,
    positioningScratch: false,
    trustedScriptSources: [],
    scriptHooksGeneration: { version: 1 as const, maxOutputTokens: 2048 },
    scriptHooksContext: {
      selectionTitle: "真实选题",
      positioningBrief: "原定位",
      projectBriefHard: "",
      userMaterialHardBrief: "",
      userMaterialRefBrief: "",
      knowledgeBrief: "",
    },
    skillSnapshot: {
      snapshotVersion: 1 as const,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: "fixed",
      platformPolicyVersion: "1",
      platformPolicy: "候选",
      skills: [
        {
          skillId: "chatbox.topic",
          baseVersion: "1",
          overlayRevision: null,
          overlayVersion: null,
          effective: {
            methodSystem: "策略",
            template: "",
            tools: ["script.hooks"],
            requiredFacets: [],
            contextRequirements: [],
            outputSchema: null,
            completionPolicy: null,
            completionPolicyAdapter: null,
          },
        },
      ],
    },
  };
  const task = await createChatTurnSubmissionService(db, {
    now,
    assemble: async () => ({
      system: "策略",
      messages: [{ role: "user", content: "生成开场" }],
      capability: "copilot.assist",
      maxSteps: 6,
      maxOutputTokens: 128,
      tools: [
        {
          name: "script.hooks",
          version: "hooks-v1",
          description: "开场",
          parameters: { type: "object" },
          effect: "proposal",
        },
      ],
      hostContext,
    }),
  }).submit(ctx, {
    conversationId: conversation.id,
    sourceMessageId: source.id,
  });
  const tasks = createPersistentTaskService(db, { now }),
    claim = (await tasks.claimTask({
      taskId: task.executionTaskId,
      workerId: "worker",
    }))!;
  const ref = {
    executionTaskId: task.executionTaskId,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  const ledger = createExecutionCallLedgerService(db, { now, budget }),
    ports = createExecutionAgenticToolPorts(db, { now, budget, tools });
  const model = await ledger.reserve(ref, {
    operationKey: "root",
    kind: "model",
    inputDigest: "sha256:" + "a".repeat(64),
    reservedTokens: 20,
  });
  await ledger.start(ref, model.id);
  await ledger.settle(ref, model.id, {
    status: "settled",
    usage: {},
    providerResult: {
      content: [
        {
          type: "tool-call",
          toolCallId: "hooks",
          toolName: "script_hooks",
          input: '{"topic":" "}',
        },
      ],
      finishReason: { unified: "tool-calls" },
      usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } },
      warnings: [],
    },
  });
  const parent = await ports.reserve(ref, {
    modelCallId: model.id,
    toolCallId: "hooks",
  });
  await ports.start(ref, { callId: parent.callId });
  const check = vi.fn(async () => ({ status: "not-applicable" as const }));
  const hooks = createExecutionChatHooksService(db, {
    now,
    budget,
    tools,
    check,
  });
  return { ctx, ref, parent, ledger, hooks, check, tasks, task };
}
const requestFor = (prepared: {
  prompt: string;
  system: string;
  maxOutputTokens: number;
}) => ({
  prompt: [
    { role: "system", content: prepared.system },
    { role: "user", content: [{ type: "text", text: prepared.prompt }] },
  ],
  maxOutputTokens: prepared.maxOutputTokens,
  modelId: "fixture",
  provider: "fixture",
});
const success = {
  status: "settled" as const,
  usage: {},
  providerResult: {
    content: [{ type: "text" as const, text: "[]" }],
    finishReason: { unified: "stop" as const },
    usage: { inputTokens: { total: 4 }, outputTokens: { total: 3 } },
    warnings: [],
  },
};
async function startedChild(f: Awaited<ReturnType<typeof fixture>>) {
  const prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  const child = await f.hooks.reserve(f.ref, {
    callId: f.parent.callId,
    operationKey: `${prepared.operationKey}/model/1`,
    request: requestFor(prepared),
  });
  await f.hooks.start(f.ref, { callId: child.callId });
  return child;
}
it("等待授权时根模型已推进则不能返回旧回合生成指令", async () => {
  const f = await fixture();
  f.check.mockImplementationOnce(async () => {
    const next = await f.ledger.reserve(f.ref, {
      operationKey: "next-root",
      kind: "model",
      inputDigest: "sha256:" + "b".repeat(64),
      reservedTokens: 20,
    });
    await f.ledger.start(f.ref, next.id);
    await f.ledger.settle(f.ref, next.id, success);
    return { status: "not-applicable" };
  });
  await expect(
    f.hooks.prepare(f.ref, { callId: f.parent.callId }),
  ).rejects.toThrow();
  expect(
    (await f.ledger.inspect(f.ref)).calls.filter((call) => call.parentCallId),
  ).toHaveLength(0);
});
it("取消后原执行可记入已发生用量，但不能再准备模型", async () => {
  const f = await fixture(),
    child = await startedChild(f);
  await f.tasks.command(f.ctx, {
    taskIds: [f.task.executionTaskId],
    command: "cancel",
    idempotencyKey: "cancel",
  });
  await expect(
    f.hooks.settle(f.ref, { callId: child.callId, ...success }),
  ).resolves.toMatchObject({ status: "settled" });
  await expect(
    f.hooks.prepare(f.ref, { callId: f.parent.callId }),
  ).rejects.toThrow();
});
it.each(["denied", "approval-required"])(
  "宿主授权为 %s 时不能准备模型",
  async (status) => {
    const f = await fixture(),
      hooks = createExecutionChatHooksService(db, {
        now,
        budget,
        tools,
        check: async () => ({ status }),
      });
    await expect(
      hooks.prepare(f.ref, { callId: f.parent.callId }),
    ).rejects.toThrow("授权");
    expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
  },
);
it.each([
  { prompt: [] },
  { maxOutputTokens: 65536 },
  { tools: [] },
  { toolChoice: { type: "required" } },
  { headers: { authorization: "fixture" } },
])("拒绝改变原提示词、输出上限或附加工具/请求头：%j", async (change) => {
  const f = await fixture(),
    prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  await expect(
    f.hooks.reserve(f.ref, {
      callId: f.parent.callId,
      operationKey: `${prepared.operationKey}/model/1`,
      request: { ...requestFor(prepared), ...change },
    }),
  ).rejects.toThrow();
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
});
it("并发预留共享调用，明确拒绝后只允许同键有据重试", async () => {
  const f = await fixture(),
    prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  const request = {
    callId: f.parent.callId,
    operationKey: `${prepared.operationKey}/model/1`,
    request: requestFor(prepared),
  };
  const [a, b] = await Promise.all([
    f.hooks.reserve(f.ref, request),
    f.hooks.reserve(f.ref, request),
  ]);
  expect(a.callId).toBe(b.callId);
  await f.hooks.start(f.ref, { callId: a.callId });
  await f.hooks.settle(f.ref, { callId: a.callId, status: "rejected" });
  expect((await f.hooks.reserve(f.ref, request)).status).toBe("rejected");
  const retry = await f.hooks.reserve(f.ref, {
    ...request,
    retryOfCallId: a.callId,
  });
  await f.hooks.start(f.ref, { callId: retry.callId });
  await f.hooks.settle(f.ref, { callId: retry.callId, ...success });
  const restored = createExecutionChatHooksService(db, {
    now,
    budget,
    tools,
    check: f.check,
  });
  expect(
    (await restored.prepare(f.ref, { callId: f.parent.callId }))
      .maxOutputTokens,
  ).toBe(2048);
  expect(
    (await restored.complete(f.ref, { callId: f.parent.callId })).data,
  ).toEqual({ kind: "script.hooks", items: [] });
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(4);
});
it("普通回执端口不能把未知模型结果改成成功", async () => {
  const f = await fixture(),
    child = await startedChild(f);
  await f.hooks.settle(f.ref, { callId: child.callId, status: "unknown" });
  await expect(
    f.hooks.settle(f.ref, { callId: child.callId, ...success }),
  ).rejects.toThrow();
  expect(
    (await f.ledger.inspect(f.ref)).calls.find(
      (call) => call.id === child.callId,
    )?.status,
  ).toBe("unknown");
});
it("已确认的非文本供应商回执保留用量并返回明确错误，不变成未知提交", async () => {
  const f = await fixture(),
    child = await startedChild(f);
  await f.hooks.settle(f.ref, {
    callId: child.callId,
    ...success,
    providerResult: {
      ...success.providerResult,
      content: [
        {
          type: "tool-call",
          toolCallId: "unexpected",
          toolName: "unexpected",
          input: "{}",
        },
      ],
      finishReason: { unified: "tool-calls" },
    },
  });
  const result = await f.hooks.complete(f.ref, { callId: f.parent.callId });
  expect(result).toMatchObject({
    status: "error",
    sideEffect: "none",
    error: { code: "no_evidence", retryable: false },
  });
  expect(
    (await f.ledger.inspect(f.ref)).calls.find(
      (call) => call.id === child.callId,
    ),
  ).toMatchObject({ status: "settled", totalTokens: 7 });
  expect(
    (await f.ledger.inspect(f.ref)).calls.find(
      (call) => call.id === f.parent.callId,
    )?.status,
  ).toBe("settled");
});
it.each(["settled", "rejected"] as const)(
  "新租约不能将旧租约在途模型改为 %s",
  async (status) => {
    const f = await fixture(),
      child = await startedChild(f);
    await f.tasks.command(f.ctx, {
      taskIds: [f.task.executionTaskId],
      command: "pause",
      idempotencyKey: "pause",
    });
    await f.tasks.acknowledgeControl({
      taskId: f.task.executionTaskId,
      workerId: "worker",
      attempt: f.ref.attempt,
    });
    await f.tasks.command(f.ctx, {
      taskIds: [f.task.executionTaskId],
      command: "resume",
      idempotencyKey: "resume",
    });
    const claim = (await f.tasks.claimTask({
      taskId: f.task.executionTaskId,
      workerId: "worker",
    }))!;
    const fresh = {
      ...f.ref,
      attempt: claim.lease.attempt,
      fenceToken: claim.lease.fenceToken,
    };
    await expect(
      f.hooks.settle(fresh, {
        callId: child.callId,
        ...(status === "settled" ? success : { status }),
      }),
    ).rejects.toThrow();
    expect(
      (await f.ledger.inspect(fresh)).calls.find(
        (call) => call.id === child.callId,
      )?.status,
    ).toBe("started");
  },
);
it("宿主从原上下文准备并由原模型回执重建候选，重投不增加模型调用", async () => {
  const f = await fixture(),
    prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  expect(prepared.prompt).toContain("真实选题");
  expect(prepared.prompt).toContain("原定位");
  const request = {
    callId: f.parent.callId,
    operationKey: `${prepared.operationKey}/model/1`,
    request: requestFor(prepared),
  };
  const child = await f.hooks.reserve(f.ref, request);
  await f.hooks.start(f.ref, { callId: child.callId });
  await f.hooks.settle(f.ref, {
    callId: child.callId,
    status: "settled",
    usage: {},
    providerResult: {
      content: [{ type: "text", text: '[{"text":"真实开场","angle":"场景"}]' }],
      finishReason: { unified: "stop" },
      usage: { inputTokens: { total: 4 }, outputTokens: { total: 3 } },
      warnings: [],
    },
  });
  const result = await f.hooks.complete(f.ref, { callId: f.parent.callId });
  expect(result.data).toEqual({
    kind: "script.hooks",
    items: [{ text: "真实开场", angle: "场景" }],
  });
  expect(await f.hooks.complete(f.ref, { callId: f.parent.callId })).toEqual(
    result,
  );
  expect((await f.hooks.reserve(f.ref, request)).callId).toBe(child.callId);
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(3);
});
it("未知内部结果不能冒充候选或换键重发", async () => {
  const f = await fixture(),
    prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
  const request = {
    callId: f.parent.callId,
    operationKey: `${prepared.operationKey}/model/1`,
    request: requestFor(prepared),
  };
  const child = await f.hooks.reserve(f.ref, request);
  await f.hooks.start(f.ref, { callId: child.callId });
  await f.hooks.settle(f.ref, { callId: child.callId, status: "unknown" });
  await expect(
    f.hooks.complete(f.ref, { callId: f.parent.callId }),
  ).rejects.toThrow();
  await expect(
    f.hooks.reserve(f.ref, {
      ...request,
      operationKey: `${prepared.operationKey}/model/2`,
    }),
  ).rejects.toThrow();
});
