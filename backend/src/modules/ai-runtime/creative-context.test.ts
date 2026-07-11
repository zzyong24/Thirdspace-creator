import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  assembleCreativeContext,
  formatKnowledgeBrief,
  formatUserMaterialBrief,
  materialQueryTerms,
  markReconstructedBrief,
  buildKnowledgeQuery,
  truncateKnowledgeBriefToBudget,
  KNOWLEDGE_BRIEF_BUDGET_CHARS,
  type ContextDeps,
  type KnowledgeRow,
  type ProjectMaterial,
} from "./creative-context";

// F2 消费侧隔离单测(T-030-D4,SPEC §7 边界②)。creative-context 把项目的论点树/内容合同/
// 结构方案 artifact 当「用户已确认前提」注入下游(planning.outline / planning.contract /
// script.draft)。当这些 artifact 是 AI 历史反推(origin='reconstructed')时,brief **必须**被
// 显式标「未经确认」,下游不得静默当已确认。反之(origin='user' / null)brief 不带标注。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const RECONSTRUCTED_MARK = "未经你确认";

// 一个只装了 positioning(兜底空)+ thesis reader + artifactOrigin reader 的最小 deps。
function makeDeps(
  thesisOrigin: "user" | "reconstructed" | null,
): ContextDeps {
  return {
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    thesis: {
      // 非空论点树(有内容才会被标注;空 brief 不标)。
      getThesisNodes: async () => [
        { column: "core", title: "核心论点", summary: "这条视频的主张" },
        { column: "support", title: "支撑一", summary: "论据" },
      ],
    },
    artifactOrigin: {
      getArtifactOrigin: async (
        _c: RequestContext,
        _projectId: string,
        artifactType: string,
      ) => (artifactType === "thesis_tree" ? thesisOrigin : null),
    },
  };
}

describe("creative-context F2 — reconstructed 论点树 brief 显式标注", () => {
  it("origin='reconstructed' → thesisBrief 前缀「未经确认」标注", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      makeDeps("reconstructed"),
    );
    expect(context.thesisBrief).toContain(RECONSTRUCTED_MARK);
    // 原内容仍在(是「标注 + 内容」,不是「排除」——下游还能读到,但不当已确认)。
    expect(context.thesisBrief).toContain("核心论点");
  });

  it("origin='user' → thesisBrief 不带「未经确认」标注(用户已确认前提)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-manual-1", topic: "" },
      makeDeps("user"),
    );
    expect(context.thesisBrief).not.toContain(RECONSTRUCTED_MARK);
    expect(context.thesisBrief).toContain("核心论点");
  });

  it("origin=null(legacy)→ thesisBrief 不带标注", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-legacy-1", topic: "" },
      makeDeps(null),
    );
    expect(context.thesisBrief).not.toContain(RECONSTRUCTED_MARK);
  });

  it("未装配 artifactOrigin reader → 降级为不标注(不阻塞节点)", async () => {
    const deps = makeDeps("reconstructed");
    delete deps.artifactOrigin;
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      deps,
    );
    // 没有 origin reader 就退回 legacy 行为(不标注),但 brief 内容仍在。
    expect(context.thesisBrief).not.toContain(RECONSTRUCTED_MARK);
    expect(context.thesisBrief).toContain("核心论点");
  });
});

