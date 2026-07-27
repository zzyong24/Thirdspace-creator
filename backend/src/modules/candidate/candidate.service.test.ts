import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { ErrorCode, type RequestContext } from "@creatoros/contract";
import {
  createCandidateService,
  type CandidateService,
  type CandidateProjectsPort,
  type CandidatePositioningPort,
  type CandidateIngestionPort,
} from "./candidate.service";
import {
  PromoteStateError,
  DanglingRunError,
  OwnershipError,
  AccountRequiredError,
} from "./candidate.errors";

// Candidate service test (Task 3) — fake now/nextId, pglite db, stubbed peer ports.
// Covers: manual createCandidate (idea, positioningFit from gate or null);
// createFromAIResult (C-3 formalize — source∈{trend,benchmark,demand}, aiTaskId set,
// no parallel machine, idempotent); ingestAudienceSignal (C-4 — requires runId,
// RISK-005 dangling-run rejection, demandCount bump); linkSignalToCandidate (omit →
// spawn demand Candidate); promote (类比 promoteReviewInsight, no double-promote,
// atomic project+status+promotion). Deterministic clock/ids (no Date.now/Math.random).

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] per-account 域读写必须带号(未选号 → AccountRequiredError,见专项用例)。
const ctx: RequestContext = {
  userId: "user-a",
  requestId: "r1",
  source: "user",
  accountId: "acc-a",
};
const ingestCtx: RequestContext = {
  userId: "user-a",
  requestId: "r2",
  source: "ingestion",
  ingestionRunId: "run-1",
  accountId: "acc-a",
};

function makePorts() {
  const projects: CandidateProjectsPort & {
    createProject: ReturnType<typeof vi.fn>;
  } = {
    createProject: vi.fn(async (_ctx, cmd) => ({
      id: `proj-${cmd.title}`,
    })),
  };
  const positioning: CandidatePositioningPort & {
    evaluateFit: ReturnType<typeof vi.fn>;
  } = {
    evaluateFit: vi.fn(async () => 72),
  };
  const ingestion: CandidateIngestionPort & {
    assertRunExists: ReturnType<typeof vi.fn>;
  } = { assertRunExists: vi.fn(async () => {}) };
  return { projects, positioning, ingestion };
}

function makeService(
  db: Db,
  ports: ReturnType<typeof makePorts>,
  opts: { withPositioning?: boolean } = {},
  tag = "a",
): CandidateService {
  let seq = 0;
  return createCandidateService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects: ports.projects,
    positioning: opts.withPositioning === false ? undefined : ports.positioning,
    ingestion: ports.ingestion,
  });
}

