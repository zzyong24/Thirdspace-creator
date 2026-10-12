import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  createDb,
  aiTasks,
  executionTasks,
  executionCalls,
  eq,
  type Db,
} from "@creatoros/backend";
import type { Endpoint } from "@creatoros/contract";
import { createAiService } from "../modules/ai/ai.service";
import { createAiTransport } from "../modules/ai/ai.transport";
import { createChatWorkerDispatcher } from "../modules/execution/model-worker-dispatcher";
const ctx = {
    userId: "fork-u",
    accountId: "fork-a",
    requestId: "fork",
    source: "user" as const,
  },
  now = () => new Date().toISOString(),
  budget = { maxCalls: 6, maxTokens: 100000, deadlineMs: 120000 };
let db: Db,
  close: () => Promise<void>,
  seq = 0;
const unused = async (): Promise<never> => {
  throw Error("unused");
};
beforeAll(async () => {
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {
    stdio: "pipe",timeout:180000,
  });
  const f = await createDb();
  db = f.db;
  close = () => f.client.close();
}, 180000);
afterAll(async () => close?.(),180000);
it.each(["success", "auth", "retry"])(
  "公开入口保存后恢复真实fork，%s重复唤醒不重复调用或伪造回复",
  async (mode) => {
    const ai = createAiService({
      db,
      now,
      nextId: (p) => `${p}-${++seq}`,
      prepareChatReply:async(owner,snapshot)=>({capability:"copilot.assist",system:"对原用户消息给一条实用建议",messages:snapshot.messages.map(message=>({role:message.role as "user",content:message.content})),maxSteps:6,maxOutputTokens:512,tools:[],hostContext:{schemaVersion:1,chatContext:{surface:"topics",projectId:null},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:owner.userId,accountId:owner.accountId??null,resolvedAt:now(),platformPolicyVersion:"1",platformPolicy:"原对话上下文",skills:[{skillId:"chatbox.topic",baseVersion:"original-fork-fixture",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"给一条建议",template:"",tools:[],requiredFacets:[],contextRequirements:[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null}}]}}}),
      artifacts: { createVersion: unused },
      knowledge: { createKnowledge: unused },
      candidate: { createFromAIResult: unused, enrichCard: unused },
      learnings: { createLearning: unused },
      publishing: { createPublicationFromDraft: unused },
      materialLinks: { link: unused },
      positioning: { upsertProfile: unused, createStatementVersion: unused },
      calibration: { createDraftPrediction: unused },
      resolveTaskRuntimeData: async () => ({
        skillSnapshot: {
          snapshotVersion: 1,
          userId: ctx.userId,
          accountId: ctx.accountId,
          resolvedAt: now(),
          platformPolicyVersion: "1",
          platformPolicy: "实际对话上下文",
          skills: [
            {
              skillId: "copilot.assist",
              baseVersion: "1",
              overlayRevision: null,
              overlayVersion: null,
              effective: {
                methodSystem: "回复 JSON",
                template: "当前输入 {{transcript}}",
                tools: [],
                requiredFacets: ["transcript"],
                contextRequirements: [],
                outputSchema: { type: "object" },
                completionPolicy: null,
                completionPolicyAdapter: null,
              },
            },
          ],
        },
      }),
    });
    const conversation = await ai.createConversation(ctx, { title: "旧对话" }),
      transport = createAiTransport(() => ai);
    const response = (await transport.request(
      { id: "ai.conversations.messages.create" } as Endpoint,
      {
        params: { conversationId: conversation.id },
        body: { content: "请给一条实用建议" },
      } as never,
      ctx,
    )) as { data: { modelMetadata: { chatTaskId: string } } };
    const id = response.data.modelMetadata.chatTaskId;
    expect(id).toBeTruthy();
    // 原公共消息端口原子预约同一真实聊天执行，不另建结构化Copilot任务。
    expect((await ai.getTask(ctx,id)).executionTaskId).toBeTruthy();
    const [reserved]=await db.select().from(aiTasks).where(eq(aiTasks.id,id));
    expect(reserved).toMatchObject({taskType:"copilot.assist",status:"queued",inputData:{kind:"chat.run"}});
    const [frozen]=await db.select().from(executionTasks).where(eq(executionTasks.id,reserved!.executionTaskId!));
    expect(frozen).toMatchObject({kind:"ai_task",ownerId:id,payload:{aiTaskId:id,modelInput:{kind:"chat.run"}}});
    const requests: unknown[] = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push(JSON.parse(Buffer.concat(chunks).toString()));
      if (mode === "retry" && requests.length === 1) {
        res.writeHead(503, {
          "content-type": "application/json",
          "retry-after": "1",
        });
        res.end(
          JSON.stringify({
            error: { message: "temporarily unavailable", type: "server_error" },
          }),
        );
        return;
      }
      if (mode === "auth") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "invalid API key", type: "authentication_error" },
          }),
        );
        return;
      }
      res.writeHead(200,{"content-type":"text/event-stream"});
      const base={id:"fixture",object:"chat.completion.chunk",created:1,model:"fixture"};
      res.end([{...base,choices:[{index:0,delta:{role:"assistant",content:"先明确观众遇到的具体问题。"},finish_reason:null}]},{...base,choices:[{index:0,delta:{},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}].map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join("")+"data: [DONE]\n\n");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const worker = createChatWorkerDispatcher(db, {
      now,
      budget,
      workerId: "copilot-host",
      entryPath: resolve("../ai-worker/dist/execution-worker.cjs"),
      resolveTools:async(actualCtx,input,execution,signal)=>{
        signal.throwIfAborted();
        expect(actualCtx).toMatchObject({userId:ctx.userId,accountId:ctx.accountId});
        expect(input).toMatchObject({kind:"chat.run",userId:ctx.userId,accountId:ctx.accountId,conversationId:conversation.id,tools:[]});
        expect(execution.executionTaskId).toBe(reserved!.executionTaskId);
        return {};
      },
      resolveModelCredential: async () => ({
        apiFormat: "openai_chat",
        baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
        model: "fixture",
        token: "fixture",
      }),
    });
    try {
      await worker.drainOnce();
      if (mode === "retry") {
        const current = await ai.getTask(ctx, id);
        expect(current.runtimeStatus).toBe("retry_wait");
        const [waiting] = await db
          .select()
          .from(executionTasks)
          .where(eq(executionTasks.id, current.executionTaskId!));
        const delay = Date.parse(waiting!.retryAt!) - Date.now() + 20;
        expect(delay).toBeLessThan(10000);
        await new Promise((r) => setTimeout(r, Math.max(0, delay)));
      }
      await worker.drainOnce();
      await worker.drainOnce();
      expect(requests).toHaveLength(mode === "retry" ? 2 : 1);
      expect(JSON.stringify(requests[0])).toContain("请给一条实用建议");
      const messages = await ai.listMessages(ctx, conversation.id);
      if (mode === "auth") {
        expect(messages).toHaveLength(1);
        expect((await ai.getTask(ctx, id)).runtimeStatus).toBe("waiting_user");
        return;
      }
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        role: "assistant",
        content: "先明确观众遇到的具体问题。",
      });
      expect((await ai.getTask(ctx, id)).status).toBe("succeeded");
      const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, id));
      expect(
        (
          await db
            .select()
            .from(executionTasks)
            .where(eq(executionTasks.id, task!.executionTaskId!))
        )[0]?.status,
      ).toBe("succeeded");
      expect(
        await db
          .select()
          .from(executionCalls)
          .where(eq(executionCalls.executionTaskId, task!.executionTaskId!)),
      ).toHaveLength(mode === "retry" ? 2 : 1);
    } finally {
      await worker.stop();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
  180000,
);
