import {createHash} from "node:crypto";
import {expect, it, vi} from "vitest";
import type {LanguageModelV4, LanguageModelV4StreamPart} from "@ai-sdk/provider";
import {agenticToolOutcomeSchema, chatWorkerInputSchema, workerPortInputSchemas, workerProviderReceiptSchema,
  type WorkerPort, type WorkerProviderReceipt} from "@creatoros/contract/execution-worker";
import {runChatInWorker} from "./chat-worker-run";

const factory = vi.hoisted(() => ({create: vi.fn()}));
vi.mock("../runtime/provider-factory", () => ({modelFor: factory.create}));
// 脱敏保留公开 seq113/rev3、114/stop、190/rev4、191/stop 的协议形状。
// 无账号、产物、浏览器或真实供应商；唯一真实业务字段是造成漂移的两个步骤标题。
const first = {stepId: "step3_redfox_ai_prog", title: "RedFox 检索公开“AI 编程”话题最多3条；QUOTA_EXHAUSTED如实记录", status: "failed" as const};
const later = {stepId: "step3b_redfox_redo", title: "本轮重新核对 RedFox（search+hotspots）；再次 REDFOX_QUOTA_EXHAUSTED；产物记录使用新 toolCallId", status: "failed" as const};
const plan3 = {revision: 3, progressToken: "rev3-facts", steps: [first]}, plan4 = {revision: 4, progressToken: "rev4-facts", steps: [first, later]};
const digest = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const input = chatWorkerInputSchema.parse({kind: "chat.run", executionEngine: "pi", operationKey: "redacted-task", capability: "copilot.assist",
  userId: "redacted-user", accountId: "redacted-account", conversationId: "redacted-conversation", sourceMessageId: "redacted-message",
  system: "根据真实回执如实交付", messages: [{role: "user", content: "继续原计划"}], maxSteps: 4, maxOutputTokens: 256,
  tools: [{name: "plan.update", version: "fixture", effect: "committed", execution: "host", description: "修订计划", parameters: {type: "object", properties: {}, additionalProperties: false}}]});
const spec = {apiFormat: "openai_chat" as const, baseUrl: null, model: "memory", token: "unused"};

