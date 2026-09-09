import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createDb,
  eq,
  positioningStatements,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPositioningService,
  type PositioningProjectsPort,
  type PositioningService,
} from "./positioning.service";
import {
  ProfileRequiredError,
  GateSubjectError,
  StatementValidationError,
  MasterSnapshotUnavailableError,
  DiscoveryConflictError,
  OwnershipError,
} from "./positioning.errors";

// Positioning service test (Task 3) — fake now/nextId, pglite db, stubbed
// ProjectsPort. Covers: upsertProfile idempotency; append-only version chain (v2
// leaves v1 byte-identical; the service exposes NO update/delete); 3-keyword guard;
// ProfileRequiredError; deterministic advisory gate (same input → same score, twice;
// non-mutating); AI-formalize tagging (created_by_type:"ai" + ai_task_id, no
// parallel candidate machine); page DTO empty-state. Deterministic clock/ids (no
// Date.now / Math.random).

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acct-a" }; // [T-332 S2] strict 门下 ctx 必带号

function makeProjectsPort(
  subject: { title: string; brief: string } = { title: "AI 论文精读", brief: "把最新论文做成代码" },
): PositioningProjectsPort & { getProjectSubject: ReturnType<typeof vi.fn> } {
  return {
    getProjectSubject: vi.fn(async () => subject),
  };
}

function makeService(
  db: Db,
  projects: PositioningProjectsPort,
  tag = "a",
): PositioningService {
  let seq = 0;
  return createPositioningService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects,
  });
}

const PROFILE_INPUT = {
  persona: "硬核科普",
  field: "AI 工程",
  audience: "一线开发者",
  differentiation: "论文到代码",
  capabilities: ["拆解", "演示"],
};

