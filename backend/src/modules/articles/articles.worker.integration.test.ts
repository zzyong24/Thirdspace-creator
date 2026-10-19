import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, createDb, aiTasks, aiTaskResults, executionTasks, executionCalls, type Db } from "@creatoros/backend";
import { getOfficialSkillBase, listOfficialSkillBases } from "@creatoros/ai-worker";
import { buildWechatArticleFacets, validateWechatArticleCandidate } from "@creatoros/ai-worker/wechat-article-candidate";
import { createEffectiveSkillSnapshotResolver } from "../ai-runtime/effective-skill-snapshot";
import { createExecutionAuthorityService } from "../execution/execution-authority.service";
import { createModelWorkerDispatcher } from "../execution/model-worker-dispatcher";
import { createProjectRepository, createProjectsService } from "../projects";
import { createArtifactsService } from "../artifacts";
import { createArticlesService } from "./articles.service";
import type { RequestContext } from "@creatoros/contract";
import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";

const now = () => new Date().toISOString();
const context: RequestContext = {userId: "article-worker-user", accountId: "article-worker-account", requestId: "article-worker-test", source: "user"};
const budget = {maxCalls: 4, maxTokens: 100000, deadlineMs: 60000};
const requestFingerprint = `sha256:${"a".repeat(64)}`;
const proposed = {
  proposedTitle: "有证据的标题", proposedTitleSourceRefs: [], proposedSummary: "方法与边界", proposedSummarySourceRefs: [],
  proposedFactItems: [], proposedSections: [{op: "insert", sectionId: "section-1", afterSectionId: null, order: 0,
    heading: "先说明问题", body: "这是由模型返回的完整段落。", sourceRefs: []}],
  proposedVisualBriefs: [{sectionId: "section-1", brief: "一张流程示意图，尚未制作"}], sourceRefs: [],
};

beforeAll(() => { execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {stdio: "pipe"}); }, 30000);

