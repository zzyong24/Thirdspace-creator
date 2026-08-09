import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  assembleCreativeContext,
  formatKnowledgeBrief,
  formatUserMaterialBrief,
  materialQueryTerms,
  markReconstructedBrief,
  renderProjectBriefHard,
  renderBenchmarkRef,
  buildKnowledgeQuery,
  formatWorksBrief,
  truncateKnowledgeBriefToBudget,
  KNOWLEDGE_BRIEF_BUDGET_CHARS,
  type ContextDeps,
  type KnowledgeRow,
  type ProjectMaterial,
} from "./creative-context";

describe("[T-521] 作品事实与旧动态状态隔离", () => {
  it("80 条 imported 已发布作品的 review 只表达人话“复盘”，不出现审核/未发布语义", () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({
      title: `已发布作品 ${index + 1}`,
      source: "imported",
      stage: "review",
      status: "completed",
      publishedAt: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));

    const brief = formatWorksBrief(rows, rows.length);

    expect(brief.match(/（已发布 · 复盘）/g)).toHaveLength(80);
    expect(brief).not.toMatch(/\breview\b/i);
    expect(brief).not.toContain("待审核");
    expect(brief).not.toContain("未发布");
  });

  it("定位母版即使仍存旧“49 条 review 未发”，也绝不进入任何 AI 上下文", async () => {
    const context = await assembleCreativeContext(
      { ...ctx, accountId: "account-a" },
      { projectId: null, topic: "" },
      {
        positioning: {
          getPositioningCenter: async () => ({
            profile: {
              persona: "AI 工程创作者",
              field: "AI 工程",
              audience: "开发者",
              differentiation: "真实实测",
              capabilities: ["实测"],
              facets: {
                statusNote: "49 条稿子压在 review，一直未发布",
              },
            },
            currentStatement: null,
          }),
        },
      },
    );

    expect(context.positioningBrief).toContain("AI 工程创作者");
    expect(context.positioningBrief).not.toContain("49");
    expect(context.positioningBrief).not.toMatch(/\breview\b/i);
    expect(context.positioningBrief).not.toContain("未发布");
  });
});

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

