import {recoverableChatNodeParents} from "./chat-generation-recovery";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { generateText } from "ai";
import { modelFor } from "@creatoros/ai-worker";
import { createDurableGenerationModel } from "@creatoros/ai-worker/durable-generation";
import { z } from "zod";
import { createDb, executionTasks, eq, type Db } from "@creatoros/backend";
import { createAiService } from "../ai/ai.service";
import { createChatTurnSubmissionService } from "../ai/chat-turn-submission.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
import { createExecutionChatHooksService } from "./execution-chat-hooks.service";
import {createExecutionWorkerOutcomeService} from "./execution-worker-outcome.service";
import { createExecutionChatToolPorts } from "./execution-chat-tool-ports.service";
import { createExecutionModelIdentityService } from "./execution-model-identity.service";
it.each([{ modelId: "another" }, { provider: "another" }])(
  "内部生成拒绝冒用主模型身份：%j",
  async (change) => {
    const f = await fixture(),
      prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
    await expect(
      f.hooks.reserve(f.ref, {
        callId: f.parent.callId,
        operationKey: `${prepared.operationKey}/model/1`,
        request: { ...requestFor(prepared), ...change },
      }),
    ).rejects.toThrow();
  },
);
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
    const f = await fixture({ baseUrl: `http://127.0.0.1:${port}/v1` }),
      prepared = await f.hooks.prepare(f.ref, { callId: f.parent.callId });
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
      { role: "user", content: [{ type: "text", text: prepared.prompt }] },
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
    execution:"worker.script-hooks" as const,
  },
};
it("Worker 开场节点不能绕回宿主执行，即使意外装配了旧处理器", async () => {
  const f = await fixture();
  const execute = vi.fn();
  const ports = createExecutionChatToolPorts(db, { now, budget, tools: {
    "script.hooks": { ...tools["script.hooks"], approve: f.check, execute },
  }});
  await ports.validateTask(f.ref);
  await expect(ports.execute(f.ref, {callId:f.parent.callId})).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  const parent = (await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId);
  expect(parent).toMatchObject({status:"started",toolExecutionClaimId:null});
});
it("冻结的 Worker 开场节点拒绝被宿主实现替换", async () => {
  const f = await fixture();
  const ports = createExecutionChatToolPorts(db, { now, budget, tools: {
    "script.hooks": { ...tools["script.hooks"], execution:"host", approve:f.check, execute:vi.fn() },
  }});
  await expect(ports.validateTask(f.ref)).rejects.toThrow("尚未装配");
});
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
});
afterAll(async () => close());
async function fixture(options: { baseUrl?: string | null } = {}) {
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
          execution:"worker.script-hooks",
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
  await createExecutionModelIdentityService(db, { now }).pin(
    ref,
    "copilot.assist",
    {
      apiFormat: "openai_chat",
      baseUrl: options.baseUrl ?? null,
      model: "fixture",
      token: "fixture",
    },
  );
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
  provider: "openai.chat",
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
  await f.hooks.fail(f.ref,{callId:f.parent.callId,outcome:"waiting_user",errorCode:"auth_401"});
  await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"resume",idempotencyKey:"configured"});
  const claim=(await f.tasks.claimTask({taskId:f.task.executionTaskId,workerId:"worker"}))!;
  f.ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  await f.hooks.restore(f.ref,{callId:f.parent.callId});
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

it.each(["started","unknown","settled"])("子调用为 %s 时不能自报明确失败或恢复",async(status)=>{
 const f=await fixture(),child=await startedChild(f);
 if(status==="unknown")await f.hooks.settle(f.ref,{callId:child.callId,status:"unknown"});
 if(status==="settled")await f.hooks.settle(f.ref,{callId:child.callId,...success});
 await expect(f.hooks.fail(f.ref,{callId:f.parent.callId,outcome:"retry_wait",errorCode:"http_429"})).rejects.toThrow();
 await expect(f.hooks.restore(f.ref,{callId:f.parent.callId})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)?.status).toBe("started");
});
it("通用失败端口不能只看最后拒绝就忽略未完成父调用",async()=>{
 const f=await fixture(),child=await startedChild(f);
 await f.hooks.settle(f.ref,{callId:child.callId,status:"rejected"});
 await expect(createExecutionWorkerOutcomeService(db,{now}).recordFailure(f.ref,{outcome:"retry_wait",errorCode:"http_429"})).rejects.toThrow("未确认调用");
 await expect(f.hooks.restore(f.ref,{callId:f.parent.callId})).rejects.toThrow("没有可恢复");
});