// ── T-039a:复盘对象注入(reviewSubject reader → CreativeContext 复盘字段)────────────
// 复盘要「就这一条作品」提炼经验:有 projectId + 装配了 reviewSubject reader 时,assemble 必须把
// 本作品的真标题/文案/数据/评论读进 CreativeContext 的 reviewTitle/reviewScript/reviewMetrics/
// reviewComments。缺 projectId 或未装配 reader → 诚实空(不崩)。单个 reader 方法抛错只让该字段空。
describe("creative-context T-039a — 复盘作品真材料注入", () => {
  const REAL_TITLE = "上下文工程实战复盘";
  const REAL_SCRIPT = "开头三秒抛出「你的 Agent 为什么总断片」的钩子……(逐字稿正文)";
  const REAL_METRICS = "播放：52000 · 点赞：3100 · 评论：420";
  const REAL_COMMENTS = ["这个钩子太强了", "求下集怎么落地"];

  function reviewDeps(
    over: Partial<{
      getTitle: () => Promise<string>;
      getScript: () => Promise<string>;
      getMetricsSummary: () => Promise<string>;
      getComments: () => Promise<string[]>;
    }> = {},
  ): ContextDeps {
    return {
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      },
      reviewSubject: {
        getTitle: over.getTitle ?? (async () => REAL_TITLE),
        getScript: over.getScript ?? (async () => REAL_SCRIPT),
        getMetricsSummary: over.getMetricsSummary ?? (async () => REAL_METRICS),
        getComments: over.getComments ?? (async () => REAL_COMMENTS),
      },
    };
  }

  it("有 projectId + reviewSubject reader → 4 个复盘字段含真值", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      reviewDeps(),
    );
    expect(context.reviewTitle).toBe(REAL_TITLE);
    expect(context.reviewScript).toBe(REAL_SCRIPT);
    expect(context.reviewMetrics).toBe(REAL_METRICS);
    // 评论拼成「· 逐条」列表,含每条真评论文本。
    expect(context.reviewComments).toContain("这个钩子太强了");
    expect(context.reviewComments).toContain("求下集怎么落地");
    expect(context.reviewComments).toContain("· "); // 列表前缀
  });

  it("缺 projectId → 不调 reader,4 个复盘字段全空(诚实兜底,不崩)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "随便一个主题" },
      reviewDeps(),
    );
    expect(context.reviewTitle).toBe("");
    expect(context.reviewScript).toBe("");
    expect(context.reviewMetrics).toBe("");
    expect(context.reviewComments).toBe("");
  });

  it("未装配 reviewSubject reader → 复盘字段全空(其它节点不受影响)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      {
        positioning: {
          getPositioningCenter: async () => ({
            profile: null,
            currentStatement: null,
          }),
        },
      },
    );
    expect(context.reviewTitle).toBe("");
    expect(context.reviewScript).toBe("");
    expect(context.reviewMetrics).toBe("");
    expect(context.reviewComments).toBe("");
  });

  it("单个 reader 方法抛错 → 只让该字段空,其余真值仍在(best-effort 隔离)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      reviewDeps({
        getMetricsSummary: async () => {
          throw new Error("analytics down");
        },
      }),
    );
    expect(context.reviewMetrics).toBe(""); // 挂的这个空
    expect(context.reviewTitle).toBe(REAL_TITLE); // 其余不受牵连
    expect(context.reviewScript).toBe(REAL_SCRIPT);
    expect(context.reviewComments).toContain("这个钩子太强了");
  });

  it("评论里空串/空白被过滤,只保留非空真评论", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      reviewDeps({
        getComments: async () => ["  ", "", "真评论一条"],
      }),
    );
    expect(context.reviewComments).toBe("· 真评论一条");
  });
});