describe("candidate service", () => {
  let db: Db;
  let ports: ReturnType<typeof makePorts>;
  let svc: CandidateService;
  beforeEach(async () => {
    ({ db } = await createDb());
    ports = makePorts();
    svc = makeService(db, ports);
  });

  it("createCandidate(idea) lands in pool with positioningFit from the gate port", async () => {
    const c = await svc.createCandidate(ctx, {
      title: "新选题",
      angle: "切入",
    });
    expect(c.source).toBe("idea");
    expect(c.status).toBe("pool");
    expect(c.demandCount).toBe(0);
    expect(c.positioningFit).toBe(72);
    expect(ports.positioning.evaluateFit).toHaveBeenCalledOnce();
  });

  it("[T-472] 落库域拒绝吞入 JSON 字段或超长正文的污染标题", async () => {
    await expect(
      svc.createCandidate(ctx, {
        title:
          'AI 选题";"contentRole":"trust","source":"demand","predictedScore":88',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ValidationError });
    await expect(
      svc.createFromAIResult(ctx, {
        aiTaskId: "ait-polluted",
        resultType: "candidate",
        resultData: {
          title: "大段正文".repeat(40),
          source: "trend",
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ValidationError });
    const list = await svc.listCandidates(ctx, { limit: 100, offset: 0 });
    expect(list.rows).toHaveLength(0);
  });

  it("createCandidate(idea) has null positioningFit when the gate port is absent (soft dep)", async () => {
    const noGate = makeService(db, ports, { withPositioning: false });
    const c = await noGate.createCandidate(ctx, { title: "无门禁选题", angle: "" });
    expect(c.positioningFit).toBeNull();
  });

  it("createFromAIResult formalizes an AITaskResult (trend) with aiTaskId; no parallel machine; idempotent", async () => {
    const result = {
      aiTaskId: "ait-1",
      resultType: "candidate" as const,
      resultData: { title: "AI 选题", angle: "AI 切入", source: "trend" as const },
    };
    const c = await svc.createFromAIResult(ctx, result);
    expect(c.source).toBe("trend");
    expect(c.aiTaskId).toBe("ait-1");
    expect(c.status).toBe("pool"); // pool, NOT an awaiting/confirmed candidate state
    // Idempotent: re-calling with the same aiTaskId returns the same row, no dup.
    const again = await svc.createFromAIResult(ctx, result);
    expect(again.id).toBe(c.id);
    const list = await svc.listCandidates(ctx, { limit: 100, offset: 0 });
    expect(list.rows.filter((r) => r.aiTaskId === "ait-1")).toHaveLength(1);
  });

  it("createCandidate starts with an empty 选题卡 (待评估 — no oneLiner)", async () => {
    const c = await svc.createCandidate(ctx, { title: "空卡选题" });
    expect(c.card.oneLiner).toBeUndefined();
    expect(c.card.contentStructure).toEqual([]);
    expect(c.card.audiencePainScore).toBeNull();
    expect(c.card.productionDifficulty).toBeNull();
  });

  it("[T-482/T-546] intelligence 候选一次持久化生成内容与原视频来源，后续补全不得抹掉", async () => {
    const sourceReference = {
      kind: "original_video" as const,
      platform: "douyin",
      label: "原视频",
      url: "https://www.douyin.com/video/7350000000000000000",
      intelligenceItemId: "item-1",
    };
    const c = await svc.createCandidate(ctx, {
      title: "来自内容雷达的选题",
      angle: "换成本账号视角",
      source: "benchmark",
      card: {
        oneLiner: "来自内容雷达的选题",
        hook: "先用结果制造反差",
        contentStructure: ["反差开场", "拆解原因", "给出行动"],
        materialBasis: "来自真实视频逐字稿",
        proposal: "差异化切法：改为本账号实操视角",
      },
      sourceReferences: [sourceReference],
    });
    expect(c.card).toMatchObject({
      oneLiner: "来自内容雷达的选题",
      hook: "先用结果制造反差",
      contentStructure: ["反差开场", "拆解原因", "给出行动"],
      materialBasis: "来自真实视频逐字稿",
      proposal: "差异化切法：改为本账号实操视角",
    });
    expect(c.card.sourceReferences).toEqual([sourceReference]);

    const enriched = await svc.enrichCard(ctx, c.id, {
      oneLiner: "补全后的一句话选题",
      contentStructure: ["钩子", "论证", "结尾"],
    });
    expect(enriched.card.sourceReferences).toEqual([sourceReference]);
  });

  it("enrichCard cleans + replaces the stored card (topic.enrich confirm seam)", async () => {
    const c = await svc.createCandidate(ctx, { title: "待补全选题" });
    const enriched = await svc.enrichCard(ctx, c.id, {
      oneLiner: "一句话",
      targetAudience: "AI 创作者",
      contentStructure: ["开头", "中段", "结尾"],
      audiencePainScore: 88,
      materialScore: 130, // out of range → clamped to null (honest)
      productionDifficulty: "mid",
      bogusField: "dropped", // unknown key → dropped
    });
    expect(enriched.card.oneLiner).toBe("一句话");
    expect(enriched.card.targetAudience).toBe("AI 创作者");
    expect(enriched.card.contentStructure).toEqual(["开头", "中段", "结尾"]);
    expect(enriched.card.audiencePainScore).toBe(88);
    expect(enriched.card.materialScore).toBeNull();
    expect(enriched.card.productionDifficulty).toBe("mid");
    expect((enriched.card as Record<string, unknown>).bogusField).toBeUndefined();
    // It REPLACES (not merges) — a re-read returns the enriched card.
    const reread = await svc.getCandidate(ctx, c.id);
    expect(reread.card.oneLiner).toBe("一句话");
  });

  it("patchCandidate.card shallow-merges a partial 选题卡 edit (other fields untouched)", async () => {
    const c = await svc.createCandidate(ctx, { title: "可编辑选题" });
    await svc.enrichCard(ctx, c.id, { oneLiner: "原一句话", hook: "原 Hook" });
    const patched = await svc.patchCandidate(ctx, c.id, {
      card: { hook: "新 Hook" },
    });
    expect(patched.card.oneLiner).toBe("原一句话"); // untouched
    expect(patched.card.hook).toBe("新 Hook"); // edited
  });

  it("ingestAudienceSignal requires a real IngestionRun (RISK-005 dangling-run rejection)", async () => {
    ports.ingestion.assertRunExists.mockRejectedValueOnce(
      new OwnershipError("OwnershipError: run not found"),
    );
    await expect(
      svc.ingestAudienceSignal(ingestCtx, {
        source: "comment",
        rawText: "怎么入门？",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("ingestAudienceSignal rejects when ctx carries no ingestionRunId", async () => {
    await expect(
      svc.ingestAudienceSignal(ctx, { source: "comment", rawText: "q" }),
    ).rejects.toBeInstanceOf(DanglingRunError);
  });

  it("ingestAudienceSignal writes a signal carrying the runId and bumps demandCount of the linked candidate", async () => {
    const cand = await svc.createCandidate(ctx, { title: "需求选题", angle: "" });
    const signal = await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "怎么报名？",
      linkedCandidateRef: cand.id,
    });
    expect(signal.ingestionRunId).toBe("run-1");
    expect(signal.linkedCandidateId).toBe(cand.id);
    expect(ports.ingestion.assertRunExists).toHaveBeenCalledWith(
      ingestCtx,
      "run-1",
    );
    const refreshed = await svc.getCandidate(ctx, cand.id);
    expect(refreshed.demandCount).toBe(1);
  });

  it("linkSignalToCandidate with no candidateId spawns a demand Candidate from the signal and links it", async () => {
    const signal = await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "有没有进阶课？",
      demandTag: "进阶",
    });
    const cand = await svc.linkSignalToCandidate(ctx, signal.id, undefined);
    expect(cand.source).toBe("demand");
    expect(cand.title).toContain("有没有进阶课");
    expect(cand.demandCount).toBe(1);
    // the signal now points at the new candidate.
    const signals = await svc.listSignals(ctx, {
      linkedCandidateId: cand.id,
      limit: 100,
      offset: 0,
    });
    expect(signals.rows).toHaveLength(1);
  });

  it("linkSignalToCandidate to an existing candidate bumps that candidate's demandCount", async () => {
    const cand = await svc.createCandidate(ctx, { title: "目标选题", angle: "" });
    const signal = await svc.ingestAudienceSignal(ingestCtx, {
      source: "dm",
      rawText: "私信问题",
    });
    const linked = await svc.linkSignalToCandidate(ctx, signal.id, cand.id);
    expect(linked.id).toBe(cand.id);
    expect(linked.demandCount).toBe(1);
  });

  it("promote calls ProjectsService.createProject, sets promoted, writes a promotion row", async () => {
    const cand = await svc.createCandidate(ctx, {
      title: "可晋升选题",
      angle: "切入",
      contentRole: "conversion",
    });
    const promo = await svc.promote(ctx, cand.id);
    expect(ports.projects.createProject).toHaveBeenCalledOnce();
    expect(promo.candidateId).toBe(cand.id);
    expect(promo.projectId).toBe("proj-可晋升选题");
    const refreshed = await svc.getCandidate(ctx, cand.id);
    expect(refreshed.status).toBe("promoted");
  });

  // 选题 → Brief 映射(§6.1):promote 用候选标题 + 选题卡填一份结构化 Brief 草稿,
  // 随立项落到新项目 brief 阶段(立项工作台)。这里断言传给 createProject 的 briefDetail。
  it("promote seeds a brief draft from the candidate title + card (选题→Brief 映射)", async () => {
    const cand = await svc.createCandidate(ctx, {
      title: "如何选定内容定位",
      angle: "用一条视频讲清楚定位",
      contentRole: "trust",
    });
    // 补全选题卡(targetAudience / oneLiner / format / proposal)。
    await svc.patchCandidate(ctx, cand.id, {
      card: {
        targetAudience: "想转型做内容的职场人",
        oneLiner: "三步找到你的内容定位",
        format: "口播",
        proposal: "建立专业信任,引导私域咨询",
      },
    });
    await svc.promote(ctx, cand.id);
    const [, cmd] = ports.projects.createProject.mock.calls[0]!;
    // current_stage=brief 由 ProjectsService 内部设(promote 不显式传);此处验草稿映射。
    expect(cmd.briefDetail).toEqual({
      targetAudience: "想转型做内容的职场人",
      contentGoal: "建立专业信任,引导私域咨询",
      contentFormat: "口播",
      coreMessage: "三步找到你的内容定位",
    });
    // 标题 → 项目名;来源标注写进 brief 文本(手动灵感)。
    expect(cmd.title).toBe("如何选定内容定位");
    expect(cmd.brief).toContain("手动灵感");
  });

  // [T-284a] 复刻补链 G1:benchmark 转化候选(card.teardown 存在)立项时,把原爆款 5 段拆解要素
  //   复制进 briefDetail.benchmarkRef —— creative-context 据此回流写稿。
  it("promote carries card.teardown into briefDetail.benchmarkRef (复刻携带链)", async () => {
    const cand = await svc.createCandidate(ctx, {
      title: "本账号新题",
      angle: "换本账号角度重做",
      source: "benchmark",
    });
    await svc.patchCandidate(ctx, cand.id, {
      card: {
        oneLiner: "一句话主张",
        teardown: {
          钩子拆解: "开头抛反常识",
          结构拆解: "总分总",
          为什么爆: "信息增量高",
          可借鉴点: ["数字钩子", "反差"],
          适配本账号建议: "换本账号场景",
        },
      },
    });
    await svc.promote(ctx, cand.id);
    const [, cmd] = ports.projects.createProject.mock.calls[0]!;
    expect(cmd.briefDetail?.benchmarkRef).toEqual({
      钩子拆解: "开头抛反常识",
      结构拆解: "总分总",
      为什么爆: "信息增量高",
      可借鉴点: ["数字钩子", "反差"],
      适配本账号建议: "换本账号场景",
    });
  });

  // [T-284a] 非 benchmark 候选(无 card.teardown)→ 立项不写 benchmarkRef(普通创作不携带、不污染)。
  it("promote of a non-benchmark candidate leaves benchmarkRef undefined (不污染)", async () => {
    const cand = await svc.createCandidate(ctx, {
      title: "普通选题",
      angle: "普通角度",
    });
    await svc.promote(ctx, cand.id);
    const [, cmd] = ports.projects.createProject.mock.calls[0]!;
    expect(cmd.briefDetail?.benchmarkRef).toBeUndefined();
  });

  it("promote on an already-promoted Candidate throws PromoteStateError (no double-promote)", async () => {
    const cand = await svc.createCandidate(ctx, { title: "选题", angle: "" });
    await svc.promote(ctx, cand.id);
    await expect(svc.promote(ctx, cand.id)).rejects.toBeInstanceOf(
      PromoteStateError,
    );
    // exactly one project created (no duplicate).
    expect(ports.projects.createProject).toHaveBeenCalledOnce();
  });

  it("multi-tenant: user B cannot get/promote user A's candidate (404)", async () => {
    const cand = await svc.createCandidate(ctx, { title: "A 选题", angle: "" });
    const ctxB: RequestContext = {
      userId: "user-b",
      requestId: "rb",
      source: "user",
      accountId: "acc-b",
    };
    await expect(svc.getCandidate(ctxB, cand.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svc.promote(ctxB, cand.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  // [T-332 S2] 未选号 = 引导态,per-account 读写一律 AccountRequiredError(SPEC §4.2)。
  it("未选号(ctx 无 accountId)→ 读写均抛 AccountRequiredError", async () => {
    const noAcctCtx: RequestContext = {
      userId: "user-a",
      requestId: "rn",
      source: "user",
    };
    await expect(
      svc.createCandidate(noAcctCtx, { title: "无号选题" }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      svc.listCandidates(noAcctCtx, { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(svc.getTopicsOverview(noAcctCtx)).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
  });

  // [T-332 S2] 同 user 双号隔离:B 号看不到 A 号的候选,by-id 跨号 → OwnershipError 404。
  it("同 user 双号隔离:跨号 get → 404,list 互不可见", async () => {
    const ctxAcc2: RequestContext = {
      userId: "user-a",
      requestId: "r2",
      source: "user",
      accountId: "acc-b",
    };
    const cand = await svc.createCandidate(ctx, { title: "号A选题", angle: "" });
    await expect(svc.getCandidate(ctxAcc2, cand.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    const list = await svc.listCandidates(ctxAcc2, { limit: 100, offset: 0 });
    expect(list.rows).toHaveLength(0);
  });

  it("listCandidates sorts by demandCount desc when requested", async () => {
    const low = await svc.createCandidate(ctx, { title: "低需求", angle: "" });
    const high = await svc.createCandidate(ctx, { title: "高需求", angle: "" });
    // two signals on high, one on low.
    for (const text of ["q1", "q2"]) {
      const s = await svc.ingestAudienceSignal(ingestCtx, {
        source: "comment",
        rawText: text,
      });
      await svc.linkSignalToCandidate(ctx, s.id, high.id);
    }
    const s = await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "q3",
    });
    await svc.linkSignalToCandidate(ctx, s.id, low.id);

    const list = await svc.listCandidates(ctx, {
      sort: "demandCount",
      limit: 100,
      offset: 0,
    });
    const idx = (id: string) => list.rows.findIndex((r) => r.id === id);
    expect(idx(high.id)).toBeLessThan(idx(low.id));
  });

  it("getTopicsOverview derives the 6-state funnel from real rows (no status column)", async () => {
    // 待评估: a bare pool candidate (empty card).
    await svc.createCandidate(ctx, { title: "待评估选题" });
    // 待补充: a pool candidate WITH an enriched card (oneLiner present).
    const enriched = await svc.createCandidate(ctx, { title: "待补充选题" });
    await svc.enrichCard(ctx, enriched.id, { oneLiner: "已补全一句话" });
    // 已丢弃: a dropped candidate.
    const drop = await svc.createCandidate(ctx, { title: "废弃选题" });
    await svc.patchCandidate(ctx, drop.id, { status: "dropped" });
    // 待收集: an unlinked audience signal.
    await svc.ingestAudienceSignal(ingestCtx, {
      source: "comment",
      rawText: "未挂接的评论问题",
    });
    // 已立项: promote one candidate → topic_promotions row.
    const promo = await svc.createCandidate(ctx, { title: "立项选题" });
    await svc.promote(ctx, promo.id);

    const ov = await svc.getTopicsOverview(ctx);
    const f = Object.fromEntries(ov.funnel.map((x) => [x.key, x.count]));
    expect(f.collecting).toBe(1); // 待收集 — unlinked signal
    expect(f.evaluating).toBe(1); // 待评估 — pool, empty card
    expect(f.enriching).toBe(1); // 待补充 — pool, enriched card
    expect(f.promoted).toBe(1); // 已立项 — one promotion
    expect(f.dropped).toBe(1); // 已丢弃 — one dropped
    // 来源:comment count is real；「手动灵感」是当前选题投影，只数仍在 pool 的 idea。
    const s = Object.fromEntries(ov.sources.map((x) => [x.key, x.count]));
    expect(s.comment).toBe(1);
    expect(s.idea).toBe(2);
    expect(ov.sources).toHaveLength(7);
    // SOFT cross-module deps are unwired here → honest 0/"".
    expect(ov.basis.knowledgeCards).toBe(0);
    expect(ov.basis.positioningLabel).toBe("");
  });
});

// 复盘每作品评论 (T-030 §4.2/§10, D6) — listCommentsForPublication service/repo.
// 种几条 source='comment' + publication_id=P 的信号 + 别的 publication / 别的 source 的 →
// 只返 P 的评论、≤100、按 created_at 倒序。用递增时钟制造确定性顺序。
describe("listCommentsForPublication (T-030 D6)", () => {
  let db: Db;
  let ports: ReturnType<typeof makePorts>;
  let svc: CandidateService;
  // 递增时钟:每次 now() 前进 1 秒 → 每条信号 created_at 唯一,排序确定。
  let clock: number;
  const runCtx = (runId: string): RequestContext => ({
    userId: "user-a",
    requestId: "r",
    source: "ingestion",
    ingestionRunId: runId,
    accountId: "acc-a",
  });

  beforeEach(async () => {
    ({ db } = await createDb());
    ports = makePorts();
    clock = Date.parse("2026-06-21T00:00:00.000Z");
    let seq = 0;
    svc = createCandidateService({
      db,
      now: () => new Date((clock += 1000)).toISOString(),
      nextId: (prefix: string) => `${prefix}-d6-${++seq}`,
      projects: ports.projects,
      positioning: ports.positioning,
      ingestion: ports.ingestion,
    });
  });

  it("只返该 publication 的 comment 信号,按 created_at 倒序", async () => {
    // P 的三条评论(递增时钟 → c1<c2<c3),外加别 publication / 别 source 的干扰行。
    await svc.ingestAudienceSignal(runCtx("run-1"), {
      source: "comment",
      rawText: "P 评论一",
      publicationId: "pub-P",
    });
    await svc.ingestAudienceSignal(runCtx("run-1"), {
      source: "comment",
      rawText: "P 评论二",
      publicationId: "pub-P",
    });
    await svc.ingestAudienceSignal(runCtx("run-1"), {
      source: "comment",
      rawText: "P 评论三",
      publicationId: "pub-P",
    });
    // 干扰:别的 publication 的评论。
    await svc.ingestAudienceSignal(runCtx("run-1"), {
      source: "comment",
      rawText: "Q 的评论(不该出现)",
      publicationId: "pub-Q",
    });
    // 干扰:同 publication 但 source=dm(非评论,不该出现)。
    await svc.ingestAudienceSignal(runCtx("run-1"), {
      source: "dm",
      rawText: "P 的私信(不该出现)",
      publicationId: "pub-P",
    });
    // 干扰:comment 但无 publication_id(存量口径,查不到)。
    await svc.ingestAudienceSignal(runCtx("run-1"), {
      source: "comment",
      rawText: "无绑定评论(不该出现)",
    });

    const rows = await svc.listCommentsForPublication(ctx, "pub-P", 100);
    expect(rows).toHaveLength(3); // 只有 P 的 3 条 comment
    expect(rows.every((r) => r.source === "comment")).toBe(true);
    expect(rows.every((r) => r.publicationId === "pub-P")).toBe(true);
    // 倒序:最新(评论三)在最前。
    expect(rows.map((r) => r.rawText)).toEqual([
      "P 评论三",
      "P 评论二",
      "P 评论一",
    ]);
  });

  it("limit 封顶(≤ limit)", async () => {
    for (let i = 0; i < 5; i++) {
      await svc.ingestAudienceSignal(runCtx("run-1"), {
        source: "comment",
        rawText: `评论 ${i}`,
        publicationId: "pub-P",
      });
    }
    const rows = await svc.listCommentsForPublication(ctx, "pub-P", 3);
    expect(rows).toHaveLength(3); // 5 条中只取前 3(最新的)
    expect(rows[0]!.rawText).toBe("评论 4"); // 最新在最前
  });

  it("无评论 → 空数组(诚实空态源)", async () => {
    const rows = await svc.listCommentsForPublication(ctx, "pub-none", 100);
    expect(rows).toEqual([]);
  });

  it("user-scoped:不跨用户(别人的 publication 评论查不到)", async () => {
    // user-a 在 pub-P 落一条评论。
    await svc.ingestAudienceSignal(runCtx("run-1"), {
      source: "comment",
      rawText: "user-a 的评论",
      publicationId: "pub-P",
    });
    // user-b 查同一 publicationId → 空(user_id 作用域隔离)。
    const otherCtx: RequestContext = {
      userId: "user-b",
      requestId: "r",
      source: "user",
      accountId: "acc-b",
    };
    const rows = await svc.listCommentsForPublication(otherCtx, "pub-P", 100);
    expect(rows).toEqual([]);
  });
});