it("明确拒绝尚未挂起和恢复时，禁止 Worker 直接指定子 ID 重发",async()=>{
 const f=await fixture(),child=await startedChild(f),prepared=await f.hooks.prepare(f.ref,{callId:f.parent.callId});
 await f.hooks.settle(f.ref,{callId:child.callId,status:"rejected"});
 await expect(f.hooks.reserve(f.ref,{callId:f.parent.callId,operationKey:`${prepared.operationKey}/model/1`,request:requestFor(prepared),retryOfCallId:child.callId})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(3);
});
it.each(["waiting_user","failed"] as const)("宿主 %s 回执丢失可同键回读，不能将明确拒绝父工具覆写未知",async(outcome)=>{
 const f=await fixture(),child=await startedChild(f);
 await f.hooks.settle(f.ref,{callId:child.callId,status:"rejected"});
 const input={callId:f.parent.callId,outcome,errorCode:outcome==="failed"?"http_400":"auth_401"};
 const first=await f.hooks.fail(f.ref,input);
 await expect(f.hooks.fail(f.ref,input)).resolves.toEqual(first);
 await expect(createExecutionAgenticToolPorts(db,{now,budget,tools}).settle(f.ref,{callId:f.parent.callId,status:"unknown"})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)?.status).toBe("started");
});

it.each(["未知子","缺用量","预留子","坏回执","宿主执行","跨任务子","倒序子","非原工具","错误账号","宿主冻结声明","其他在途调用","两个成功子"])("完成恢复拒绝不完整事实：%s",async(kind)=>{
 const f=await fixture(),child=await startedChild(f);
 await f.hooks.settle(f.ref,{callId:child.callId,...success});
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 const calls=(await f.ledger.inspect(f.ref)).calls;
 expect(recoverableChatNodeParents(task!,calls).completedHooks).toEqual([f.parent.callId]);
 const changed=structuredClone(calls),changedTask=structuredClone(task!);
 const parent=changed.find(call=>call.id===f.parent.callId)!,model=changed.find(call=>call.id===child.callId)!;
 if(kind==="未知子")model.status="unknown";
 if(kind==="缺用量")model.totalTokens=null;
 if(kind==="预留子")model.status="reserved";
 if(kind==="坏回执")model.providerResult={};
 if(kind==="宿主执行")parent.toolExecutionClaimId="host-claim";
 if(kind==="跨任务子")model.executionTaskId="other-task";
 if(kind==="倒序子")model.sequence=parent.sequence;
 if(kind==="非原工具")parent.operationKey="other-tool";
 if(kind==="错误账号")changedTask.accountId="other-account";
 if(kind==="宿主冻结声明")(changedTask.payload as {modelInput:{tools:Array<{execution?:string}>}}).modelInput.tools[0]!.execution="host";
 if(kind==="其他在途调用")changed.push({...parent,id:"other-parent",sequence:model.sequence+1});
 if(kind==="两个成功子")changed.push({...model,id:"other-child",sequence:model.sequence+1,retryOfCallId:model.id});
 expect(recoverableChatNodeParents(changedTask,changed).completedHooks).toEqual([]);
});