// ── T-079c:knowledgeBrief 分段(SPEC 2026-07-03-knowledge-asset-redesign §3)────────
// 喂料从扁平 title 列表升级为按四原子分段 + 战绩排序:【我的观点】claim top5 /
// 【证据】evidence top5(带出处)/【金句】quote top5;各段空则「(暂无)」;
// qa/reference/旧类型不进 brief;title 截 80。
describe("creative-context T-079c — formatKnowledgeBrief 分段纯函数", () => {
  it("三段头齐全;claim 带「被 N 条内容用过」;evidence 带出处;quote 只列本体", () => {
    const brief = formatKnowledgeBrief([
      { title: "上下文工程是第一性问题", knowledgeType: "claim", usedCount: 3 },
      {
        title: "截断策略提升成功率 18%",
        knowledgeType: "evidence",
        usedCount: 1,
        sourceNote: "本账号 6/30 复盘",
      },
      { title: "别喂模型垃圾,它会照单全收", knowledgeType: "quote" },
    ]);
    expect(brief).toContain("【我的观点】");
    expect(brief).toContain("【证据】");
    expect(brief).toContain("【金句】");
    expect(brief).toContain("· 上下文工程是第一性问题（被 3 条内容用过）");
    expect(brief).toContain(
      "· 截断策略提升成功率 18%（出处：本账号 6/30 复盘）（被 1 条内容用过）",
    );
    expect(brief).toContain("· 别喂模型垃圾,它会照单全收");
  });

  it("战绩排序:usedInPublished 优先于 usedCount;每段截 top5", () => {
    const claims = [
      { title: "引用 9 次未发布", knowledgeType: "claim", usedCount: 9 },
      {
        title: "引用 1 次但已发布",
        knowledgeType: "claim",
        usedCount: 1,
        usedInPublished: true,
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        title: `无战绩观点 ${i}`,
        knowledgeType: "claim",
      })),
    ];
    const brief = formatKnowledgeBrief(claims);
    const claimSection = brief.split("【证据】")[0]!;
    const lines = claimSection.split("\n").filter((l) => l.startsWith("· "));
    expect(lines).toHaveLength(5); // top5 截断
    expect(lines[0]).toContain("引用 1 次但已发布"); // 最硬战绩排最前
    expect(lines[1]).toContain("引用 9 次未发布");
  });

  it("某段无内容 → 该段落「(暂无)」;qa/reference/旧类型不进 brief", () => {
    const brief = formatKnowledgeBrief([
      { title: "只有一条观点", knowledgeType: "claim" },
      { title: "评论区问题", knowledgeType: "qa" },
      { title: "原文存档", knowledgeType: "reference" },
      { title: "旧笔记", knowledgeType: "note" },
    ]);
    expect(brief).toContain("· 只有一条观点");
    expect(brief).toContain("【证据】\n（暂无）");
    expect(brief).toContain("【金句】\n（暂无）");
    expect(brief).not.toContain("评论区问题"); // qa 走评论信号消费
    expect(brief).not.toContain("原文存档"); // reference 是存档
    expect(brief).not.toContain("旧笔记");
  });

  it("库全空 → 空串(下游 facet 整段省略,不注(暂无)空壳)", () => {
    expect(formatKnowledgeBrief([])).toBe("");
  });

  it("title 超 80 字截断防爆", () => {
    const long = "长".repeat(120);
    const brief = formatKnowledgeBrief([
      { title: long, knowledgeType: "claim" },
    ]);
    expect(brief).toContain(`· ${"长".repeat(80)}…`);
    expect(brief).not.toContain("长".repeat(81));
  });

  it("assembleCreativeContext:knowledgeBrief 走分段组装(集成缝)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "" },
      {
        positioning: {
          getPositioningCenter: async () => ({
            profile: null,
            currentStatement: null,
          }),
        },
        knowledge: {
          list: async () => [
            { title: "观点甲", knowledgeType: "claim", usedCount: 2 },
          ],
        },
      },
    );
    expect(context.knowledgeBrief).toContain("【我的观点】");
    expect(context.knowledgeBrief).toContain("· 观点甲（被 2 条内容用过）");
  });
});