describe("creative-context T-733 — 只消费 reader 已放行的显式采用论点", () => {
  it("项目态把 adopted reader 返回的四栏论点装入 thesisBrief", async () => {
    const deps = makeDeps("user");
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-adopted", topic: "当前选题" },
      deps,
    );

    expect(context.thesisBrief).toContain("[core] 核心论点");
    expect(context.thesisBrief).toContain("[support] 支撑一");
    expect(context.topic.title).toBe("当前选题");
  });

  it("无项目上下文不读取论点", async () => {
    let reads = 0;
    const deps = makeDeps("user");
    deps.thesis = {
      getThesisNodes: async () => {
        reads += 1;
        return [{ column: "core", title: "不应读取", summary: "" }];
      },
    };
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "账号态选题" },
      deps,
    );
    expect(context.thesisBrief).toBe("");
    expect(reads).toBe(0);
  });

  it("reader 对未采用历史版本返回空节点时保持零消费", async () => {
    const deps = makeDeps(null);
    deps.thesis = { getThesisNodes: async () => [] };

    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-legacy", topic: "历史项目" },
      deps,
    );

    expect(context.thesisBrief).toBe("");
    expect(context.topic.title).toBe("历史项目");
  });

  it("adopted reader 失败时 fail closed，且不阻断其余创作上下文", async () => {
    const deps = makeDeps("user");
    deps.thesis = {
      getThesisNodes: async () => {
        throw new Error("artifact unavailable");
      },
    };

    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-error", topic: "继续写稿" },
      deps,
    );

    expect(context.thesisBrief).toBe("");
    expect(context.topic.title).toBe("继续写稿");
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
    expect(lines).toHaveLength(8); // [T-431] top15:8 条全显(不再截 top5)
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

  it("title 超 200 字截断防爆", () => {
    const long = "长".repeat(250);
    const brief = formatKnowledgeBrief([
      { title: long, knowledgeType: "claim" },
    ]);
    expect(brief).toContain(`· ${"长".repeat(200)}…`); // [T-431] 上限提到 200(claim 标题常是整句)
    expect(brief).not.toContain("长".repeat(201));
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

  it("有全文无要点卡(未配摘要模型降级)→ 全文进 brief 兜底(1M 上下文不截断)", () => {
    const noSummary: ProjectMaterial = {
      name: "长文.txt",
      priority: "high",
      extractStatus: "done",
      extractedText: "这是一份很长的资料".repeat(500), // 4500 字,远低于 20 万上限
    };
    const brief = formatUserMaterialBrief([noSummary], "high");
    expect(brief).toContain("这是一份很长的资料");
    // [T-431] 第一手素材是真数据底座,4500 字整篇进 brief,不再砍到 1200(不含「已截断」标注)。
    expect(brief).not.toContain("已截断");
    expect(brief.length).toBeGreaterThan(4500);
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

  it("大知识库 → 全量注入不再预算截断([T-431] TOP_N=15/TITLE_MAX=200 收窄后 brief 够不到预算)", async () => {
    // [T-431] 旧 TOP_N=5/TITLE_MAX=80+预算1800 会触发截断;现 TOP_N=15/TITLE_MAX=200 下单 brief
    // 上限 ~19000 字 < 40000 预算,正常知识库整段进不被裁。预算截断机制本身由
    // truncateKnowledgeBriefToBudget 纯函数用例(硬编码预算)独立覆盖。造 5 evidence+5 claim+5 quote。
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
    // 放宽后原始 brief 在预算内 → 不触发预算截断。
    expect(formatKnowledgeBrief(rows).length).toBeLessThan(
      KNOWLEDGE_BRIEF_BUDGET_CHARS,
    );
    expect(context.knowledgeBrief).not.toContain("已按 token 预算截断");
    // 全量注入:三段的原子都在(不再 top5 截)。
    expect(context.knowledgeBrief).toContain(`${long}claim0`);
    expect(context.knowledgeBrief).toContain(`${long}quote4`);
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

// [T-270] 立项 Brief 硬锚 —— 端口扩投影不丢字段 + renderProjectBriefHard 渲染 + 仅项目态注入。
describe("[T-270] renderProjectBriefHard — 立项 Brief 硬约束段渲染", () => {
  it("全核心字段 → 渲成「必须遵守」硬约束段(核心信息=钦定主张、内容目标含负向约束)", () => {
    const block = renderProjectBriefHard({
      coreMessage: "AI 编码熵增定律:纪律是最后护城河",
      contentGoal: "讲清纪律的价值;避免做成工具分享",
      contentFormat: "观点向口播(非教程)",
      targetAudience: "用 AI 写代码的开发者",
      successCriteria: "引发对纪律的讨论",
    });
    expect(block).toContain("必须遵守");
    expect(block).toContain("钦定主张");
    expect(block).toContain("纪律是最后护城河");
    expect(block).toContain("负向硬约束");
    expect(block).toContain("避免做成工具分享");
    expect(block).toContain("观点向口播(非教程)");
    expect(block).toContain("用 AI 写代码的开发者");
  });

  it("只有部分字段 → 只渲有值的行(空字段整行省略)", () => {
    const block = renderProjectBriefHard({ coreMessage: "只写核心信息" });
    expect(block).toContain("只写核心信息");
    expect(block).not.toContain("内容目标");
    expect(block).not.toContain("目标观众");
  });

  it("全空 / null → 空串(下游整段省略,不注空壳)", () => {
    expect(renderProjectBriefHard(null)).toBe("");
    expect(renderProjectBriefHard({})).toBe("");
    expect(
      renderProjectBriefHard({ coreMessage: "   ", contentGoal: "" }),
    ).toBe("");
  });
});

describe("[T-270] assembleCreativeContext — projectBriefHard 仅项目态注入", () => {
  const briefDeps = (): ContextDeps => ({
    positioning: {
      getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
    },
    // 端口扩投影:reader 回全字段(不再只回 orientation),装配层据此渲硬锚。
    brief: {
      getBriefDetail: async () => ({
        orientation: "portrait" as const,
        coreMessage: "纪律是最后护城河",
        contentGoal: "避免做成工具分享",
        contentFormat: "观点向口播",
        targetAudience: "AI 开发者",
        successCriteria: "引发讨论",
      }),
    },
  });

  it("有 projectId + brief reader → projectBriefHard 渲染(含核心信息 + 避免X)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      briefDeps(),
    );
    expect(context.projectBriefHard).toContain("纪律是最后护城河");
    expect(context.projectBriefHard).toContain("避免做成工具分享");
    // 画幅一次读取两用:orientationHint 也从同一 detail 拿到。
    expect(context.orientationHint).toBe("竖屏");
  });

  it("账号态(projectId=null)→ projectBriefHard 空串(不项目化,守选题链边界)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "某选题" },
      briefDeps(),
    );
    expect(context.projectBriefHard).toBe("");
  });

  it("未装配 brief reader → projectBriefHard 空串(降级不阻塞)", async () => {
    const deps = briefDeps();
    delete deps.brief;
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      deps,
    );
    expect(context.projectBriefHard).toBe("");
  });
});

// [T-284a] 复刻补链 G1 —— renderBenchmarkRef 渲染(带诚实门段头)+ assembleCreativeContext
//   仅复刻项目态注入 benchmarkRefBrief(非复刻/账号态空,不污染)。
describe("[T-284a] renderBenchmarkRef — 对标参照·复刻用段渲染(诚实门)", () => {
  it("全 5 段 → 渲成参照段,段头带「禁照搬原文案」诚实门", () => {
    const block = renderBenchmarkRef({
      钩子拆解: "开头抛反常识",
      结构拆解: "总分总",
      为什么爆: "信息增量高 + 情绪反差",
      可借鉴点: ["数字钩子", "反差结尾"],
      适配本账号建议: "换本账号真实案例重做",
    });
    // 诚实门:仅结构参照、严禁照搬原文案/原标题。
    expect(block).toContain("复刻用");
    expect(block).toContain("严禁照搬原文案");
    expect(block).toContain("原爆款为什么爆：信息增量高 + 情绪反差");
    expect(block).toContain("结构拆解：总分总");
    expect(block).toContain("钩子拆解：开头抛反常识");
    expect(block).toContain("可借鉴点：数字钩子；反差结尾");
    expect(block).toContain("适配本账号建议：换本账号真实案例重做");
  });

  it("只有部分段 → 只渲有值行;全空 / null → 空串(不注空壳)", () => {
    const partial = renderBenchmarkRef({ 为什么爆: "只有为什么爆" });
    expect(partial).toContain("只有为什么爆");
    expect(partial).not.toContain("结构拆解");
    expect(renderBenchmarkRef(null)).toBe("");
    expect(renderBenchmarkRef(undefined)).toBe("");
    expect(renderBenchmarkRef({})).toBe("");
    expect(renderBenchmarkRef({ 为什么爆: "  ", 可借鉴点: [] })).toBe("");
  });
});

describe("[T-284a] assembleCreativeContext — benchmarkRefBrief 仅复刻项目态注入", () => {
  const refDeps = (benchmarkRef?: {
    钩子拆解?: string;
    结构拆解?: string;
    为什么爆?: string;
    可借鉴点?: string[];
    适配本账号建议?: string;
  }): ContextDeps => ({
    positioning: {
      getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
    },
    brief: {
      getBriefDetail: async () => ({
        coreMessage: "本账号主张",
        benchmarkRef,
      }),
    },
  });

  it("复刻项目(briefDetail.benchmarkRef 非空)→ benchmarkRefBrief 渲染(带诚实门)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      refDeps({ 为什么爆: "信息增量高", 结构拆解: "总分总" }),
    );
    expect(context.benchmarkRefBrief).toContain("信息增量高");
    expect(context.benchmarkRefBrief).toContain("严禁照搬原文案");
  });

  it("非复刻项目(briefDetail 无 benchmarkRef)→ benchmarkRefBrief 空串(不污染普通创作)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      refDeps(undefined),
    );
    expect(context.benchmarkRefBrief).toBe("");
  });

  it("账号态(projectId=null)→ benchmarkRefBrief 空串(选题链边界)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "某选题" },
      refDeps({ 为什么爆: "信息增量高" }),
    );
    expect(context.benchmarkRefBrief).toBe("");
  });
});