it("开场首次准备持久冻结，重建服务不重新拼接提示词或复用可变返回对象", async () => {
  const { createExecutionNodePreparationService } = await import("./execution-node-preparation.service");
  const f = await fixture();
  const prepared = await f.hooks.prepare(f.ref, {callId:f.parent.callId});
  const original = prepared.prompt;
  prepared.prompt = "调用方修改";
  expect((await f.hooks.prepare(f.ref,{callId:f.parent.callId})).prompt).toBe(original);
  const call = (await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!;
  const rebuild = vi.fn(async()=>{throw new Error("恢复不得重拼提示词");});
  const restored = await createExecutionNodePreparationService(db,{now}).readOrPrepare(f.ref,{parentCallId:call.id,inputDigest:call.inputDigest,nodeVersion:"script.hooks.v1"},z.object({prompt:z.string(),system:z.string(),grounding:z.array(z.string())}).strict(),rebuild);
  expect(restored.prompt).toBe(original);expect(rebuild).not.toHaveBeenCalled();
});

it("并发首次准备只保存一个胜者，迟到资料不能覆盖已保存节点", async () => {
  const { createExecutionNodePreparationService } = await import("./execution-node-preparation.service");
  const f=await fixture(), call=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!;
  const service=createExecutionNodePreparationService(db,{now}), key={parentCallId:call.id,inputDigest:call.inputDigest,nodeVersion:"test.node.v1"}, schema=z.object({prompt:z.string()}).strict();
  let release!: (value:{prompt:string})=>void, started!:()=>void;
  const waiting=new Promise<void>(resolve=>{started=resolve;});
  const slow=service.readOrPrepare(f.ref,key,schema,()=>{started();return new Promise(resolve=>{release=resolve;});});
  await waiting;
  const winner=await service.readOrPrepare(f.ref,key,schema,async()=>({prompt:"先保存的真实资料"}));
  release({prompt:"迟到资料"});
  expect(await slow).toEqual(winner);
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  expect(JSON.stringify(task!.payload)).toContain("先保存的真实资料");
  expect(JSON.stringify(task!.payload)).not.toContain("迟到资料");
});

it("取消等待中的准备不保存迟到结果，错误父调用或摘要不执行准备", async () => {
  const { createExecutionNodePreparationService } = await import("./execution-node-preparation.service");
  const f=await fixture(), call=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!;
  const service=createExecutionNodePreparationService(db,{now}), key={parentCallId:call.id,inputDigest:call.inputDigest,nodeVersion:"test.node.v1"}, schema=z.object({prompt:z.string()}).strict();
  const prepare=vi.fn(async()=>({prompt:"不应执行"}));
  await expect(service.readOrPrepare(f.ref,{...key,inputDigest:"错误摘要"},schema,prepare)).rejects.toThrow();
  await expect(service.readOrPrepare(f.ref,{...key,parentCallId:"另一个任务的父调用"},schema,prepare)).rejects.toThrow();
  expect(prepare).not.toHaveBeenCalled();
  const controller=new AbortController();
  await expect(service.readOrPrepare(f.ref,key,schema,async()=>{controller.abort();return {prompt:"迟到结果"};},controller.signal)).rejects.toThrow();
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  expect((task!.payload as Record<string,unknown>).nodePreparations).toBeUndefined();
});

it("已保存节点内容或版本被改动时拒绝重建，不能覆盖原证据", async () => {
  const { createExecutionNodePreparationService } = await import("./execution-node-preparation.service");
  const f=await fixture();await f.hooks.prepare(f.ref,{callId:f.parent.callId});
  const call=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!;
  const service=createExecutionNodePreparationService(db,{now}), schema=z.object({prompt:z.string(),system:z.string(),grounding:z.array(z.string())}).strict();
  const prepare=vi.fn(async()=>({prompt:"新",system:"新",grounding:[]}));
  await expect(service.readOrPrepare(f.ref,{parentCallId:call.id,inputDigest:call.inputDigest,nodeVersion:"changed"},schema,prepare)).rejects.toThrow();
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  const payload=structuredClone(task!.payload) as {nodePreparations:Record<string,{value:{prompt:string}}>};
  payload.nodePreparations[call.id]!.value.prompt="被改动的提示词";
  await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,task!.id));
  await expect(f.hooks.prepare(f.ref,{callId:call.id})).rejects.toThrow("已保存节点准备");
  expect(prepare).not.toHaveBeenCalled();
});

it("资料读取挂起时取消立即结束等待，迟到准备不能写入原任务", async () => {
  const { createExecutionNodePreparationService } = await import("./execution-node-preparation.service");
  const f=await fixture(), call=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!;
  const controller=new AbortController(), schema=z.object({prompt:z.string()});
  let release!:(value:{prompt:string})=>void, started!:()=>void, ended=false;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  const work=createExecutionNodePreparationService(db,{now}).readOrPrepare(f.ref,{parentCallId:call.id,inputDigest:call.inputDigest,nodeVersion:"test.node.v1"},schema,()=>{started();return new Promise(resolve=>{release=resolve;});},controller.signal);
  const observed=work.then(()=>{ended=true;return "saved";},()=>{ended=true;return "cancelled";});
  await ready;controller.abort();
  try { await vi.waitFor(()=>expect(ended).toBe(true),{timeout:200});expect(await observed).toBe("cancelled"); }
  finally { release({prompt:"迟到不能保存"});await observed; }
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  expect((task!.payload as Record<string,unknown>).nodePreparations).toBeUndefined();
});

it("准备期间任务收到持久取消命令，即使本地信号未触发也不能保存节点", async () => {
  const { createExecutionNodePreparationService } = await import("./execution-node-preparation.service");
  const f=await fixture(), call=(await f.ledger.inspect(f.ref)).calls.find(call=>call.id===f.parent.callId)!;
  const schema=z.object({prompt:z.string()});
  await expect(createExecutionNodePreparationService(db,{now}).readOrPrepare(f.ref,{parentCallId:call.id,inputDigest:call.inputDigest,nodeVersion:"test.node.v1"},schema,async()=>{
    await f.tasks.command(f.ctx,{taskIds:[f.task.executionTaskId],command:"cancel",idempotencyKey:"cancel-preparing-node"});
    return {prompt:"取消后不得保存"};
  })).rejects.toThrow();
  const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
  expect((task!.payload as Record<string,unknown>).nodePreparations).toBeUndefined();
});