// ── T-146 切片 c/d:用户上传素材主权(硬约束注入 + 搜索结合)────────────────────────
// 高优先(priority=high,用户第一手)素材的要点卡(keyPoints/facts/sellingPoints)进
// userMaterialHardBrief(下游套「必须遵守」硬约束段);normal(AI 找的)进 userMaterialRefBrief
// (参考级)。有全文无要点卡 → 截断兜底进 brief。解析失败(extractStatus=failed/unsupported)
// 的素材绝不进 AI 上下文冒充可读。materialQueryTerms 从高优先要点卡抽关键词供 query 扩展。
describe("creative-context T-146 — formatUserMaterialBrief 纯函数", () => {
  const highDoc: ProjectMaterial = {
    name: "产品资料.pdf",
    priority: "high",
    extractStatus: "done",
    materialSummary: {
      keyPoints: ["续航 20 小时"],
      facts: ["机身重 180g"],
      sellingPoints: ["静音降噪"],
    },
  };

  it("high 素材 → 「最高优先 · 必须遵守」硬约束头 + 三类要点(要点/事实/卖点)", () => {
    const brief = formatUserMaterialBrief([highDoc], "high");
    expect(brief).toContain("最高优先");
    expect(brief).toContain("必须遵守");
    expect(brief).toContain("续航 20 小时");
    expect(brief).toContain("机身重 180g");
    expect(brief).toContain("静音降噪");
    // 素材名带出(可追溯是哪份资料)
    expect(brief).toContain("产品资料.pdf");
  });

  it("normal 素材 → 参考段(不带「最高优先 · 必须遵守」硬约束头)", () => {
    const normalDoc: ProjectMaterial = {
      name: "竞品调研.md",
      priority: "normal",
      extractStatus: "done",
      materialSummary: { keyPoints: ["竞品普遍 15 小时"], facts: [] },
    };
    const brief = formatUserMaterialBrief([normalDoc], "normal");
    expect(brief).toContain("竞品普遍 15 小时");
    expect(brief).not.toContain("最高优先 · 必须遵守");
  });

  it("有全文无要点卡(未配摘要模型降级)→ 截断全文进 brief 兜底", () => {
    const noSummary: ProjectMaterial = {
      name: "长文.txt",
      priority: "high",
      extractStatus: "done",
      extractedText: "这是一份很长的资料".repeat(500),
    };
    const brief = formatUserMaterialBrief([noSummary], "high");
    expect(brief).toContain("这是一份很长的资料");
    // 截断(不把上万字全灌进 prompt)
    expect(brief.length).toBeLessThan(3000);
  });

  it("解析失败/不支持的素材不进 brief(不冒充可读)", () => {
    const failed: ProjectMaterial = {
      name: "扫描件.pdf",
      priority: "high",
      extractStatus: "failed",
    };
    const unsupported: ProjectMaterial = {
      name: "老 .doc",
      priority: "high",
      extractStatus: "unsupported",
    };
    expect(formatUserMaterialBrief([failed, unsupported], "high")).toBe("");
  });

  it("空列表 → 空串(下游整段省略)", () => {
    expect(formatUserMaterialBrief([], "high")).toBe("");
  });

  it("materialQueryTerms 从高优先要点卡抽关键词(供 query 扩展)", () => {
    const terms = materialQueryTerms([highDoc]);
    // 要点/卖点原文成为可拼进 query 的词条
    expect(terms.join(" ")).toContain("续航 20 小时");
    expect(terms.join(" ")).toContain("静音降噪");
  });

  it("materialQueryTerms 只取 high 优先(normal 不扩展 query)", () => {
    const normalDoc: ProjectMaterial = {
      name: "n.md",
      priority: "normal",
      extractStatus: "done",
      materialSummary: { keyPoints: ["NORMAL_KEYWORD"], facts: [] },
    };
    const terms = materialQueryTerms([normalDoc, highDoc]);
    expect(terms.join(" ")).not.toContain("NORMAL_KEYWORD");
    expect(terms.join(" ")).toContain("续航 20 小时");
  });
});

describe("creative-context T-146 — assembleCreativeContext 装配 projectMaterials", () => {
  function makeDeps(materials: ProjectMaterial[]): ContextDeps {
    return {
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      },
      projectMaterials: {
        listProjectMaterials: async () => materials,
      },
    };
  }

  const highDoc: ProjectMaterial = {
    name: "PR资料.pdf",
    priority: "high",
    extractStatus: "done",
    materialSummary: { keyPoints: ["核心卖点 A"], facts: ["数据 B"] },
  };
  const normalDoc: ProjectMaterial = {
    name: "AI找的.md",
    priority: "normal",
    extractStatus: "done",
    materialSummary: { keyPoints: ["参考 C"], facts: [] },
  };

  it("有 projectId + reader → high 进 hardBrief、normal 进 refBrief、query terms 来自 high", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "带货" },
      makeDeps([highDoc, normalDoc]),
    );
    expect(context.userMaterialHardBrief).toContain("核心卖点 A");
    expect(context.userMaterialHardBrief).toContain("必须遵守");
    expect(context.userMaterialRefBrief).toContain("参考 C");
    expect(context.userMaterialRefBrief).not.toContain("必须遵守");
    // query terms 只从 high 抽
    expect(context.userMaterialQueryTerms.join(" ")).toContain("核心卖点 A");
    expect(context.userMaterialQueryTerms.join(" ")).not.toContain("参考 C");
  });

  it("缺 projectId → 不调 reader,三个字段空兜底", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "x" },
      makeDeps([highDoc]),
    );
    expect(context.userMaterialHardBrief).toBe("");
    expect(context.userMaterialRefBrief).toBe("");
    expect(context.userMaterialQueryTerms).toEqual([]);
  });

  it("未装配 projectMaterials reader → 字段空(其它节点不受影响)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "x" },
      {
        positioning: {
          getPositioningCenter: async () => ({
            profile: null,
            currentStatement: null,
          }),
        },
      },
    );
    expect(context.userMaterialHardBrief).toBe("");
    expect(context.userMaterialRefBrief).toBe("");
    expect(context.userMaterialQueryTerms).toEqual([]);
  });

  it("reader 抛错 → 诚实降级空(never block)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "x" },
      {
        positioning: {
          getPositioningCenter: async () => ({
            profile: null,
            currentStatement: null,
          }),
        },
        projectMaterials: {
          listProjectMaterials: async () => {
            throw new Error("db down");
          },
        },
      },
    );
    expect(context.userMaterialHardBrief).toBe("");
    expect(context.userMaterialRefBrief).toBe("");
  });
});

