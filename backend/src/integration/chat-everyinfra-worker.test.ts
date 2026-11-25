import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { defaultEveryInfraHost } from "@creatoros/contract/internal/everyinfra";
import { buildEveryInfraTool } from "../modules/ai-runtime/chat-everyinfra-tool";
import { createChatEveryInfraTaskToolHost } from "../modules/ai-runtime/chat-everyinfra-tool-host";
import { prepareChatToolDefinitions } from "../modules/ai-runtime/chat-tool-definitions";
import { createAiRepository } from "../modules/ai/ai.repository";
import { createChatHostContextReader } from "../modules/ai/chat-host-context.service";
import { createChatTurnSubmissionService } from "../modules/ai/chat-turn-submission.service";
import { createChatWorkerDispatcher } from "../modules/execution/model-worker-dispatcher";

const entryPath = resolve("../ai-worker/dist/execution-worker.cjs");
const now = () => new Date().toISOString();
const budget = { maxCalls: 10, maxTokens: 100000, deadlineMs: 180000 };
const context = { userId: "everyinfra-worker-user", accountId: "everyinfra-worker-account", requestId: "test", source: "user" as const };
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  const connection = await createDb();
  db = connection.db;
  close = () => connection.client.close();
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], { stdio: "pipe", timeout: 120000 });
}, 180000);
afterAll(async () => close?.());