describe("[T-642] assembleCreativeContext — 内容雷达创作依据进入标准写稿链", () => {
  const evidence = {
    sourceReferences: [{
      kind: "original_video" as const,
      platform: "douyin",
      label: "原视频",
      url: "https://www.douyin.com/video/1",
      intelligenceItemId: "item-1",
    }],
    decomposition: {
      hook: "反常识开场",
      structureSteps: ["指出误区", "给出判断顺序"],
      coreClaims: ["工作流稳定性优先"],
      reusablePattern: "反常识—拆条件—给顺序",
      factRisks: ["数字待核验"],
    },
    strategy: {
      keep: ["判断顺序"],
      replace: ["替换来源案例"],
      add: ["加入本账号项目经验"],
      avoid: ["不照搬原句"],
    },
    adaptedDraftSeed: {
      contentText: "这是本账号改写初稿",
      generatedFromTranscriptHash: "sha256:test",
      strategyHash: "sha256:strategy",
      templateVersion: "intelligence-topic-v2",
    },
  };

  it("注入确认策略和 hash 校验后的来源逐字稿", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-radar", topic: "工作流选题" },
      {
        positioning: {
          getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
        },
        brief: { getBriefDetail: async () => ({ contentRadarEvidence: evidence }) },
        projectIntelligence: {
          getSourceContexts: async () => [{
            item: {
              title: "来源作品",
              canonicalUrl: "https://www.douyin.com/video/1",
              authorName: "原作者",
            },
            transcript: { text: "这是经校验的完整来源逐字稿", hash: "sha256:test" },
          }],
        },
      },
    );
    expect(context.projectIntelligenceBrief).toContain("本次创作依据·内容雷达");
    expect(context.projectIntelligenceBrief).toContain("替换来源案例");
    expect(context.projectIntelligenceBrief).toContain("这是经校验的完整来源逐字稿");
  });

  it("雷达项目有证据但来源引用缺失时阻断，不允许退化成只按定位写", async () => {
    await expect(
      assembleCreativeContext(
        ctx,
        { projectId: "proj-radar", topic: "工作流选题" },
        {
          positioning: {
            getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
          },
          brief: { getBriefDetail: async () => ({ contentRadarEvidence: evidence }) },
          projectIntelligence: { getSourceContexts: async () => [] },
        },
      ),
    ).rejects.toThrow("不能退化为仅按定位生成稿件");
  });
});

