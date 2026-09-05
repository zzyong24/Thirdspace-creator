import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { createDb, assets, aiTasks, aiTaskResults, executionTasks, entityTags, tags, assetTagAdoptions, eq } from "@creatoros/backend";
import { createAssetsService, createAssetRepository } from "../assets";
import { createAssetTagProposalService } from "../taxonomy";
import { createKnowledgeProposalAdoptionService } from "../knowledge";
import { createAgenticProposalStagingService } from "../ai/agentic-proposal-staging.service";
import { createAgenticProposalAdoptionService } from "../ai/agentic-proposal-adoption.service";
import { createAiService } from "../ai/ai.service";
import { createAgenticWorkerDispatcher } from "../execution/model-worker-dispatcher";
import { createAgenticMaterialTools } from "./agentic-material-tools";
import { createAgenticBusinessExecutionService } from "./agentic-business-execution.service";

it("真实素材搜索、Worker标签候选与公开采纳完整链：分页证据可见，采纳前不写标签，重复采纳幂等", async () => {
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], { stdio: "pipe" });
  const f = await createDb();
  const ctx = { userId: "material-worker", accountId: "material-account", requestId: "test", source: "user" as const };
  const now = () => new Date().toISOString();
  let serial = 0;
  const nextId = (prefix: string) => `${prefix}-${++serial}`;
  const noExternal = async (): Promise<never> => { throw new Error("未授权的外部能力不应调用"); };
  const assetService = createAssetsService(createAssetRepository(f.db, { now, nextId }), noExternal, { now, nextId });
  const assetTags = createAssetTagProposalService(f.db, { now, nextId });
  const knowledge = createKnowledgeProposalAdoptionService(f.db, now);
  const adoption = createAgenticProposalAdoptionService(f.db, {
    knowledge: (context, proposal, tx) => knowledge.adopt(context, proposal, tx),
    assetTagsBatch: (context, proposals, tx) => assetTags.adoptBatch(context, proposals, tx),
  }, now);
  const ai = createAiService({ db: f.db, now, nextId, agenticProposals: adoption,
    artifacts: { createVersion: noExternal }, knowledge: { createKnowledge: noExternal }, candidate: { createFromAIResult: noExternal, enrichCard: noExternal },
    learnings: { createLearning: noExternal }, publishing: { createPublicationFromDraft: noExternal }, materialLinks: { link: noExternal },
    positioning: { upsertProfile: noExternal, createStatementVersion: noExternal }, calibration: { createDraftPrediction: noExternal },
  });
  const staging = createAgenticProposalStagingService(f.db, { resolveLease: () => { throw new Error("不能进入旧ALS执行"); }, prepareAssets: (context, ids) => assetTags.prepare(context, ids) });
  let searchCursor: string | null = null;
  const material = createAgenticMaterialTools({
    search: async (context, input, signal) => {
      signal.throwIfAborted();
      const result = await assetService.searchAssets(context, input);
      searchCursor = result.nextCursor;
      return { items: result.rows.map(row => ({ id: row.id, title: row.name, kind: row.assetType })), nextCursor: result.nextCursor };
    },
    stage: (ref, input, signal) => staging.stageForExecution(ref, input, signal),
  });
  const budget = { maxCalls: 12, maxTokens: 100000, deadlineMs: 60000 };
  const preparation = createAgenticBusinessExecutionService(f.db, {
    definitions: { "exec.agentic.material": { taskType: "agentic.material", systemPrompt: "搜索素材，生成标签建议，最后总结。", capability: "material", tools: material.definitions } },
    budget, maxOutputTokens: 200,
    validateInputs: async (context, inputs) => { for (const input of inputs) await assetService.getAsset(context, input.assetId); },
  });
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks).toString("utf8"));
    const index = requests.length;
    const args = index === 1 ? { query: "素材", limit: 1 } : { assetIds: ["material-1"], tag: "实测标签" };
    const delta = index <= 2
      ? { role: "assistant", tool_calls: [{ index: 0, id: `tool-${index}`, type: "function", function: { name: index === 1 ? "material.search" : "material.organize", arguments: JSON.stringify(args) } }] }
      : { role: "assistant", content: "已生成标签建议，请采纳" };
    const base = { id: `response-${index}`, object: "chat.completion.chunk", created: 1, model: "test" };
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: index <= 2 ? "tool_calls" : "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const dispatcher = createAgenticWorkerDispatcher(f.db, {
    entryPath: resolve("../ai-worker/dist/agentic-worker.cjs"), workerId: "material-host", budget, pollMs: 100, modelConcurrency: 1, tools: material.tools,
    resolveModelCredential: async (context, capability, owner) => {
      expect(context).toMatchObject({ userId: ctx.userId, accountId: ctx.accountId }); expect(capability).toBe("material"); expect(owner.aiTaskId).toBe("material-task");
      return { apiFormat: "openai_chat", authStyle: "bearer", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "test", token: "local-fixture" };
    },
  });
  try {
    const createdAt = now();
    await f.db.insert(assets).values(["material-1", "material-2"].map(id => ({ id, userId: ctx.userId, accountId: ctx.accountId, name: `素材 ${id}`, assetType: "image", createdAt, updatedAt: createdAt })));
    await f.db.insert(aiTasks).values({ id: "material-task", userId: ctx.userId, accountId: ctx.accountId, taskType: "exec.agentic.material", status: "queued", idempotencyKey: "material-task", requestedAt: now(), inputData: { spec: { taskType: "agentic.material", goal: "为素材生成标签建议", inputs: [], params: {}, constraints: { timeoutSec: 60, network: "deny", maxOutputMB: 512 } } } });
    const mapped = await preparation.prepare(ctx, "material-task");
    expect(await dispatcher.drainOnce()).toBe(1);
    expect(requests).toHaveLength(3);
    expect(searchCursor).toBeTruthy();
    expect(requests[1]).toContain("material-1"); expect(requests[1]).toContain(searchCursor!);
    expect(requests[2]).toContain("expectedVersion"); expect(requests[2]).toContain("实测标签");
    const [execution] = await f.db.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId));
    expect(execution?.status).toBe("succeeded");
    expect(execution?.checkpoint).toMatchObject({ revision: 5, messages: [{ role: "assistant" }, { role: "tool" }, { role: "assistant" }, { role: "tool" }, { role: "assistant" }] });
    expect((await ai.getTask(ctx, "material-task")).status).toBe("awaiting_confirmation");
    const candidates = await f.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, "material-task"));
    expect(candidates.map(row => row.resultType).sort()).toEqual(["agentic_proposal_staged", "agentic_proposals"]);
    expect(await f.db.select().from(entityTags)).toHaveLength(0);
    expect(await f.db.select().from(tags)).toHaveLength(0);
    expect((await ai.confirmTask(ctx, "material-task")).status).toBe("succeeded");
    const relations = await f.db.select({ assetId: entityTags.entityId, name: tags.name }).from(entityTags).innerJoin(tags, eq(tags.id, entityTags.tagId));
    expect(relations).toEqual([{ assetId: "material-1", name: "实测标签" }]);
    expect((await ai.confirmTask(ctx, "material-task")).status).toBe("succeeded");
    expect(await f.db.select().from(entityTags)).toHaveLength(1); expect(await f.db.select().from(assetTagAdoptions)).toHaveLength(1);
    expect(await dispatcher.drainOnce()).toBe(0); expect(requests).toHaveLength(3);
  } finally {
    await dispatcher.stop(); server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done())); await f.client.close();
  }
}, 45000);