describe("markReconstructedBrief — 纯函数", () => {
  it("reconstructed + 非空 → 加标注", () => {
    expect(markReconstructedBrief("内容", "reconstructed")).toContain(
      RECONSTRUCTED_MARK,
    );
  });
  it("user / null → 原样返回", () => {
    expect(markReconstructedBrief("内容", "user")).toBe("内容");
    expect(markReconstructedBrief("内容", null)).toBe("内容");
    expect(markReconstructedBrief("内容", undefined)).toBe("内容");
  });
  it("空 brief → 原样返回(无内容不标)", () => {
    expect(markReconstructedBrief("", "reconstructed")).toBe("");
  });
});

// ── [T-136 切片 ④ · SPEC §D] AI 上下文 per-account ──────────────────────────────
// creative-context 层对 ctx 是纯透传:assembleCreativeContext(ctx, …) 把同一个 ctx
// 逐个传给每个 reader,reader 再交给底层 module service(positioning/learnings/candidate/
// knowledge/… 的 repo 门已按 ctx.accountId 收窄)。故「同一 topic.generate 在不同号下注入
// 不同定位 / 受众 / 经验」= ctx.accountId 一路透传到每个 reader,无遗漏。本测两件事:
//   ① 透传无遗漏:每个装配的 reader 都收到带 accountId 的 ctx(漏一个 = 该维度跨号串味)。
//   ② 按号即换约束:positioning reader 依 ctx.accountId 返回不同母版 → positioningBrief 随号变。
describe("creative-context per-account — ctx.accountId 透传到每个 reader(§D)", () => {
  it("每个 reader 都收到带 accountId 的 ctx(透传无遗漏)", async () => {
    const seenAccountIds: Record<string, string | null | undefined> = {};
    const record = (key: string) => (c: RequestContext) => {
      seenAccountIds[key] = c.accountId;
    };
    const ctxAcc: RequestContext = {
      userId: "u1",
      requestId: "r1",
      source: "user",
      accountId: "acc-tech",
    };
    const deps: ContextDeps = {
      positioning: {
        getPositioningCenter: async (c) => {
          record("positioning")(c);
          return { profile: null, currentStatement: null };
        },
      },
      learnings: {
        getSuggestions: async (c) => {
          record("learnings")(c);
          return [];
        },
      },
      assets: {
        list: async (c) => {
          record("assets")(c);
          return [];
        },
      },
      accounts: {
        list: async (c) => {
          record("accounts")(c);
          return [];
        },
      },
      signals: {
        list: async (c) => {
          record("signals")(c);
          return [];
        },
      },
      knowledge: {
        list: async (c) => {
          record("knowledge")(c);
          return [];
        },
      },
    };

    await assembleCreativeContext(
      ctxAcc,
      { projectId: "proj-1", topic: "选题" },
      deps,
    );

    // 每个装配的 reader 都必须收到当前号 —— 漏一个即该维度跨号串味。
    for (const key of [
      "positioning",
      "learnings",
      "assets",
      "accounts",
      "signals",
      "knowledge",
    ]) {
      expect(seenAccountIds[key]).toBe("acc-tech");
    }
  });

  it("按号换约束:不同 accountId → positioningBrief 注入不同定位", async () => {
    // positioning reader 模拟底层 service 已按号:依 ctx.accountId 返回不同母版。
    const byAccount: Record<string, string> = {
      "acc-tech": "硬核科技号",
      "acc-food": "家常美食号",
    };
    const deps: ContextDeps = {
      positioning: {
        getPositioningCenter: async (c) => ({
          profile: {
            persona: byAccount[c.accountId ?? ""] ?? "",
            field: "",
            audience: "",
            differentiation: "",
            capabilities: [],
          },
          currentStatement: null,
        }),
      },
    };

    const techCtx: RequestContext = {
      userId: "u1",
      requestId: "r1",
      source: "user",
      accountId: "acc-tech",
    };
    const foodCtx: RequestContext = { ...techCtx, accountId: "acc-food" };

    const techContext = await assembleCreativeContext(
      techCtx,
      { projectId: null, topic: "选题" },
      deps,
    );
    const foodContext = await assembleCreativeContext(
      foodCtx,
      { projectId: null, topic: "选题" },
      deps,
    );

    // 同一 topic.generate,切号 → 注入的定位不同(§D 端到端语义)。
    expect(techContext.positioningBrief).toContain("硬核科技号");
    expect(foodContext.positioningBrief).toContain("家常美食号");
    expect(techContext.positioningBrief).not.toBe(foodContext.positioningBrief);
  });
});