describe("T-1023 正式 Worker 文章候选回执", () => {
  it("持久任务经独立 Worker、结构化业务校验、回执入候选，用户采纳后才写文章版", async () => {
    const opened = await createDb();
    const db = opened.db;
    let seq = 0;
    const deps = {now, nextId: (prefix: string) => `${prefix}-${++seq}`};
    const projects = (store: Db) => createProjectsService(createProjectRepository(store), deps);
    const artifacts = (store: Db) => createArtifactsService({db: store, ...deps,
      assertProjectOwned: (c, id) => projects(store).getProject(c, id),
      resolveOutputProjectId: (c, id) => projects(store).getProjectIdByOutput(c, id),
    });
    const snapshotResolver = createEffectiveSkillSnapshotResolver({
      officialSkills: {get: getOfficialSkillBase, list: listOfficialSkillBases, platformPolicy: () => ({version: "test", text: "测试策略"})},
      accountOverlays: {listBySkillIds: async () => []}, now,
    });
    const service = createArticlesService(db, {...deps, projects, artifacts,
      assertAssetFile: async () => {},
      resolveDocumentSource: async () => null,
      resolveSelectedBrand: async () => null,
      async submitGeneration(ctx, request) {
        const id = `ai-article-${++seq}`;
        await db.insert(aiTasks).values({id, userId: ctx.userId, accountId: ctx.accountId!, projectId: request.projectId,
          taskType: "wechat.article-draft", inputData: request.inputData, idempotencyKey: request.attemptId,
          requestFingerprint, requestedAt: now()});
        const skillSnapshot = await snapshotResolver(ctx, ["wechat.article-draft"]);
        await createExecutionAuthorityService(db).bindAiTask(ctx, id, {
          requestFingerprint, budget,
          modelInput: structuredGenerationInputSchema.parse({kind: "model.structured", operationKey: "wechat.article-draft",
            capability: "copy.generate", skillId: "wechat.article-draft", maxOutputTokens: 4096,
            skillSnapshot, facets: buildWechatArticleFacets(request.inputData)}),
        });
        return {id, status: "queued"};
      },
      async readGeneration(ctx, taskId) {
        const [task] = await db.select().from(aiTasks).where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, ctx.userId), eq(aiTasks.accountId, ctx.accountId!)));
        if (!task) throw new Error("TASK_NOT_OWNED");
        const results = await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, taskId));
        return {taskType: task.taskType, status: task.status, inputData: task.inputData as Record<string, unknown>,
          results: results.map((row) => ({resultType: row.resultType, resultData: row.resultData as Record<string, unknown>}))};
      },
    });
    const project = await projects(db).createProject(context, {title: "文章目标", brief: "介绍可验证的方法", briefDetail: {targetPlatforms: ["wechatOfficialAccount"]}});
    const output = await service.createOutput(context, project.id, {title: "公众号长文", clientRequestId: "article-worker-create-001"});
    const before = await service.getArticle(context, output.id);
    const submitted = await service.generateCandidate(context, output.id, "article-worker-generate-001");
    expect((await service.getArticle(context, output.id)).currentVersionId).toBe(before.currentVersionId);
    let requests = 0;
    const server = createServer((req, res) => { req.resume(); requests++;
      const base = {id: "model-article", object: "chat.completion.chunk", created: 1, model: "test"};
      res.writeHead(200, {"content-type": "text/event-stream"});
      res.end(`data: ${JSON.stringify({...base, choices: [{index: 0, delta: {role: "assistant", content: JSON.stringify(proposed)}, finish_reason: null}]})}\n\n`+
        `data: ${JSON.stringify({...base, choices: [{index: 0, delta: {}, finish_reason: "stop"}], usage: {prompt_tokens: 20, completion_tokens: 40, total_tokens: 60}})}\n\n`+
        "data: [DONE]\n\n");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const worker = createModelWorkerDispatcher(db, {entryPath: resolve("../ai-worker/dist/execution-worker.cjs"),
      workerId: "article-worker", budget, pollMs: 100,
      async resolveModelCredential(_ctx, capability) {
        expect(capability).toBe("copy.generate");
        return {apiFormat: "openai_chat", baseUrl: `http://127.0.0.1:${(server.address() as {port: number}).port}/v1`,
          model: "test", token: "fixture", structuredOutputs: true};
      },
      projectCandidate(_ctx, result) {
        const frozen = structuredGenerationInputSchema.parse(result.frozenInput);
        const proposal = validateWechatArticleCandidate(JSON.parse(result.text), JSON.parse(frozen.facets.articleContext ?? "null"));
        return {resultType: "wechat_article_candidate", resultData: {proposal}};
      },
    });
    try {
      expect(await worker.drainOnce()).toBe(1);
      expect(requests).toBeGreaterThan(0);
      const [taskAfter] = await db.select().from(aiTasks).where(eq(aiTasks.id, submitted.taskId));
      const executionAfter = await db.select().from(executionTasks);
      const callsAfter = await db.select().from(executionCalls);
      expect(taskAfter?.status, JSON.stringify({error: taskAfter?.errorMessage, executions: executionAfter.map(row => ({status: row.status, errorCode: row.lastErrorCode, error: row.lastErrorMessage})), calls: callsAfter.map(row => ({status: row.status, rejection: row.rejectionCode, text: row.resultText?.slice(0, 200)}))})).toBe("awaiting_confirmation");
      const candidate = await service.getCandidate(context, submitted.candidateId);
      expect(candidate.proposedSections[0]?.body).toBe("这是由模型返回的完整段落。");
      expect((await service.getArticle(context, output.id)).currentVersionId).toBe(before.currentVersionId);
      const adopted = await service.adoptCandidate(context, candidate.candidateId, {expectedCurrentVersionId: before.currentVersionId,
        selectedSectionIds: ["section-1"], selectedMetadataFields: ["title", "summary"], clientRequestId: "article-worker-adopt-001"});
      expect(adopted.document.title).toBe("有证据的标题");
      expect((await service.getArticle(context, output.id)).currentVersionId).toBe(adopted.versionId);
    } finally {
      await worker.stop(); server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await opened.client.close();
    }
  }, 30000);
});
