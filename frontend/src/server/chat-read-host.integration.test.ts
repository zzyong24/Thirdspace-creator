import { it, expect, vi } from "vitest";
import type { Db } from "@creatoros/backend";
const fixture = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock("@creatoros/backend", async original => {
  const actual = await original<typeof import("@creatoros/backend")>();
  return { ...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const result = await actual.createConfiguredDb(...args); fixture.db = result.db; return result;
  } };
});
import {workerSkillSnapshotSchema} from "@creatoros/contract/execution-worker";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import { createPersistentTaskService, createExecutionCallLedgerService } from "@creatoros/backend/modules/execution";
import { createExecutionChatToolPorts } from "../../../backend/src/modules/execution/execution-chat-tool-ports.service";
import { createChatTurnSubmissionService } from "../../../backend/src/modules/ai/chat-turn-submission.service";
import {createAiRepository} from "../../../backend/src/modules/ai/ai.repository";
import {createChatHostContextReader} from "../../../backend/src/modules/ai/chat-host-context.service";
import {createChatReadToolResolver} from "../../../backend/src/modules/ai-runtime/chat-read-tool-resolver";
import { createChatReadToolHost } from "../../../backend/src/modules/ai-runtime/chat-read-tool-host";
import { prepareChatToolDefinitions } from "../../../backend/src/modules/ai-runtime/chat-tool-definitions";
import { buildChatTools, type ChatToolDeps } from "../../../backend/src/modules/ai-runtime/chat-tools";
import { getChatRuntime, compositeTransport, __resetPersistenceForTests } from "./persistence-client";

it("真实聊天读取经租约/授权/账本结算：账号隔离、回放不重复读取、瞬断不记未知", async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DATA_DIR", ""); __resetPersistenceForTests();
  try {
    const runtime = await getChatRuntime(), db = fixture.db!;
    const a: RequestContext = { userId: "read-host", accountId: "a", requestId: "r", source: "user" };
    const b = { ...a, accountId: "b" };
    for (const ctx of [a, b]) await compositeTransport.request({ id: "projects.create" } as Endpoint, { body: { title: `账号${ctx.accountId}项目`, brief: "" } } as never, ctx);
    let reads = 0, fail = false;
    // 只装配这一真实领域读取；其余不在白名单的工具不会被执行。
    const toolsFor = (ctx: RequestContext) => buildChatTools(["context.projects"], { listProjects: async (options: { limit: number; offset: number }) => {
      return runtime.contextReaders.listProjects(ctx, options);
    } } as ChatToolDeps);
    const prototypes = toolsFor(a), definitions = (await prepareChatToolDefinitions(prototypes)).definitions;
    const host = await createChatReadToolHost(prototypes, createChatReadToolResolver(createChatHostContextReader(db), {
      ...runtime.contextReaders, listProjects: async (ctx, options) => {
        reads++; if (fail) throw Object.assign(new Error("fixture unavailable"), {statusCode:503});
        return runtime.contextReaders.listProjects(ctx, options);
      },
    }));
    const now = () => new Date().toISOString(), budget = { maxCalls: 10, maxTokens: 10000, deadlineMs: 60000 };
    const tasks = createPersistentTaskService(db, { now }), ledger = createExecutionCallLedgerService(db, { now, budget });
    const ports = createExecutionChatToolPorts(db, { now, budget, tools: host });
    let seq = 0;
    async function execute(ctx: RequestContext) {
      const id = `read-host-${++seq}`;
      const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId!,now,nextId:prefix=>`${prefix}-${id}`});
      const conversation=await repo.createConversation({title:"真实读取任务",projectId:null,scope:"global"});
      const source=await repo.createMessage(conversation.id,{role:"user",content:"读取项目",attachments:[],modelMetadata:{}});
      const skillSnapshot=workerSkillSnapshotSchema.parse(await runtime.resolveEffectiveSkillSnapshot(ctx,["chatbox.topic","creatoros.guide"]));
      const submission=createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"读取",messages:[{role:"user",content:source.content}],maxSteps:6,maxOutputTokens:128,tools:definitions,hostContext:{schemaVersion:1,chatContext:{surface:"topics"},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot}})});
      const submitted=await submission.submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
      const claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:"fixture"}))!;
      const ref = { executionTaskId: submitted.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
      const model = await ledger.reserve(ref, { kind: "model", operationKey: id, inputDigest: "sha256:" + "a".repeat(64), reservedTokens: 20 });
      await ledger.start(ref, model.id);
      await ledger.settle(ref, model.id, { status: "settled", usage: { totalTokens: 5 }, providerResult: { content: [{ type: "tool-call", toolCallId: "t", toolName: "context_projects", input: "{}" }], finishReason: { unified: "tool-calls" }, usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [] } });
      expect(await ports.check(ref, { modelCallId: model.id, toolCallId: "t" })).toEqual({ status: "not-applicable" });
      const call = await ports.reserve(ref, { modelCallId: model.id, toolCallId: "t" }); await ports.start(ref, { callId: call.callId });
      const result = await ports.execute(ref, { callId: call.callId });
      const count = reads;
      expect(await ports.execute(ref, { callId: call.callId })).toEqual(result);
      expect(reads).toBe(count);
      expect((await ledger.inspect(ref)).calls.at(-1)!.status).toBe("settled");
      return result;
    }
    expect(JSON.stringify((await execute(b)).data)).toContain("账号b项目");
    expect(JSON.stringify((await execute(a)).data)).not.toContain("账号b项目");
    fail = true;
    expect(await execute(a)).toMatchObject({ status: "error", sideEffect: "none", error: { code: "transient", retryable: true } });
    expect(reads).toBe(3);
  } finally {
    await (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence?.();
    __resetPersistenceForTests(); vi.unstubAllEnvs();
  }
}, 30000);