// ── [T-186] L3 策展护栏:知识注入相关性检索 + token 预算截断 ────────────────────────
// 目标:知识注入从「最近 40 条 dump」升级为「按当前选题/定位 query 相关性检索 + 超预算诚实截断」。
// 覆盖:①有 search 端口 + query → 走相关性检索路径(不用 list dump);②无 query/无命中 → 退回 list
// dump(降级);③query 派生 scope 感知(选题优先、无选题退定位);④超预算 → 截断且标注。

describe("creative-context T-186 — buildKnowledgeQuery scope 感知派生", () => {
  it("有选题 → 用选题(+angle),项目态最相关", () => {
    expect(
      buildKnowledgeQuery({ topic: " 上下文工程 ", angle: " 反直觉 " }, "定位一句话：硬核 AI"),
    ).toBe("上下文工程 反直觉");
  });
  it("无选题 → 退定位领域(全局态),截 80 字", () => {
    const pos = "定位一句话：硬核 AI 创作者   关键词：AI、Agent";
    expect(buildKnowledgeQuery({ topic: "", angle: "" }, pos)).toBe(
      pos.replace(/\s+/g, " ").trim().slice(0, 80),
    );
  });
  it("选题与定位都空 → 空串(装配层据此退回 list dump)", () => {
    expect(buildKnowledgeQuery({ topic: "  ", angle: "" }, "   ")).toBe("");
  });
});

describe("creative-context T-186 — truncateKnowledgeBriefToBudget", () => {
  it("未超预算 → 原样返回", () => {
    const brief = "【我的观点】\n· 短观点";
    expect(truncateKnowledgeBriefToBudget(brief, 1000)).toBe(brief);
  });
  it("超预算 → 按行截断 + 诚实标注省略行数", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `· 第 ${i} 行知识点`);
    const brief = lines.join("\n");
    const out = truncateKnowledgeBriefToBudget(brief, 40);
    expect(out).toContain("已按 token 预算截断");
    expect(out).toContain("省略");
    // 截断后长度受控(留有余量给标注行);至少保留 1 行内容。
    expect(out.split("\n")[0]).toBe("· 第 0 行知识点");
  });
  it("预算极小也至少保留首行,不返回空", () => {
    const brief = "· 唯一有用的一行\n· 第二行";
    const out = truncateKnowledgeBriefToBudget(brief, 1);
    expect(out.split("\n")[0]).toBe("· 唯一有用的一行");
  });
});