async function historyFixture() {
  const receipts = new Map<string, WorkerProviderReceipt>(), requests = new Map<string, Record<string, unknown>>();
  const toolReceipts = new Map<string, ReturnType<typeof agenticToolOutcomeSchema.parse>>();
  let supplierCalls = 0, toolExecutions = 0, currentPlan = plan3;
  const usage = {inputTokens: {total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0}, outputTokens: {total: 1, text: 1, reasoning: 0}};
  const provider: LanguageModelV4 = {specificationVersion: "v4", provider: "memory", modelId: "memory", supportedUrls: {},
    doGenerate: async () => {throw Error("NO_GENERATE");}, doStream: async () => {
      const index = ++supplierCalls;
      if (index > 4) throw Error("UNEXPECTED_NEW_SUPPLIER_CALL");
      const content: LanguageModelV4StreamPart[] = index === 2 ? [{type: "tool-call", toolCallId: "plan-provider", toolName: "plan_update", input: "{}"}]
        : [{type: "text-start", id: "t"}, {type: "text-delta", id: "t", delta: "已有结果已如实记录"}, {type: "text-end", id: "t"}];
      return {stream: new ReadableStream({start(controller) {
        controller.enqueue({type: "stream-start", warnings: []}); content.forEach(part => controller.enqueue(part));
        controller.enqueue({type: "finish", usage, finishReason: {unified: index === 2 ? "tool-calls" : "stop", raw: "fixture"}}); controller.close();
      }})};
    }};
  factory.create.mockReturnValue(provider);
  const knownPlan = new Map<string, typeof plan3>();
  async function run(options: {replay?: boolean; liveOnly?: boolean; forgedDigest?: boolean} = {}) {
    const stop = new AbortController(), stopModels: unknown[] = [];
    const fingerprints = [...requests].map(([operationKey, request]) => ({callId: operationKey, operationKey,
      inputDigest: digest(options.forgedDigest && operationKey.endsWith("/model/4") ? {...request, temperature: 0.7} : request), status: "settled" as const}));
    const call = async (port: WorkerPort, raw: unknown): Promise<unknown> => {
      if (port === "readCheckpoint") return {revision: 0, ledgerSequence: receipts.size + toolReceipts.size, messages: [], uncheckpointedReceipts: [], pendingCalls: [], recovery: "ready", modelReplayFingerprints: options.replay ? fingerprints : []};
      if (port === "reserveGenerationCall") {
        const r = workerPortInputSchemas.reserveGenerationCall.parse(raw);
        if (!requests.has(r.operationKey)) requests.set(r.operationKey, r.request);
        return {callId: r.operationKey, status: receipts.has(r.operationKey) ? "settled" : "reserved", ...(receipts.has(r.operationKey) ? {providerResult: receipts.get(r.operationKey)} : {})};
      }
      if (port === "startCall" || port === "startAgenticTool") return {callId: (raw as {callId: string}).callId, status: "started"};
      if (port === "settleGenerationCall") {
        const r = workerPortInputSchemas.settleGenerationCall.parse(raw);
        if (r.status === "settled") receipts.set(r.callId, workerProviderReceiptSchema.parse(r.providerResult));
        return {callId: r.callId, status: r.status};
      }
      if (port === "appendStreamEvents") {const r = workerPortInputSchemas.appendStreamEvents.parse(raw); return {nextIndex: r.startIndex + r.chunks.length, lastSequence: 1};}
      if (port === "reserveAgenticTool") return {callId: "plan-execution", toolName: "plan_update", input: {}, status: toolReceipts.has("plan-execution") ? "settled" : "reserved",
        ...(toolReceipts.has("plan-execution") ? {receipt: {schemaVersion: 1, kind: "tool", toolCallId: "plan-provider", toolName: "plan_update", output: toolReceipts.get("plan-execution")}} : {})};
      if (port === "executeAgenticTool") {toolExecutions++; currentPlan = plan4; return agenticToolOutcomeSchema.parse({status: "ok", summary: "计划已保存，版本4", evidence: [], data: {}, error: null, continuation: null, sideEffect: "committed"});}
      if (port === "settleAgenticTool") {
        const r = workerPortInputSchemas.settleAgenticTool.parse(raw);
        if (r.status === "settled") toolReceipts.set(r.callId, agenticToolOutcomeSchema.parse(r.output));
        return {callId: r.callId, status: r.status};
      }
      throw Error(`UNEXPECTED_PORT:${port}`);
    };
    let error: unknown;
    try {await runChatInWorker(input, spec, stop.signal, {call, approve: async () => "approved",
      readPlanStatus: async (modelCallId: unknown) => {
        stopModels.push(modelCallId);
        const key = typeof modelCallId === "string" ? modelCallId : "missing-anchor";
        if (!options.replay) knownPlan.set(key, currentPlan);
        const result = options.replay && !options.liveOnly ? knownPlan.get(key) ?? currentPlan : currentPlan;
        if (stopModels.length === 3) stop.abort(new Error("TEST_PAUSE_AFTER_TWO_CONTINUATIONS"));
        return result;
      }});
    } catch (caught) {error = caught;}
    return {error, stopModels};
  }
  const original = await run();
  expect(original.error).toMatchObject({message: "TEST_PAUSE_AFTER_TWO_CONTINUATIONS"});
  expect(supplierCalls).toBe(4); expect(toolExecutions).toBe(1);
  return {run, receipts, requests, toolReceipts, counts: () => ({supplierCalls, toolExecutions})};
}

it("两个stop的rev3→rev4派生提示沿各自历史模型回放，不新增模型/工具、不改原回执和用量", async () => {
  const f = await historyFixture(), before = structuredClone([...f.receipts]);
  const replay = await f.run({replay: true});
  expect(replay.error).toMatchObject({message: "TEST_PAUSE_AFTER_TWO_CONTINUATIONS"});
  expect(replay.stopModels).toEqual(["redacted-task/model/1", "redacted-task/model/3", "redacted-task/model/4"]);
  expect(f.counts()).toEqual({supplierCalls: 4, toolExecutions: 1});
  expect([...f.receipts]).toEqual(before);
  const firstContinuation = JSON.stringify(f.requests.get("redacted-task/model/2")!.prompt);
  const secondContinuation = JSON.stringify(f.requests.get("redacted-task/model/4")!.prompt);
  expect(firstContinuation).toContain(first.title); expect(firstContinuation).not.toContain(later.title);
  expect(secondContinuation).toContain(later.title);
});

it("独立保留真实故障：强制使用current计划导致已冻结prompt摘要不匹配，绝不新发供应商", async () => {
  const f = await historyFixture(), before = structuredClone([...f.receipts]);
  expect((await f.run({replay: true, liveOnly: true})).error).toMatchObject({errorCode: "CHAT_MODEL_REQUEST_REPLAY_MISMATCH"});
  expect(f.counts()).toEqual({supplierCalls: 4, toolExecutions: 1}); expect([...f.receipts]).toEqual(before);
});

it("正确历史计划也不能绕过其余请求字段的完整digest，参数漂移仍拒绝", async () => {
  const f = await historyFixture(), before = structuredClone([...f.receipts]);
  expect((await f.run({replay: true, forgedDigest: true})).error).toMatchObject({errorCode: "CHAT_MODEL_REQUEST_REPLAY_MISMATCH"});
  expect(f.counts()).toEqual({supplierCalls: 4, toolExecutions: 1}); expect([...f.receipts]).toEqual(before);
});