it("实际聊天 Worker 按可信账户调用三平台，只将脱敏结果写入回执和模型请求", async () => {
  const apiKey = randomUUID();
  const privateMarker = randomUUID();
  const upstreamMedia = new URL("https://media.example.test/fixture.mp4");
  upstreamMedia.searchParams.set("signature", privateMarker);
  const repo = createAiRepository(db, { userId: context.userId, accountId: context.accountId, now, nextId: prefix => `${prefix}-${randomUUID()}` });
  const conversation = await repo.createConversation({ title: "三平台作品查询", projectId: null, scope: "global" });
  const message = await repo.createMessage(conversation.id, { role: "user", content: "寻找三平台的咖啡内容", attachments: [], modelMetadata: {} });
  const { definitions: tools } = await prepareChatToolDefinitions({ "everyinfra.query": buildEveryInfraTool() });
  const hostContext = {
    schemaVersion: 1 as const, chatContext: { surface: "topics" }, mediaRoute: null, positioningScratch: false, trustedScriptSources: [],
    researchContext: { selectionTitle: "", userMaterialQueryTerms: [], searchConfigured: false },
    skillSnapshot: {
      snapshotVersion: 1 as const, userId: context.userId, accountId: context.accountId, resolvedAt: "fixture",
      platformPolicyVersion: "1", platformPolicy: "核对来源事实",
      skills: [{ skillId: "chatbox.topic", baseVersion: "1", overlayRevision: null, overlayVersion: null,
        effective: { methodSystem: "核对来源事实", template: "", tools: ["everyinfra.query"], requiredFacets: [],
          contextRequirements: [], outputSchema: null, completionPolicy: null, completionPolicyAdapter: null } }],
    },
  };
  const submitted = await createChatTurnSubmissionService(db, {
    now,
    assemble: async () => ({
      capability: "copilot.assist", system: "依据搜索事实继续",
      messages: [{ role: "user" as const, content: "寻找三平台的咖啡内容" }],
      tools, maxSteps: 6, maxOutputTokens: 128, hostContext,
    }),
  }).submit(context, { conversationId: conversation.id, sourceMessageId: message.id });

  const folder = mkdtempSync(join(tmpdir(), "everyinfra-worker-"));
  const wrapper = join(folder, "entry.cjs");
  const modelEvidence = join(folder, "model-requests.jsonl");
  const modelBaseUrl = "https://model-fixture.example.test/v1";
  const queries = [
    { platform: "douyin", action: "search", params: { keyword: "咖啡" } },
    { platform: "xiaohongshu", action: "search", params: { keyword: "咖啡", content_type: "video" } },
    { platform: "wechatVideo", action: "search", params: { keyword: "咖啡" } },
  ];
  writeFileSync(wrapper, `
    const { appendFileSync } = require("node:fs");
    let modelCalls = 0;
    globalThis.fetch = async (url, init) => {
      const endpoint = String(url);
      if (endpoint === ${JSON.stringify(`${defaultEveryInfraHost}/api/v1/social`)}) {
        if (init.headers.Authorization !== ${JSON.stringify(`Bearer ${apiKey}`)} || !init.headers["Idempotency-Key"]) return new Response("", { status: 401 });
        const { platform, action } = JSON.parse(init.body);
        const cards = { douyin: "抖音样例", xiaohongshu: "小红书样例", wechat_channels: "视频号样例" };
        const row = { title: cards[platform], video_url: ${JSON.stringify(upstreamMedia.href)},
          video_decode_key: ${JSON.stringify(privateMarker)}, text: ${JSON.stringify(apiKey)}, is_video: true };
        return Response.json({ platform, action, results: [row] });
      }
      if (endpoint === ${JSON.stringify(`${modelBaseUrl}/chat/completions`)}) {
        const body = String(init?.body);
        appendFileSync(${JSON.stringify(modelEvidence)}, JSON.stringify({
          sensitive: ${JSON.stringify([apiKey, privateMarker, "video_decode_key"])}.some(marker => body.includes(marker)),
          oldTool: body.includes("redfox_query"),
        }) + "\\n");
        const query = ${JSON.stringify(queries)}[modelCalls++];
        const delta = query ? { tool_calls: [{
          index: 0, id: "query-" + modelCalls, type: "function",
          function: { name: "everyinfra_query", arguments: JSON.stringify(query) },
        }] } : { content: "已查询三个平台的来源。" };
        const chunks = [
          { choices: [{ index: 0, delta, finish_reason: null }] },
          { choices: [{ index: 0, delta: {}, finish_reason: query ? "tool_calls" : "stop" }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } },
        ];
        const bodyText = chunks.map(chunk => "data: " + JSON.stringify({
          id: "root", object: "chat.completion.chunk", created: 1, model: "fixture", ...chunk,
        }) + "\\n\\n").join("") + "data: [DONE]\\n\\n";
        return new Response(bodyText, { headers: { "content-type": "text/event-stream" } });
      }
      throw new Error("TEST_EXTERNAL_NETWORK_BLOCKED");
    };
    require(${JSON.stringify(entryPath)});
  `);
  const host = createChatWorkerDispatcher(db, {
    now, budget, entryPath: wrapper, workerId: "everyinfra-worker-fixture", modelConcurrency: 1,
    resolveTools: createChatEveryInfraTaskToolHost(createChatHostContextReader(db, { now })),
    resolveEveryInfraCredential: async owner => owner.userId === context.userId ? { apiKey, baseUrl: defaultEveryInfraHost } : null,
    resolveModelCredential: async () => ({ apiFormat: "openai_chat", baseUrl: modelBaseUrl, model: "fixture", token: "model-fixture" }),
  });
  try {
    await host.drainOnce();
    const [task] = await db.select().from(executionTasks).where(eq(executionTasks.id, submitted.executionTaskId));
    expect(task?.status).toBe("succeeded");
    const modelRequests = readFileSync(modelEvidence, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(modelRequests).toEqual(Array.from({ length: 4 }, () => ({ sensitive: false, oldTool: false })));
    const calls = await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, submitted.executionTaskId));
    const receipts = calls.filter(call => call.kind === "tool").map(call => JSON.parse(call.resultText!));
    expect(receipts).toHaveLength(3);
    const texts = receipts.map(receipt => JSON.stringify(receipt));
    for (const title of ["抖音样例", "小红书样例", "视频号样例"]) expect(texts.some(text => text.includes(title))).toBe(true);
    const serialized = JSON.stringify(receipts);
    for (const forbidden of [apiKey, privateMarker, "video_decode_key", "redfox_query"]) expect(serialized).not.toContain(forbidden);
  } finally {
    await host.stop();
    rmSync(folder, { recursive: true, force: true });
  }
}, 180000);
