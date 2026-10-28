import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb, platformAccounts, aiTaskResults, eq, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { POSITIONING_GENERATE_TEMPLATE } from "@creatoros/ai-worker";
import { createAccountGroupService } from "../platform-account/account-group.service";
import { createPositioningService } from "../positioning/positioning.service";
import { lockPositioningAdoptionAccount } from "../positioning/positioning-write-lock";
import { createAiService } from "../ai/ai.service";
import { createCalibrationPositioningAdoptionService } from "../ai/calibration-positioning-adoption.service";
import { createModelWorkerDispatcher } from "../execution/model-worker-dispatcher";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createStructuredBusinessExecutionService } from "./structured-business-execution.service";
import { createPositioningGenerateBusinessAdapter } from "./calibration-positioning-business-adapters";
import { assembleCreativeContext } from "./creative-context";

// 真 PGlite、真 Worker、受控本机 HTTP 模型。证明协议与落库链，不冒充外部模型验收。
let store: Awaited<ReturnType<typeof createDb>>;
let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;
const now = () => new Date().toISOString();
const unused = async (): Promise<never> => { throw new Error("不应调用平台或其他业务端口"); };
const base: RequestContext = { userId: "local-creator", requestId: "t1408", source: "user", accountId: null };
const budget = { maxCalls: 4, maxTokens: 100000, deadlineMs: 120000 };
const positioning = (db: Db) => createPositioningService({ db, now, nextId, projects: { getProjectSubject: unused } });

beforeAll(async () => {
  store = await createDb();
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], { stdio: "pipe" });
}, 120000);
afterAll(async () => { await store?.client.close(); });