// ── [T-382] 当前选中号标注(accountsBrief ⭐ + currentAccountLine)───────────────────
// 治实录病例:两个号并列进画像、没标哪个是 ctx.accountId 指向的当前号 → 编导答「没法判断
// 你登录的是哪个号」。装配层据 reader 行 id 与 ctx.accountId 匹配:命中行标「⭐当前选中号」
// 且 currentAccountLine 非空;无 ctx.accountId / reader 无 id → 不标(诚实降级,不猜)。
describe("creative-context T-382 — 当前选中号标注", () => {
  const ROWS = [
    {
      id: "acc-1",
      platform: "douyin",
      accountHandle: "@月明水清深",
      followerBaseline: 42000,
    },
    {
      id: "acc-2",
      platform: "douyin",
      accountHandle: "@第二个号",
      followerBaseline: 300,
    },
  ];
  const accountDeps: ContextDeps = {
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    accounts: { list: async () => ROWS },
  };

  it("ctx.accountId 命中行 → 该行标 ⭐当前选中号,其余行不标,currentAccountLine 为当前号一行画像", async () => {
    const context = await assembleCreativeContext(
      { ...ctx, accountId: "acc-1" },
      { projectId: null, topic: "" },
      accountDeps,
    );
    expect(context.accountsBrief).toContain("· ⭐当前选中号 | douyin | @月明水清深 | 粉丝 42000");
    expect(context.accountsBrief).toContain("· douyin | @第二个号 | 粉丝 300");
    expect(context.accountsBrief).not.toContain("⭐当前选中号 | douyin | @第二个号");
    expect(context.currentAccountLine).toBe("douyin | @月明水清深 | 粉丝 42000");
  });

  it("无 ctx.accountId(未选号)→ 不标 ⭐、currentAccountLine 空(诚实,不猜)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "" },
      accountDeps,
    );
    expect(context.accountsBrief).not.toContain("⭐");
    expect(context.currentAccountLine).toBe("");
  });

  it("旧绑定 reader 不回 id → 不标 ⭐(additive 兼容,不崩)", async () => {
    const context = await assembleCreativeContext(
      { ...ctx, accountId: "acc-1" },
      { projectId: null, topic: "" },
      {
        ...accountDeps,
        accounts: {
          list: async () =>
            ROWS.map(({ id: _id, ...rest }) => rest),
        },
      },
    );
    expect(context.accountsBrief).toContain("@月明水清深");
    expect(context.accountsBrief).not.toContain("⭐");
    expect(context.currentAccountLine).toBe("");
  });
});