describe("positioning service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("T-915 定位只读投影屏蔽旧错误计数，但不清理数据库", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, { ...PROFILE_INPUT, facets: { statusNote: "49 条稿子压在 review，一直未发布" } });
    const before = await service.getProfile(ctx);
    expect((await service.readPositioningCenter(ctx)).profile!.facets.statusNote).toBe("");
    expect(await service.getProfile(ctx)).toEqual(before);
    expect((await service.readPositioningCenter({ ...ctx, accountId: "other" })).profile).toBeNull();
    await service.getPositioningCenter(ctx);
    expect((await service.getProfile(ctx))!.facets.statusNote).toBe("");
  });

  it("upsertProfile inserts then updates the same row (one profile per user)", async () => {
    const service = makeService(db, makeProjectsPort());
    const first = await service.upsertProfile(ctx, PROFILE_INPUT);
    expect(first.field).toBe("AI 工程");
    const second = await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      field: "AI 应用",
    });
    expect(second.id).toBe(first.id); // same row, no duplicate
    expect(second.field).toBe("AI 应用");
    const center = await service.getPositioningCenter(ctx);
    expect(center.history).toHaveLength(0);
    expect(center.profile!.id).toBe(first.id);
  });

  it("[T-652] 前采支持多选/自定义，从零模式隔离旧数据，联网只发送显式关键词", async () => {
    let seq = 0;
    const search = vi.fn(async (_ctx, query: string) =>
      query.includes("企业智能体")
        ? [
            {
              title: "国内企业智能体客户需求观察",
              url: "https://www.36kr.com/p/agent-demand",
              snippet: "中国企业客户正在关注智能体的交付与知识库能力。",
            },
          ]
        : [
            {
              title: "国内智能体用户高频痛点",
              url: "https://www.zhihu.com/question/agent-needs",
              snippet: `中文公开资料：${query}`,
            },
            {
              title: "智能体落地案例",
              url: "https://juejin.cn/post/agent-case",
              snippet: "面向国内用户的智能体落地案例。",
            },
            {
              title: "Cafe Flora | Vegetarian Restaurant Seattle",
              url: "https://cafeflora.com/",
              snippet: "Seattle brunch, lunch and dinner.",
            },
          ],
    );
    const listWorkIds = vi.fn(async () =>
      Array.from({ length: 20 }, (_, index) => `work-secret-${index + 1}`),
    );
    const service = createPositioningService({
      db,
      now: () => NOW,
      nextId: (prefix) => `${prefix}-discovery-${++seq}`,
      projects: {
        getProjectSubject: vi.fn(async () => ({ title: "", brief: "" })),
        listWorkIds,
      },
      research: { search },
    });
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "旧定位",
      keywords: ["旧", "定位", "历史"],
      productAnchorIds: [],
    });

    let session = await service.startDiscovery(ctx, "scratch");
    expect(session.inputManifest).toEqual({
      legacyProfileId: null,
      legacyStatementIds: [],
      legacyWorkIds: [],
    });
    expect(listWorkIds).not.toHaveBeenCalled();
    session = await service.updateDiscoveryAnswer(ctx, {
      sessionId: session.id,
      themeId: "goal",
      selectedOptionIds: ["personal-brand", "lead-generation"],
      customText: "服务杭州家装业主",
      skipped: false,
      expectedRevision: session.revision,
    });
    expect(session.answers[0]?.selectedOptionIds).toHaveLength(2);

    session = await service.researchDiscovery(ctx, {
      sessionId: session.id,
      query: "国内智能体 用户高频痛点",
      purpose: "补充公开用户问题",
      targetThemeId: "need",
      market: "cn",
      language: "zh-CN",
      expectedRevision: session.revision,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[1]).toContain("国内智能体 用户高频痛点");
    expect(search.mock.calls[0]?.[1]).toContain("中国大陆");
    expect(search.mock.calls[0]?.[1]).toContain("简体中文");
    expect(JSON.stringify(search.mock.calls)).not.toContain("服务杭州家装业主");
    expect(session.webReferences.map((item) => item.title)).not.toContain(
      "Cafe Flora | Vegetarian Restaurant Seattle",
    );
    expect(session.webReferences).toHaveLength(2);
    expect(session.webReferences[0]?.adopted).toBe(false);

    session = await service.setDiscoveryEvidence(ctx, {
      sessionId: session.id,
      evidenceId: session.webReferences[0]!.id,
      adopted: true,
      expectedRevision: session.revision,
    });
    expect(session.webReferences[0]?.adopted).toBe(true);

    session = await service.researchDiscovery(ctx, {
      sessionId: session.id,
      query: "企业智能体 客户需求",
      purpose: "补充公开用户问题",
      targetThemeId: "need",
      market: "cn",
      language: "zh-CN",
      expectedRevision: session.revision,
    });
    expect(session.webReferences).toHaveLength(2);
    expect(session.webReferences[0]?.title).toBe("国内智能体用户高频痛点");
    expect(session.webReferences[0]?.adopted).toBe(true);
    expect(session.webReferences[1]?.title).toBe("国内企业智能体客户需求观察");
    expect(session.webReferences.map((item) => item.title)).not.toContain(
      "智能体落地案例",
    );

    const optimizeSession = await service.startDiscovery(ctx, "optimize");
    expect(optimizeSession.inputManifest.legacyWorkIds).toHaveLength(12);
    expect(optimizeSession.inputManifest.legacyWorkIds[0]).toBe("work-secret-1");
    expect(optimizeSession.inputManifest.legacyWorkIds[11]).toBe("work-secret-12");
  });

  it("[T-686] 联网补充遇到旧 revision 时安全合并到最新前采会话", async () => {
    const search = vi.fn(async () => [
      {
        title: "湖南餐饮行业观察",
        url: "https://example.cn/hunan-catering",
        snippet: "湖南本地餐饮品牌正在通过短视频建立区域认知。",
      },
    ]);
    const service = createPositioningService({
      db,
      now: () => NOW,
      nextId: (prefix) => `${prefix}-stale-revision`,
      projects: makeProjectsPort(),
      research: { search },
    });
    const staleSession = await service.startDiscovery(ctx, "scratch");
    const latestSession = await service.updateDiscoveryAnswer(ctx, {
      sessionId: staleSession.id,
      themeId: "goal",
      selectedOptionIds: ["personal-brand"],
      customText: "服务湖南餐饮主理人",
      skipped: false,
      expectedRevision: staleSession.revision,
    });

    const researched = await service.researchDiscovery(ctx, {
      sessionId: staleSession.id,
      query: "湖南餐饮行业 IP",
      purpose: "补充公开行业信息",
      targetThemeId: "goal",
      market: "cn",
      language: "zh-CN",
      // 模拟用户停留在旧页面：服务端答案已经保存，但按钮仍携带旧 revision。
      expectedRevision: staleSession.revision,
    });

    expect(researched.revision).toBe(latestSession.revision + 1);
    expect(researched.answers).toEqual(latestSession.answers);
    expect(researched.webReferences).toHaveLength(1);
    expect(researched.webReferences[0]?.url).toBe(
      "https://example.cn/hunan-catering",
    );
  });

  it("[T-652] 前采采纳原子写入且幂等，并发候选只有一个成功", async () => {
    const service = makeService(db, makeProjectsPort(), "confirm");
    await service.upsertProfile(ctx, PROFILE_INPUT);
    const oldStatement = await service.createStatementVersion(ctx, {
      oneLiner: "旧定位",
      keywords: ["旧", "定位", "历史"],
      productAnchorIds: [],
    });
    let session = await service.startDiscovery(ctx, "scratch");
    const themes = [
      "goal",
      "strength",
      "audience",
      "need",
      "proof",
      "expression",
    ] as const;
    for (const themeId of themes) {
      session = await service.updateDiscoveryAnswer(ctx, {
        sessionId: session.id,
        themeId,
        selectedOptionIds: [`${themeId}-choice`],
        customText: "",
        skipped: false,
        expectedRevision: session.revision,
      });
    }
    expect(session.status).toBe("ready");

    const proposal = {
      persona: "实战型家装顾问",
      field: "杭州家装",
      audience: "准备装修的家庭",
      differentiation: "真实工地避坑",
      capabilities: ["工地验收", "预算拆解"],
      facets: {
        contentScope: "装修决策与工地实拍",
        avoid: "不做虚假报价",
        corePain: "预算不透明",
        coreValue: "少花冤枉钱",
        tone: "直接、具体",
        statusNote: "",
      },
      downstreamRules: {
        topicRule: "每题解决一个真实装修决策",
        scriptRule: "先场景再判断",
        projectRule: "优先真实工地",
        forbidRule: "不承诺绝对低价",
        expressionRule: "说人话",
      },
      oneLiner: "帮杭州家庭看懂装修里的钱和坑",
      keywords: ["杭州家装", "预算", "避坑"],
      productAnchorIds: [],
    };
    const input = {
      sessionId: session.id,
      candidateId: "candidate-a",
      candidateRevision: session.revision,
      expectedCurrentStatementId: oldStatement.id,
      idempotencyKey: "confirm-attempt-a",
      proposal,
    };
    const first = await service.confirmDiscovery(ctx, input);
    const replay = await service.confirmDiscovery(ctx, input);
    expect(replay.statement.id).toBe(first.statement.id);
    expect(replay.profile.id).toBe(first.profile.id);
    expect(first.session.status).toBe("adopted");
    expect((await service.listStatements(ctx, { limit: 20, offset: 0 })).total).toBe(2);

    await expect(
      service.confirmDiscovery(ctx, {
        ...input,
        candidateId: "candidate-b",
        idempotencyKey: "confirm-attempt-b",
      }),
    ).rejects.toBeInstanceOf(DiscoveryConflictError);
    expect((await service.getProfile(ctx))?.persona).toBe("实战型家装顾问");
    expect((await service.listStatements(ctx, { limit: 20, offset: 0 })).total).toBe(2);
  });

  it("[T-707] draft 前采候选可直接采纳，不再要求六问全部完成", async () => {
    const service = makeService(db, makeProjectsPort(), "confirm-draft");
    const session = await service.startDiscovery(ctx, "scratch");
    expect(session.status).toBe("draft");

    const result = await service.confirmDiscovery(ctx, {
      sessionId: session.id,
      candidateId: "candidate-direct",
      candidateRevision: session.revision,
      expectedCurrentStatementId: null,
      idempotencyKey: "confirm-direct-draft",
      proposal: {
        persona: "真实成长记录者",
        field: "个人成长",
        audience: "待验证",
        differentiation: "用真实过程代替空洞说教",
        capabilities: ["经历复盘"],
        facets: {
          contentScope: "成长过程与阶段性思考",
          avoid: "不虚构产品和结果",
          corePain: "待验证",
          coreValue: "提供可参考的真实路径",
          tone: "坦率、具体",
          statusNote: "",
        },
        downstreamRules: {
          topicRule: "从真实经历出题",
          scriptRule: "事实与假设分开",
          projectRule: "优先记录真实过程",
          forbidRule: "不虚构产品",
          expressionRule: "说人话",
        },
        oneLiner: "记录普通人把想法做成作品的真实过程",
        keywords: ["成长", "实践", "复盘"],
        productAnchorIds: [],
      },
    });

    expect(result.session.status).toBe("adopted");
    expect(result.statement.oneLiner).toBe("记录普通人把想法做成作品的真实过程");
  });

  it("[T-521] 旧动态 statusNote 清理按账号隔离、幂等，并只审计 hash 不泄露原文", async () => {
    const audit = vi.fn(async () => undefined);
    let seq = 0;
    const service = createPositioningService({
      db,
      now: () => NOW,
      nextId: (prefix) => `${prefix}-cleanup-${++seq}`,
      projects: makeProjectsPort(),
      auditLegacyStatusNoteCleanup: audit,
    });
    const ctxAcc1: RequestContext = { ...ctx, accountId: "acc-1" };
    const ctxAcc2: RequestContext = { ...ctx, accountId: "acc-2" };
    await service.upsertProfile(ctxAcc1, {
      ...PROFILE_INPUT,
      facets: { statusNote: "49 条稿子压在 review，一直未发布" },
    });
    await service.upsertProfile(ctxAcc2, {
      ...PROFILE_INPUT,
      facets: { statusNote: "稳定更新中" },
    });

    const first = await service.cleanupLegacyDynamicStatusNote(ctxAcc1);
    const second = await service.cleanupLegacyDynamicStatusNote(ctxAcc1);

    expect(first.outcome).toBe("cleared");
    expect(first.previousValueHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toEqual({
      outcome: "already_clean",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctxAcc1))!.facets.statusNote).toBe("");
    expect((await service.getProfile(ctxAcc2))!.facets.statusNote).toBe("稳定更新中");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "positioning.legacy_status_note.cleaned",
        userId: ctx.userId,
        accountId: "acc-1",
        previousValueHash: first.previousValueHash,
      }),
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain("49 条稿子");
  });

  it("[T-521] 非动态状态说明不被自动改写成另一条静态计数", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "稳定更新中" },
    });

    await expect(service.cleanupLegacyDynamicStatusNote(ctx)).resolves.toEqual({
      outcome: "not_dynamic",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctx))!.facets.statusNote).toBe("稳定更新中");

    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "2026 年发布规划按周推进" },
    });
    await expect(service.cleanupLegacyDynamicStatusNote(ctx)).resolves.toEqual({
      outcome: "not_dynamic",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctx))!.facets.statusNote).toBe(
      "2026 年发布规划按周推进",
    );

    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "2026 年发布规划：每月发布 4 条视频" },
    });
    await expect(service.cleanupLegacyDynamicStatusNote(ctx)).resolves.toEqual({
      outcome: "not_dynamic",
      previousValueHash: null,
    });
    expect((await service.getProfile(ctx))!.facets.statusNote).toBe(
      "2026 年发布规划：每月发布 4 条视频",
    );
  });

  it("[T-521] AI 上下文共用的 getPositioningCenter 会自动执行一次旧动态计数清理", async () => {
    const audit = vi.fn(async () => undefined);
    let seq = 0;
    const service = createPositioningService({
      db,
      now: () => NOW,
      nextId: (prefix) => `${prefix}-center-cleanup-${++seq}`,
      projects: makeProjectsPort(),
      auditLegacyStatusNoteCleanup: audit,
    });
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: { statusNote: "49 条 review 稿件未发布" },
    });

    const center = await service.getPositioningCenter(ctx);

    expect(center.profile!.facets.statusNote).toBe("");
    expect(audit).toHaveBeenCalledTimes(1);
    await service.getPositioningCenter(ctx);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("createStatementVersion requires a profile first (ProfileRequiredError)", async () => {
    const service = makeService(db, makeProjectsPort());
    await expect(
      service.createStatementVersion(ctx, {
        oneLiner: "x",
        keywords: ["a", "b", "c"],
        productAnchorIds: [],
      }),
    ).rejects.toBeInstanceOf(ProfileRequiredError);
  });

  it("append-only version chain: v2 is version 2 and leaves v1 byte-identical", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    const v1 = await service.createStatementVersion(ctx, {
      oneLiner: "v1 文案",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: ["product-1"],
    });
    expect(v1.versionNumber).toBe(1);
    expect(v1.masterSnapshot).toMatchObject({
      persona: PROFILE_INPUT.persona,
      field: PROFILE_INPUT.field,
      audience: PROFILE_INPUT.audience,
    });
    const v2 = await service.createStatementVersion(ctx, {
      oneLiner: "v2 文案",
      keywords: ["论文", "生产级", "工程化"],
      productAnchorIds: ["product-1", "product-2"],
    });
    expect(v2.versionNumber).toBe(2);
    // re-read v1 — unchanged.
    const reread = await service.getStatement(ctx, v1.id);
    expect(reread).toEqual(v1);
    // No update/delete method exposed (immutability, mirrors Artifacts).
    expect(
      (service as unknown as Record<string, unknown>).updateStatement,
    ).toBeUndefined();
    expect(
      (service as unknown as Record<string, unknown>).deleteStatement,
    ).toBeUndefined();
  });

  it("[T-666] resetMaster 不能清空已有母版，画像、规则、当前版本和历史都保持不变", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: {
        contentScope: "AI 工程",
        avoid: "泛泛而谈",
        corePain: "论文难落地",
        coreValue: "可运行代码",
        tone: "工程师口吻",
        statusNote: "稳定更新",
      },
      downstreamRules: {
        topicRule: "只做工程落地",
        scriptRule: "先给结果",
        projectRule: "必须可演示",
        forbidRule: "不编数据",
        expressionRule: "不用营销腔",
      },
    });
    const v1 = await service.createStatementVersion(ctx, {
      oneLiner: "旧定位",
      keywords: ["旧", "定位", "规则"],
      productAnchorIds: ["product-old"],
    });

    await expect(service.resetMaster(ctx)).rejects.toThrow(/不能被清空/u);
    const center = await service.getPositioningCenter(ctx);
    expect(center.currentStatement?.id).toBe(v1.id);
    expect(center.profile).toMatchObject({
      persona: PROFILE_INPUT.persona,
      facets: { coreValue: "可运行代码" },
      downstreamRules: { topicRule: "只做工程落地" },
    });
    expect(center.history.map((item) => item.id)).toEqual([v1.id]);
  });

  it("[T-939] 恢复回写完整母版并选择原版本，不追加或改写旧历史", async () => {
    const service = makeService(db, makeProjectsPort(), "restore");
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      facets: {
        contentScope: "AI 工程实战",
        avoid: "泛泛而谈",
        corePain: "不会落地",
        coreValue: "可运行代码",
        tone: "工程师口吻",
        statusNote: "稳定更新",
      },
      downstreamRules: {
        topicRule: "必须可复现",
        scriptRule: "先给结果",
        projectRule: "必须有演示",
        forbidRule: "不编数据",
        expressionRule: "不用营销腔",
      },
    });
    const v1 = await service.createStatementVersion(ctx, {
      oneLiner: "完整旧母版",
      keywords: ["工程", "代码", "复现"],
      productAnchorIds: ["product-1"],
    });
    const immutableV1 = structuredClone(v1);

    const restored = await service.restoreMaster(ctx, v1.id);
    expect(restored.restoredFromVersion).toBe(1);
    expect(restored.statement.versionNumber).toBe(1);
    expect(restored.statement.id).toBe(v1.id);
    expect(restored.statement.oneLiner).toBe("完整旧母版");
    expect(restored.profile).toMatchObject({
      persona: PROFILE_INPUT.persona,
      field: PROFILE_INPUT.field,
      facets: { contentScope: "AI 工程实战", coreValue: "可运行代码" },
      downstreamRules: {
        topicRule: "必须可复现",
        expressionRule: "不用营销腔",
      },
    });
    expect(await service.getStatement(ctx, v1.id)).toEqual(immutableV1);
    const center = await service.getPositioningCenter(ctx);
    expect(center.currentStatement?.id).toBe(restored.statement.id);
    expect(center.profile?.downstreamRules.forbidRule).toBe("不编数据");
  });

  it("[T-666] statement 保存后画像又编辑，旧 reset 入口也不能新增备份或改写母版", async () => {
    const service = makeService(db, makeProjectsPort(), "backup");
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "仍沿用的陈述",
      keywords: ["一", "二", "三"],
      productAnchorIds: [],
    });
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      persona: "陈述保存后改过的人设",
      downstreamRules: { topicRule: "重置前最后规则" },
    });

    await expect(service.resetMaster(ctx)).rejects.toThrow(/不能被清空/u);
    const center = await service.getPositioningCenter(ctx);
    expect(center.history).toHaveLength(1);
    expect(center.profile?.persona).toBe("陈述保存后改过的人设");
    expect(center.profile?.downstreamRules.topicRule).toBe("重置前最后规则");
  });

  it("[T-632] 旧版无快照拒绝假恢复，跨账号恢复与未知 id 同样按 404 隔离", async () => {
    const service = makeService(db, makeProjectsPort(), "legacy");
    const ctxAcc1: RequestContext = { ...ctx, accountId: "acc-1" };
    const ctxAcc2: RequestContext = { ...ctx, accountId: "acc-2" };
    await service.upsertProfile(ctxAcc1, PROFILE_INPUT);
    await service.upsertProfile(ctxAcc2, PROFILE_INPUT);
    const legacy = await service.createStatementVersion(ctxAcc1, {
      oneLiner: "旧版只留陈述",
      keywords: ["旧", "版", "陈述"],
      productAnchorIds: [],
    });
    await db
      .update(positioningStatements)
      .set({ masterSnapshot: null })
      .where(eq(positioningStatements.id, legacy.id));

    await expect(
      service.restoreMaster(ctxAcc1, legacy.id),
    ).rejects.toBeInstanceOf(MasterSnapshotUnavailableError);
    await expect(
      service.restoreMaster(ctxAcc2, legacy.id),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("[T-666] 旧版陈述缺快照时 reset 也不以补齐为名清空当前母版", async () => {
    const service = makeService(db, makeProjectsPort(), "upgrade");
    await service.upsertProfile(ctx, {
      ...PROFILE_INPUT,
      persona: "升级前仍在使用的人设",
      downstreamRules: { topicRule: "升级前真实规则" },
    });
    const legacyCurrent = await service.createStatementVersion(ctx, {
      oneLiner: "旧安装包创建的陈述",
      keywords: ["旧", "安装包", "陈述"],
      productAnchorIds: [],
    });
    await db
      .update(positioningStatements)
      .set({ masterSnapshot: null })
      .where(eq(positioningStatements.id, legacyCurrent.id));

    await expect(service.resetMaster(ctx)).rejects.toThrow(/不能被清空/u);
    const center = await service.getPositioningCenter(ctx);
    const history = center.history;
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(legacyCurrent.id);
    expect(history[0]?.masterSnapshot).toBeNull();
    expect(center.currentStatement?.id).toBe(legacyCurrent.id);
    expect(center.profile?.persona).toBe("升级前仍在使用的人设");
    expect(center.profile?.downstreamRules.topicRule).toBe("升级前真实规则");
  });

  it("[T-666] resetMaster 对任何账号都拒绝，两个账号的母版都不受影响", async () => {
    const service = makeService(db, makeProjectsPort());
    const ctxAcc1: RequestContext = { ...ctx, accountId: "acc-1" };
    const ctxAcc2: RequestContext = { ...ctx, accountId: "acc-2" };
    await service.upsertProfile(ctxAcc1, {
      ...PROFILE_INPUT,
      persona: "一号旧母版",
    });
    await service.upsertProfile(ctxAcc2, {
      ...PROFILE_INPUT,
      persona: "二号保留母版",
      downstreamRules: { topicRule: "二号规则" },
    });
    await service.createStatementVersion(ctxAcc1, {
      oneLiner: "一号旧定位",
      keywords: ["一", "号", "旧"],
      productAnchorIds: [],
    });
    await service.createStatementVersion(ctxAcc2, {
      oneLiner: "二号当前定位",
      keywords: ["二", "号", "新"],
      productAnchorIds: [],
    });

    await expect(service.resetMaster(ctxAcc1)).rejects.toThrow(/不能被清空/u);
    const first = await service.getPositioningCenter(ctxAcc1);
    expect(first.profile?.persona).toBe("一号旧母版");
    expect(first.currentStatement?.oneLiner).toBe("一号旧定位");
    const untouched = await service.getPositioningCenter(ctxAcc2);
    expect(untouched.profile?.persona).toBe("二号保留母版");
    expect(untouched.profile?.downstreamRules.topicRule).toBe("二号规则");
    expect(untouched.currentStatement?.oneLiner).toBe("二号当前定位");
  });

  it("[T-231⑥] changeReason 落库:传了存 trim 后原文,不传存 ''(留痕不丢)", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    const withReason = await service.createStatementVersion(ctx, {
      oneLiner: "v1 文案",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: [],
      changeReason: "  受众从泛开发者收窄到 AI 应用工程师 ",
    });
    const without = await service.createStatementVersion(ctx, {
      oneLiner: "v2 文案",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: [],
    });
    // DTO 不含 changeReason(留痕列,读面后续接)—— 直接查行验证真落库。
    const { positioningStatements } = await import("./positioning.db-schema");
    const rows = await db.select().from(positioningStatements);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(withReason.id)?.changeReason).toBe(
      "受众从泛开发者收窄到 AI 应用工程师",
    );
    expect(byId.get(without.id)?.changeReason).toBe("");
  });

  it("rejects a statement whose keywords are not exactly 3", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await expect(
      service.createStatementVersion(ctx, {
        oneLiner: "x",
        keywords: ["a", "b"],
        productAnchorIds: [],
      }),
    ).rejects.toBeInstanceOf(StatementValidationError);
  });

  it("AI-formalize: createStatementVersion tags created_by_type 'ai' + ai_task_id (no parallel candidate machine)", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    const aiVersion = await service.createStatementVersion(ctx, {
      oneLiner: "AI 建议的定位",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: [],
      createdByType: "ai",
      aiTaskId: "ai-task-9",
    });
    expect(aiVersion.createdByType).toBe("ai");
    expect(aiVersion.aiTaskId).toBe("ai-task-9");
    // Positioning owns no candidate lifecycle (C-3).
    expect(
      (service as unknown as Record<string, unknown>).submitCandidate,
    ).toBeUndefined();
    expect(
      (service as unknown as Record<string, unknown>).confirm,
    ).toBeUndefined();
  });

  it("evaluateGate is deterministic + advisory: same input → same score twice, no mutation", async () => {
    const port = makeProjectsPort({
      title: "论文精读：工程化落地",
      brief: "把代码做成生产级",
    });
    const service = makeService(db, port);
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "把论文变代码",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: ["product-1"],
    });
    const r1 = await service.evaluateGate(ctx, {
      subjectType: "project",
      subjectId: "project-1",
    });
    const r2 = await service.evaluateGate(ctx, {
      subjectType: "project",
      subjectId: "project-1",
    });
    expect(r1.positioningFit).toBe(r2.positioningFit);
    expect(r1.reasons).toEqual(r2.reasons);
    expect(r1.positioningFit).toBeGreaterThanOrEqual(0);
    expect(r1.positioningFit).toBeLessThanOrEqual(100);
    // Keyword hits: "论文" + "代码" + "工程化" all present in subject text → 3/3.
    expect(r1.reasons).toContain("命中关键词 3/3");
    // statement list unchanged by evaluation (advisory, not mutating).
    const { total } = await service.listStatements(ctx, { limit: 50, offset: 0 });
    expect(total).toBe(1);
  });

  it("evaluateGate with no statement → GateSubjectError", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await expect(
      service.evaluateGate(ctx, {
        subjectType: "project",
        subjectId: "project-1",
      }),
    ).rejects.toBeInstanceOf(GateSubjectError);
  });

  it("evaluateGate accepts an inline candidate payload (OQ5) and scores anchor/role", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "把论文变代码",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: ["product-1"],
    });
    const r = await service.evaluateGate(ctx, {
      subjectType: "candidate",
      subjectId: "cand-1",
      candidate: {
        title: "论文解读",
        angle: "工程化",
        contentRole: "conversion",
        productAnchorId: "product-1",
      },
    });
    expect(r.subjectType).toBe("candidate");
    expect(r.reasons).toContain("锚定产品一致");
    expect(r.reasons).toContain("内容角色对齐 (conversion)");
  });

  it("getPositioningCenter empty-state returns nulls + empty arrays, not an error", async () => {
    const service = makeService(db, makeProjectsPort());
    const center = await service.getPositioningCenter(ctx);
    expect(center.profile).toBeNull();
    expect(center.currentStatement).toBeNull();
    expect(center.keywords).toEqual([]);
    expect(center.productAnchors).toEqual([]);
    expect(center.history).toEqual([]);
  });

  it("getPositioningCenter returns current = max version + history version-desc", async () => {
    const service = makeService(db, makeProjectsPort());
    await service.upsertProfile(ctx, PROFILE_INPUT);
    await service.createStatementVersion(ctx, {
      oneLiner: "v1",
      keywords: ["a", "b", "c"],
      productAnchorIds: [],
    });
    await service.createStatementVersion(ctx, {
      oneLiner: "v2",
      keywords: ["d", "e", "f"],
      productAnchorIds: ["product-9"],
    });
    const center = await service.getPositioningCenter(ctx);
    expect(center.currentStatement!.versionNumber).toBe(2);
    expect(center.keywords).toEqual(["d", "e", "f"]);
    expect(center.productAnchors).toEqual(["product-9"]);
    expect(center.history.map((h) => h.versionNumber)).toEqual([2, 1]);
  });

  // ── [T-136 切片 ④ · SPEC §C/§D] service→repo accountId 透传:切号 = 换定位母版 ──
  it("按号切:同 user 不同 accountId 的 getPositioningCenter 见各自的定位母版", async () => {
    const service = makeService(db, makeProjectsPort());
    const ctxAcc1: RequestContext = { ...ctx, accountId: "acc-1" };
    const ctxAcc2: RequestContext = { ...ctx, accountId: "acc-2" };

    await service.upsertProfile(ctxAcc1, { ...PROFILE_INPUT, persona: "科技号" });
    await service.upsertProfile(ctxAcc2, { ...PROFILE_INPUT, persona: "美食号" });

    // 号 1 只见科技号母版;号 2 只见美食号母版 —— 切号即换约束(§D)。
    const center1 = await service.getPositioningCenter(ctxAcc1);
    const center2 = await service.getPositioningCenter(ctxAcc2);
    expect(center1.profile!.persona).toBe("科技号");
    expect(center2.profile!.persona).toBe("美食号");
    expect(center1.profile!.id).not.toBe(center2.profile!.id);

    // statement 也按号:号 1 建的 statement 在号 2 的 center 里看不到。
    await service.createStatementVersion(ctxAcc1, {
      oneLiner: "科技号定位",
      keywords: ["a", "b", "c"],
      productAnchorIds: [],
    });
    expect((await service.getPositioningCenter(ctxAcc1)).currentStatement)
      .not.toBeNull();
    expect(
      (await service.getPositioningCenter(ctxAcc2)).currentStatement,
    ).toBeNull();
  });
});