it.each([false, true])("T1408 无平台账号、已有定位=%s：生成候选后显式原子采纳、跨组拒绝、幂等与下游回读", async (existing) => {
  const groups = createAccountGroupService({ db: store.db, now, nextId });
  const ctx: RequestContext = { ...base, groupId: (await groups.create(base, { name: `免登录验收-${existing}`, idempotencyKey: `local-${existing}` })).id };
  const other: RequestContext = { ...base, groupId: (await groups.create(base, { name: `隔离组-${existing}`, idempotencyKey: `other-${existing}` })).id };
  const profile = positioning(store.db);
  if (existing) {
    await profile.upsertProfile(ctx, { persona: "旧定位本人", field: "门店经营", audience: "小店主", differentiation: "本人实践", capabilities: ["经营"], facets: { tone: "原有温和语气", avoid: "旧排除" } });
  }
  const before = await profile.getPositioningCenter(ctx);
  expect(await store.db.select().from(platformAccounts)).toHaveLength(0);
  const adoption = createCalibrationPositioningAdoptionService(store.db, {
    assertSubject: unused, createDraftPrediction: unused,
    lockPositioning: lockPositioningAdoptionAccount,
    upsertProfile: (c, input, tx) => positioning(tx as unknown as Db).upsertProfile(c, input),
    createStatementVersion: (c, input, tx) => positioning(tx as unknown as Db).createStatementVersion(c, input),
  }, now);
  const ai = createAiService({
    db: store.db, now, nextId, calibrationPositioning: adoption,
    artifacts: { createVersion: unused }, knowledge: { createKnowledge: unused },
    candidate: { createFromAIResult: unused, enrichCard: unused }, learnings: { createLearning: unused },
    publishing: { createPublicationFromDraft: unused }, materialLinks: { link: unused },
    positioning: { upsertProfile: (c, i) => profile.upsertProfile(c, i), createStatementVersion: (c, i) => profile.createStatementVersion(c, i) },
    calibration: { createDraftPrediction: unused },
    resolveTaskRuntimeData: async (c) => ({ skillSnapshot: {
      snapshotVersion: 1, userId: c.userId, accountId: c.accountId, groupId: c.groupId,
      resolvedAt: now(), platformPolicyVersion: "1", platformPolicy: "只生成候选，用户采纳后写入",
      skills: [{ skillId: "positioning.generate", baseVersion: POSITIONING_GENERATE_TEMPLATE.version, overlayRevision: null, overlayVersion: null,
        effective: { methodSystem: POSITIONING_GENERATE_TEMPLATE.system, template: POSITIONING_GENERATE_TEMPLATE.template,
          tools: [], requiredFacets: ["current"], contextRequirements: [], outputSchema: { type: "object" }, completionPolicy: null, completionPolicyAdapter: null } }],
    } }),
  });
  const context = { positioning: profile };
  const service = createStructuredBusinessExecutionService(store.db, {
    budget, maxOutputTokens: 2048,
    adapters: { "positioning.generate": createPositioningGenerateBusinessAdapter(context) },
  });
  const task = await ai.createTask(ctx, { taskType: "positioning.generate", attemptId: nextId("positioning-local-attempt"), inputData: {} });
  const prepared = await service.prepare(ctx, task.id);
  const good = {
    persona: "门店经验分享者", field: "门店经营", audience: "初次开店遇到执行难题的小店主", differentiation: "本人步骤与复盘",
    capabilities: ["拆解", "演示"], oneLiner: "把开店经验讲成能照做的步骤", keywords: ["门店", "步骤", "实践"],
    facets: { contentScope: "本人经营案例", avoid: "不承诺收益", corePain: "经验难以落地", coreValue: "可验证的行动步骤", tone: existing ? "  " : "直接", statusNote: "虚构的动态状态不应写入" },
    downstreamRules: { scriptRule: "写稿必须区分亲历与假设" },
  };
  const requests: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8"); req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requests.push(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "test", object: "chat.completion", created: 1, model: "fixture",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(good) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const worker = createModelWorkerDispatcher(store.db, {
    entryPath: resolve("../ai-worker/dist/execution-worker.cjs"), workerId: `local-${existing}`, budget,
    resolveModelCredential: async () => ({ apiFormat: "openai_chat", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: "fixture", token: "fixture", structuredOutputs: true }),
    projectCandidate: (_c, input) => service.projectCandidate(input),
  });
  try {
    await worker.drainOnce();
    expect((await createPersistentTaskService(store.db).get(ctx, prepared.executionTaskId)).status).toBe("succeeded");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("无需登录抖音");
    if (existing) expect(requests[0]).toContain("旧定位本人");
    const results = await store.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, task.id));
    expect(results).toHaveLength(1);
    expect(results[0]?.resultData).toMatchObject({ suggestion: { facets: { contentScope: "本人经营案例", statusNote: "" } } });
    expect((await ai.getTask(ctx, task.id)).status).toBe("awaiting_confirmation");
    // 模型输出仅为候选，不会自动覆盖当前定位。
    expect(await profile.getPositioningCenter(ctx)).toEqual(before);
    await expect(ai.confirmTask(other, task.id)).rejects.toMatchObject({ code: "OwnershipError" });
    await expect(ai.getTask({ ...ctx, userId: "another-user" }, task.id)).rejects.toMatchObject({ code: "OwnershipError" });
    expect((await ai.confirmTask(ctx, task.id)).status).toBe("succeeded");
    const center = await profile.getPositioningCenter(ctx);
    expect(center.profile?.persona).toBe(good.persona);
    expect(center.profile?.facets).toMatchObject({ contentScope: good.facets.contentScope, avoid: good.facets.avoid, corePain: good.facets.corePain, coreValue: good.facets.coreValue, tone: existing ? "原有温和语气" : "直接", statusNote: "" });
    expect(center.currentStatement?.oneLiner).toBe(good.oneLiner);
    const downstream = await assembleCreativeContext(ctx, { projectId: null, topic: "下一期内容" }, context);
    for (const expected of ["本人经营案例", "不承诺收益", "经验难以落地", "可验证的行动步骤", "写稿必须区分亲历与假设"])
      expect(downstream.positioningBrief).toContain(expected);
    await ai.confirmTask(ctx, task.id);
    expect((await profile.listStatements(ctx, { limit: 10, offset: 0 })).rows).toHaveLength(1);
    expect((await profile.getPositioningCenter(other)).profile).toBeNull();
    expect(await store.db.select().from(platformAccounts)).toHaveLength(0);
    // AI 候选空白视为未知；手动编辑的明确清空合同保持不变。
    await profile.upsertProfile(ctx, { ...good, facets: { tone: "" } });
    expect((await profile.getProfile(ctx))?.facets.tone).toBe("");
  } finally {
    await worker.stop(); server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}, 120000);