describe("creative-context T-186 — assembleCreativeContext 相关性检索接线", () => {
  const baseCtx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

  // 只装 positioning(空兜底)+ knowledge(list + 可选 search)的最小 deps。
  function makeKnowledgeDeps(knowledge: ContextDeps["knowledge"]): ContextDeps {
    return {
      positioning: {
        getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
      },
      knowledge,
    };
  }

  it("有 search 端口 + 非空选题 → 走相关性检索(不落 list dump)", async () => {
    const calls: { search: string[]; list: number } = { search: [], list: 0 };
    const relevantRows: KnowledgeRow[] = [
      { title: "相关观点甲", knowledgeType: "claim", usedCount: 2 },
    ];
    const context = await assembleCreativeContext(
      baseCtx,
      { projectId: "p1", topic: "上下文工程", angle: "反直觉" },
      makeKnowledgeDeps({
        list: async () => {
          calls.list += 1;
          return [{ title: "最近 dump 项", knowledgeType: "claim" }];
        },
        search: async (_c, query) => {
          calls.search.push(query);
          return relevantRows;
        },
      }),
    );
    // 检索路径命中 → 用相关性结果,未退回 dump。
    expect(calls.search).toEqual(["上下文工程 反直觉"]);
    expect(calls.list).toBe(0);
    expect(context.knowledgeBrief).toContain("· 相关观点甲（被 2 条内容用过）");
    expect(context.knowledgeBrief).not.toContain("最近 dump 项");
  });

  it("检索无命中 → 退回 list dump(诚实降级)", async () => {
    const calls: { search: number; list: number } = { search: 0, list: 0 };
    const context = await assembleCreativeContext(
      baseCtx,
      { projectId: "p1", topic: "冷门选题" },
      makeKnowledgeDeps({
        list: async () => {
          calls.list += 1;
          return [{ title: "兜底 dump 观点", knowledgeType: "claim" }];
        },
        search: async () => {
          calls.search += 1;
          return []; // 无命中
        },
      }),
    );
    expect(calls.search).toBe(1);
    expect(calls.list).toBe(1);
    expect(context.knowledgeBrief).toContain("兜底 dump 观点");
  });

  it("无 search 端口(旧绑定) → 仍走 list dump(向后兼容)", async () => {
    let listCalls = 0;
    const context = await assembleCreativeContext(
      baseCtx,
      { projectId: "p1", topic: "任意选题" },
      makeKnowledgeDeps({
        list: async () => {
          listCalls += 1;
          return [{ title: "无 search 端口 dump", knowledgeType: "claim" }];
        },
      }),
    );
    expect(listCalls).toBe(1);
    expect(context.knowledgeBrief).toContain("无 search 端口 dump");
  });

  it("超预算 → knowledgeBrief 被截断且带标注", async () => {
    // formatKnowledgeBrief 每条截 80 字、每段 top5;要触发预算需喂满 3 段长内容(尤其 evidence
    // 带 80 字出处 → 单行 ~170 字)。造 5 evidence(长标题+长出处)+ 5 claim + 5 quote → 输出超 1800。
    const long = "长".repeat(80);
    const rows: KnowledgeRow[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({
        title: `${long}${i}`,
        knowledgeType: "evidence",
        usedCount: 3,
        sourceNote: `${long}出处${i}`,
      });
      rows.push({ title: `${long}claim${i}`, knowledgeType: "claim", usedCount: 2 });
      rows.push({ title: `${long}quote${i}`, knowledgeType: "quote" });
    }
    const context = await assembleCreativeContext(
      baseCtx,
      { projectId: "p1", topic: "选题" },
      makeKnowledgeDeps({
        list: async () => [],
        search: async () => rows,
      }),
    );
    // 前置 sanity:原始 brief 确实超预算(否则该用例失去意义)。
    expect(formatKnowledgeBrief(rows).length).toBeGreaterThan(
      KNOWLEDGE_BRIEF_BUDGET_CHARS,
    );
    expect(context.knowledgeBrief).toContain("已按 token 预算截断");
  });
});

// ── [T-240①] formatProjectStageBlock —— 项目阶段判据纯函数(「场景」一等机制的动态层)──
describe("[T-240①] formatProjectStageBlock — 阶段判据渲染", () => {
  it("未发布 → 「创作前(未发布)」+ 明示「没有逐字稿是正常状态」(治创作前被按复盘套路要稿)", async () => {
    const { formatProjectStageBlock } = await import("./creative-context");
    const block = formatProjectStageBlock({ stage: "planning", published: false });
    expect(block).toContain("当前项目阶段:创作前(未发布)");
    expect(block).toContain("(stage=planning)");
    expect(block).toContain("没有逐字稿是正常状态");
    expect(block).toContain("不要向用户索要逐字稿");
  });

  it("已发布 → 「已发布(可复盘)」+ 拆解必须读真逐字稿/真实指标", async () => {
    const { formatProjectStageBlock } = await import("./creative-context");
    const block = formatProjectStageBlock({ stage: "review", published: true });
    expect(block).toContain("当前项目阶段:已发布(可复盘)");
    expect(block).toContain("context.artifact.text");
    expect(block).toContain("context.metrics");
  });

  it("stage 空串 → 不渲 stage 括注(不喂空噪声)", async () => {
    const { formatProjectStageBlock } = await import("./creative-context");
    const block = formatProjectStageBlock({ stage: "", published: false });
    expect(block).not.toContain("(stage=");
    expect(block).toContain("创作前(未发布)");
  });
});
